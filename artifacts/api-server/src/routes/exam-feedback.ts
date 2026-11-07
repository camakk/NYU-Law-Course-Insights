import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  CreateExamFeedbackBody,
  CreateExamFeedbackResponse,
  ListExamFeedbackQueryParams,
  ListExamFeedbackResponse,
  ReportExamFeedbackParams,
  ReportExamFeedbackResponse,
} from "@workspace/api-zod";
import { db, examFeedbackReportsTable, examFeedbackTable } from "@workspace/db";

const MAX_COMMENTS = 25;
const REPORTS_TO_HIDE = 3;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 20;
const submissionsByFingerprint = new Map<string, number[]>();

function loadValidPairings(): Set<string> {
  const candidates = [
    path.resolve(
      process.cwd(),
      "artifacts/course-insights/public/data/evaluations.json",
    ),
    path.resolve(
      process.cwd(),
      "../course-insights/public/data/evaluations.json",
    ),
    path.resolve(
      process.cwd(),
      "../../artifacts/course-insights/public/data/evaluations.json",
    ),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) {
    throw new Error("Could not locate the bundled course evaluation data.");
  }
  const dataset = JSON.parse(readFileSync(file, "utf8")) as {
    records?: Array<{ professor?: string; course?: string }>;
  };
  if (!Array.isArray(dataset.records)) {
    throw new Error("The evaluation source file is missing its records.");
  }
  return new Set(
    dataset.records
      .filter((record) => record.professor && record.course)
      .map((record) => `${record.professor}\u0000${record.course}`),
  );
}

const validPairings = loadValidPairings();

function fingerprint(req: Request): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is required for anonymous feedback safeguards.",
    );
  }
  const address = req.ip || req.socket.remoteAddress || "unknown";
  return createHmac("sha256", secret).update(address).digest("hex");
}

function hasSameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return (
      new URL(origin).host.toLowerCase() === req.get("host")?.toLowerCase()
    );
  } catch {
    return false;
  }
}

function isRateLimited(hash: string): boolean {
  const now = Date.now();
  const active = (submissionsByFingerprint.get(hash) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );
  if (active.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    submissionsByFingerprint.set(hash, active);
    return true;
  }
  active.push(now);
  submissionsByFingerprint.set(hash, active);
  if (submissionsByFingerprint.size > 5_000) {
    for (const [key, timestamps] of submissionsByFingerprint) {
      if (!timestamps.some((timestamp) => now - timestamp < RATE_WINDOW_MS)) {
        submissionsByFingerprint.delete(key);
      }
    }
  }
  return false;
}

export function createExamFeedbackRouter(
  database: typeof db = db,
  pairings: Set<string> = validPairings,
): IRouter {
  const router: IRouter = Router();

  function validPair(professor: string, course: string): boolean {
    return pairings.has(`${professor.trim()}\u0000${course.trim()}`);
  }

  router.get("/exam-feedback", async (req, res): Promise<void> => {
    const params = ListExamFeedbackQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: "Choose a professor and course." });
      return;
    }

    const professor = params.data.professor.trim();
    const course = params.data.course.trim();
    if (!validPair(professor, course)) {
      res
        .status(404)
        .json({ error: "That professor and course pairing was not found." });
      return;
    }

    const where = and(
      eq(examFeedbackTable.professor, professor),
      eq(examFeedbackTable.course, course),
    );
    const hiddenIds = database
      .select({ feedbackId: examFeedbackReportsTable.feedbackId })
      .from(examFeedbackReportsTable)
      .groupBy(examFeedbackReportsTable.feedbackId)
      .having(gte(count(examFeedbackReportsTable.id), REPORTS_TO_HIDE));
    const [ratingStats] = await database
      .select({
        averageDifficulty: sql<
          number | null
        >`avg(${examFeedbackTable.difficulty})`,
        ratingCount: count(examFeedbackTable.difficulty),
      })
      .from(examFeedbackTable)
      .where(where);
    const [commentStats] = await database
      .select({ commentCount: count(examFeedbackTable.id) })
      .from(examFeedbackTable)
      .where(
        and(
          where,
          isNotNull(examFeedbackTable.comment),
          notInArray(examFeedbackTable.id, hiddenIds),
        ),
      );
    const distribution = await database
      .select({
        difficulty: examFeedbackTable.difficulty,
        count: count(examFeedbackTable.id),
      })
      .from(examFeedbackTable)
      .where(and(where, isNotNull(examFeedbackTable.difficulty)))
      .groupBy(examFeedbackTable.difficulty);
    const difficultyCounts = [0, 0, 0, 0, 0];
    for (const item of distribution) {
      if (
        item.difficulty != null &&
        item.difficulty >= 1 &&
        item.difficulty <= 5
      ) {
        difficultyCounts[item.difficulty - 1] = Number(item.count);
      }
    }
    const limit = params.data.limit ?? MAX_COMMENTS;
    const comments = await database
      .select()
      .from(examFeedbackTable)
      .where(
        and(
          where,
          isNotNull(examFeedbackTable.comment),
          notInArray(examFeedbackTable.id, hiddenIds),
        ),
      )
      .orderBy(desc(examFeedbackTable.createdAt))
      .limit(limit);

    res.json(
      ListExamFeedbackResponse.parse({
        averageDifficulty:
          ratingStats?.averageDifficulty == null
            ? null
            : Number(ratingStats.averageDifficulty),
        ratingCount: Number(ratingStats?.ratingCount ?? 0),
        commentCount: Number(commentStats?.commentCount ?? 0),
        difficultyCounts,
        comments,
      }),
    );
  });

  router.post("/exam-feedback", async (req, res): Promise<void> => {
    if (!hasSameOrigin(req)) {
      res
        .status(403)
        .json({ error: "Feedback can only be submitted from this site." });
      return;
    }
    const parsed = CreateExamFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Check the feedback and try again." });
      return;
    }

    const body = parsed.data;
    if (body.website?.trim()) {
      res.status(400).json({ error: "Feedback could not be submitted." });
      return;
    }
    const professor = body.professor.trim();
    const course = body.course.trim();
    const comment = body.comment?.trim() || null;
    const grade = body.grade?.trim() || null;
    if (
      !professor ||
      !course ||
      (body.difficulty == null && (!comment || comment.length < 10))
    ) {
      res.status(400).json({
        error: "Add a difficulty score or a comment of at least 10 characters.",
      });
      return;
    }
    if (grade && (!comment || comment.length < 10)) {
      res.status(400).json({
        error:
          "A grade can only be shared with a comment of at least 10 characters.",
      });
      return;
    }
    if (comment && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(comment)) {
      res.status(400).json({
        error: "Please remove email addresses so comments stay anonymous.",
      });
      return;
    }
    if (!validPair(professor, course)) {
      res
        .status(404)
        .json({ error: "That professor and course pairing was not found." });
      return;
    }

    const hash = fingerprint(req);
    if (isRateLimited(hash)) {
      res
        .status(429)
        .json({
          error: "Too many submissions. Please try again in a few minutes.",
        });
      return;
    }

    const [created] = await database
      .insert(examFeedbackTable)
      .values({
        professor,
        course,
        difficulty: body.difficulty,
        comment,
        examTaken: body.examTaken ?? null,
        examCompleted: body.examCompleted,
        grade,
      })
      .returning({ id: examFeedbackTable.id });
    res.status(201).json(CreateExamFeedbackResponse.parse(created));
  });

  router.post("/exam-feedback/:id/report", async (req, res): Promise<void> => {
    if (!hasSameOrigin(req)) {
      res
        .status(403)
        .json({ error: "Reports can only be submitted from this site." });
      return;
    }
    const params = ReportExamFeedbackParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }
    const hash = fingerprint(req);
    const [comment] = await database
      .select({ id: examFeedbackTable.id })
      .from(examFeedbackTable)
      .where(
        and(
          eq(examFeedbackTable.id, params.data.id),
          isNotNull(examFeedbackTable.comment),
        ),
      )
      .limit(1);
    if (!comment) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }

    const hiddenIds = database
      .select({ feedbackId: examFeedbackReportsTable.feedbackId })
      .from(examFeedbackReportsTable)
      .groupBy(examFeedbackReportsTable.feedbackId)
      .having(gte(count(examFeedbackReportsTable.id), REPORTS_TO_HIDE));
    const [visible] = await database
      .select({ id: examFeedbackTable.id })
      .from(examFeedbackTable)
      .where(
        and(
          eq(examFeedbackTable.id, params.data.id),
          notInArray(examFeedbackTable.id, hiddenIds),
        ),
      )
      .limit(1);
    if (!visible) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }

    const [report] = await database
      .insert(examFeedbackReportsTable)
      .values({ feedbackId: params.data.id, reporterFingerprint: hash })
      .onConflictDoNothing()
      .returning({ id: examFeedbackReportsTable.id });
    res.json(ReportExamFeedbackResponse.parse({ reported: Boolean(report) }));
  });

  return router;
}

export default createExamFeedbackRouter();
