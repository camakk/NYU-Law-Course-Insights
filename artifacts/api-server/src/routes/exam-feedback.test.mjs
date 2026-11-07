import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/pg-proxy";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import pg from "pg";
import { buildProfessorNameAliases } from "@workspace/professor-identity";
import { getExamCompletionLabel } from "../../../course-insights/src/lib/exam-completion-label.ts";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-only-exam-feedback-secret";

const { createExamFeedbackRouter } = await import("./exam-feedback.ts");
const { examFeedbackTable } = await import("@workspace/db");
const postgresTestUrl = process.env.EXAM_FEEDBACK_TEST_DATABASE_URL;
const { Pool } = pg;
const dataset = JSON.parse(
  await readFile(
    new URL(
      "../../../course-insights/public/data/evaluations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const professorNames = buildProfessorNameAliases(
  dataset.records.map((record) => record.professor).filter(Boolean),
);
const firstPair = dataset.records.find(
  (record) => record.professor && record.course,
);
assert.ok(
  firstPair,
  "the evaluation dataset must include a valid professor/course pair",
);
const pairings = new Set(
  dataset.records
    .filter((record) => record.professor && record.course)
    .map((record) => {
      const professor =
        professorNames.canonicalByName.get(record.professor) ??
        record.professor;
      return `${professor}\u0000${record.course}`;
    }),
);
const randyAliasPair = dataset.records.find(
  (record) =>
    record.professor === "Hertz, Randy" &&
    record.course &&
    !dataset.records.some(
      (other) =>
        other.professor === "Hertz, Randy A" && other.course === record.course,
    ),
);
assert.ok(randyAliasPair, "Randy Hertz should have a course unique to the alias");
assert.equal(
  professorNames.canonicalByName.get(randyAliasPair.professor),
  "Hertz, Randy A",
);

test("legacy feedback keeps attendance labels and does not guess missing history", () => {
  assert.equal(
    getExamCompletionLabel({ examCompleted: null, examTaken: true }),
    "Took exam",
  );
  assert.equal(
    getExamCompletionLabel({ examCompleted: null, examTaken: false }),
    "Did not take exam",
  );
  assert.equal(
    getExamCompletionLabel({ examCompleted: true, examTaken: false }),
    "Finished exam",
  );
  assert.equal(
    getExamCompletionLabel({ examCompleted: false, examTaken: true }),
    "Did not finish exam",
  );
  assert.equal(
    getExamCompletionLabel({ examCompleted: null, examTaken: null }),
    "Exam completion not recorded",
  );
});

function interpolateParams(query, params, memory) {
  // pg-mem cannot plan the grouped HAVING subquery used by the API. Resolve
  // the hidden IDs from the same isolated report table and substitute a
  // literal exclusion so the endpoint's visibility behavior stays testable.
  const hiddenIds = memory.public
    .query(
      "SELECT feedback_id, COUNT(*) AS report_count FROM exam_feedback_reports GROUP BY feedback_id",
    )
    .rows.filter((row) => Number(row.report_count) >= 3)
    .map((row) => Number(row.feedback_id));
  const filteredQuery = query.replace(
    /\s+and "exam_feedback"\."id" not in \(select "feedback_id" from "exam_feedback_reports" group by "exam_feedback_reports"\."feedback_id" having count\("exam_feedback_reports"\."id"\) >= \$\d+\)/i,
    hiddenIds.length
      ? ` and "exam_feedback"."id" not in (${hiddenIds.join(", ")})`
      : "",
  );

  return filteredQuery.replace(/\$(\d+)/g, (_, index) => {
    const value = params[Number(index) - 1];
    if (value == null) return "null";
    if (typeof value === "boolean" || typeof value === "number")
      return String(value);
    return `'${String(value).replaceAll("'", "''")}'`;
  });
}

test("completion is required and finished states survive API create and fresh list requests", async (t) => {
  const memory = newDb();
  memory.public.none(`
    CREATE TABLE exam_feedback (
      id SERIAL PRIMARY KEY,
      professor VARCHAR(200) NOT NULL,
      course VARCHAR(300) NOT NULL,
      difficulty INTEGER,
      comment TEXT,
      exam_taken BOOLEAN,
      exam_completed BOOLEAN,
      grade VARCHAR(30),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE exam_feedback_reports (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER NOT NULL REFERENCES exam_feedback(id) ON DELETE CASCADE,
      reporter_fingerprint VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (feedback_id, reporter_fingerprint)
    );
  `);
  const quoteSql = (value) => `'${value.replaceAll("'", "''")}'`;
  memory.public.none(`
    INSERT INTO exam_feedback
      (professor, course, comment, exam_taken, exam_completed, created_at)
    VALUES
      (${quoteSql(firstPair.professor)}, ${quoteSql(firstPair.course)}, 'Legacy took record', true, null, '2020-01-01T00:00:00Z'),
      (${quoteSql(firstPair.professor)}, ${quoteSql(firstPair.course)}, 'Legacy did not take record', false, null, '2020-01-02T00:00:00Z'),
      (${quoteSql(firstPair.professor)}, ${quoteSql(firstPair.course)}, 'Legacy unknown record', null, null, '2020-01-03T00:00:00Z'),
      (${quoteSql(randyAliasPair.professor)}, ${quoteSql(randyAliasPair.course)}, 'Legacy professor alias record', true, null, '2020-01-04T00:00:00Z');
  `);

  const database = drizzle(async (query, params) => {
    const result = memory.public.query(interpolateParams(query, params, memory));
    return {
      rows: result.rows.map((row) =>
        result.fields.map((field) => row[field.name]),
      ),
    };
  });
  const app = express();
  app.use(express.json());
  app.use(createExamFeedbackRouter(database, pairings));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const submission = {
    professor: firstPair.professor,
    course: firstPair.course,
    difficulty: 4,
    comment: "The exam covered the course material.",
    grade: null,
  };
  const missingCompletion = await fetch(`${baseUrl}/exam-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  assert.equal(missingCompletion.status, 400);

  for (const [examCompleted, expectedLabel] of [
    [true, "Finished exam"],
    [false, "Did not finish exam"],
  ]) {
    const created = await fetch(`${baseUrl}/exam-feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...submission, examCompleted }),
    });
    assert.equal(created.status, 201);
    assert.ok((await created.json()).id);
  }

  const reloaded = await fetch(
    `${baseUrl}/exam-feedback?professor=${encodeURIComponent(firstPair.professor)}&course=${encodeURIComponent(firstPair.course)}`,
  );
  assert.equal(reloaded.status, 200);
  const list = await reloaded.json();

  assert.deepEqual(
    list.comments.map((comment) => comment.examCompleted).sort(),
    [false, null, null, null, true],
  );
  assert.deepEqual(list.comments.map(getExamCompletionLabel).sort(), [
    "Did not finish exam",
    "Did not take exam",
    "Exam completion not recorded",
    "Finished exam",
    "Took exam",
  ]);
  const legacyComments = list.comments.filter((comment) =>
    comment.comment?.startsWith("Legacy"),
  );
  assert.equal(legacyComments.length, 3);
  assert.ok(legacyComments.every((comment) => comment.examCompleted === null));

  const canonicalProfessor =
    professorNames.canonicalByName.get(randyAliasPair.professor);
  const aliasListUrl = `${baseUrl}/exam-feedback?professor=${encodeURIComponent(canonicalProfessor)}&course=${encodeURIComponent(randyAliasPair.course)}`;
  const legacyAliasList = await fetch(aliasListUrl);
  assert.equal(legacyAliasList.status, 200);
  const legacyAliasSummary = await legacyAliasList.json();
  assert.equal(legacyAliasSummary.comments.length, 1);
  assert.equal(
    legacyAliasSummary.comments[0].comment,
    "Legacy professor alias record",
  );

  const groupedPost = await fetch(`${baseUrl}/exam-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      professor: canonicalProfessor,
      course: randyAliasPair.course,
      difficulty: 3,
      comment: "A comment saved under the grouped professor name.",
      examCompleted: true,
      grade: null,
    }),
  });
  assert.equal(groupedPost.status, 201);
  const groupedAliasList = await fetch(aliasListUrl);
  assert.equal(groupedAliasList.status, 200);
  const groupedAliasSummary = await groupedAliasList.json();
  assert.deepEqual(
    new Set(groupedAliasSummary.comments.map((comment) => comment.professor)),
    new Set([randyAliasPair.professor, canonicalProfessor]),
  );
});

test(
  "legacy attendance and completion values round-trip through PostgreSQL",
  { skip: !postgresTestUrl },
  async (t) => {
    assert.equal(examFeedbackTable.examTaken.notNull, false);
    assert.equal(examFeedbackTable.examCompleted.notNull, false);

    const schemaName = `exam_feedback_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: postgresTestUrl });
    const databasePool = new Pool({
      connectionString: postgresTestUrl,
      options: `-c search_path=${schemaName}`,
    });

    t.after(async () => {
      await databasePool.end();
      try {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    });

    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    await databasePool.query(`
      CREATE TABLE exam_feedback (
        id SERIAL PRIMARY KEY,
        professor VARCHAR(200) NOT NULL,
        course VARCHAR(300) NOT NULL,
        difficulty INTEGER,
        comment TEXT,
        exam_taken BOOLEAN,
        exam_completed BOOLEAN,
        grade VARCHAR(30),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT exam_feedback_difficulty_range
          CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
        CONSTRAINT exam_feedback_content_required
          CHECK (difficulty IS NOT NULL OR
            (comment IS NOT NULL AND length(trim(comment)) >= 10))
      );
      CREATE TABLE exam_feedback_reports (
        id SERIAL PRIMARY KEY,
        feedback_id INTEGER NOT NULL REFERENCES exam_feedback(id) ON DELETE CASCADE,
        reporter_fingerprint VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT exam_feedback_reports_once_per_reporter
          UNIQUE (feedback_id, reporter_fingerprint)
      );
    `);

    const feedbackColumns = await databasePool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'exam_feedback'
        AND column_name IN ('exam_taken', 'exam_completed')
      ORDER BY column_name
    `);
    assert.deepEqual(feedbackColumns.rows, [
      {
        column_name: "exam_completed",
        data_type: "boolean",
        is_nullable: "YES",
      },
      { column_name: "exam_taken", data_type: "boolean", is_nullable: "YES" },
    ]);

    const legacyRows = [
      {
        comment: "Legacy took exam",
        examTaken: true,
        examCompleted: null,
        createdAt: "2020-01-01T00:00:00Z",
      },
      {
        comment: "Legacy did not take exam",
        examTaken: false,
        examCompleted: null,
        createdAt: "2020-01-02T00:00:00Z",
      },
      {
        comment: "Legacy exam history unknown",
        examTaken: null,
        examCompleted: null,
        createdAt: "2020-01-03T00:00:00Z",
      },
    ];
    for (const row of legacyRows) {
      await databasePool.query(
        `INSERT INTO exam_feedback
          (professor, course, difficulty, comment, exam_taken, exam_completed, created_at)
         VALUES ($1, $2, 4, $3, $4, $5, $6)`,
        [
          firstPair.professor,
          firstPair.course,
          row.comment,
          row.examTaken,
          row.examCompleted,
          row.createdAt,
        ],
      );
    }

    const database = drizzlePostgres(databasePool);
    const app = express();
    app.use(express.json());
    app.use(createExamFeedbackRouter(database, pairings));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    for (const [examCompleted, examTaken, comment] of [
      [true, false, "New completed exam"],
      [false, true, "New incomplete exam"],
    ]) {
      const response = await fetch(`${baseUrl}/exam-feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professor: firstPair.professor,
          course: firstPair.course,
          difficulty: 4,
          comment,
          examCompleted,
          examTaken,
          grade: null,
        }),
      });
      assert.equal(response.status, 201);
    }

    const response = await fetch(
      `${baseUrl}/exam-feedback?professor=${encodeURIComponent(firstPair.professor)}&course=${encodeURIComponent(firstPair.course)}`,
    );
    assert.equal(response.status, 200);
    const { comments } = await response.json();
    const byComment = new Map(
      comments.map((comment) => [comment.comment, comment]),
    );

    for (const row of legacyRows) {
      const saved = byComment.get(row.comment);
      assert.ok(saved, `should return ${row.comment}`);
      assert.equal(saved.examTaken, row.examTaken);
      assert.equal(saved.examCompleted, row.examCompleted);
    }

    assert.equal(byComment.get("Legacy exam history unknown").examTaken, null);
    assert.equal(
      byComment.get("Legacy exam history unknown").examCompleted,
      null,
    );
    assert.deepEqual(
      [
        byComment.get("New completed exam").examTaken,
        byComment.get("New completed exam").examCompleted,
        byComment.get("New incomplete exam").examTaken,
        byComment.get("New incomplete exam").examCompleted,
      ],
      [false, true, true, false],
    );
  },
);

test("anonymous feedback accepts the configured limit and rejects the next submission", async (t) => {
  const memory = newDb();
  memory.public.none(`
    CREATE TABLE exam_feedback (
      id SERIAL PRIMARY KEY,
      professor VARCHAR(200) NOT NULL,
      course VARCHAR(300) NOT NULL,
      difficulty INTEGER,
      comment TEXT,
      exam_taken BOOLEAN,
      exam_completed BOOLEAN,
      grade VARCHAR(30),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE exam_feedback_reports (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER NOT NULL REFERENCES exam_feedback(id) ON DELETE CASCADE,
      reporter_fingerprint VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (feedback_id, reporter_fingerprint)
    );
  `);
  const database = drizzle(async (query, params) => {
    const result = memory.public.query(interpolateParams(query, params, memory));
    return {
      rows: result.rows.map((row) =>
        result.fields.map((field) => row[field.name]),
      ),
    };
  });
  const rateLimitState = new Map();
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(createExamFeedbackRouter(database, pairings, undefined, rateLimitState));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const submission = {
    professor: firstPair.professor,
    course: firstPair.course,
    difficulty: 4,
    comment: "The exam covered the course material.",
    examCompleted: true,
    grade: null,
  };
  const submit = () =>
    fetch(`${baseUrl}/exam-feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.42",
      },
      body: JSON.stringify(submission),
    });

  for (let index = 0; index < 20; index += 1) {
    const response = await submit();
    assert.equal(response.status, 201, `submission ${index + 1} should succeed`);
  }

  const overLimit = await submit();
  assert.equal(overLimit.status, 429);
  assert.deepEqual(await overLimit.json(), {
    error: "Too many submissions. Please try again in a few minutes.",
  });

  assert.equal(rateLimitState.size, 1);
  assert.equal([...rateLimitState.values()][0].length, 20);
  assert.equal(
    memory.public.one("SELECT COUNT(*) AS count FROM exam_feedback").count,
    20,
  );
});

test("reports count distinct visitors once and hide a comment after three reports", async (t) => {
  const memory = newDb();
  memory.public.none(`
    CREATE TABLE exam_feedback (
      id SERIAL PRIMARY KEY,
      professor VARCHAR(200) NOT NULL,
      course VARCHAR(300) NOT NULL,
      difficulty INTEGER,
      comment TEXT,
      exam_taken BOOLEAN,
      exam_completed BOOLEAN,
      grade VARCHAR(30),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE exam_feedback_reports (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER NOT NULL REFERENCES exam_feedback(id) ON DELETE CASCADE,
      reporter_fingerprint VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (feedback_id, reporter_fingerprint)
    );
  `);
  const quoteSql = (value) => `'${value.replaceAll("'", "''")}'`;
  memory.public.none(`
    INSERT INTO exam_feedback (id, professor, course, comment)
    VALUES (1, ${quoteSql(firstPair.professor)}, ${quoteSql(firstPair.course)}, 'A useful comment for moderation testing.');
  `);

  const database = drizzle(async (query, params) => {
    const result = memory.public.query(interpolateParams(query, params, memory));
    return {
      rows: result.rows.map((row) =>
        result.fields.map((field) => row[field.name]),
      ),
    };
  });
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(createExamFeedbackRouter(database, pairings));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const report = (commentId, visitor) =>
    fetch(`${baseUrl}/exam-feedback/${commentId}/report`, {
      method: "POST",
      headers: { "x-forwarded-for": visitor },
    });
  const listComments = () =>
    fetch(
      `${baseUrl}/exam-feedback?professor=${encodeURIComponent(firstPair.professor)}&course=${encodeURIComponent(firstPair.course)}`,
    );

  const firstReport = await report(1, "198.51.100.10");
  assert.equal(firstReport.status, 200);
  assert.deepEqual(await firstReport.json(), { reported: true });

  const repeatedReport = await report(1, "198.51.100.10");
  assert.equal(repeatedReport.status, 200);
  assert.deepEqual(await repeatedReport.json(), { reported: false });
  let freshList = await listComments();
  assert.equal(freshList.status, 200);
  assert.equal((await freshList.json()).comments.length, 1);

  const secondReport = await report(1, "198.51.100.11");
  assert.equal(secondReport.status, 200);
  assert.deepEqual(await secondReport.json(), { reported: true });
  freshList = await listComments();
  assert.equal(freshList.status, 200);
  assert.equal((await freshList.json()).comments.length, 1);

  const thirdReport = await report(1, "198.51.100.12");
  assert.equal(thirdReport.status, 200);
  assert.deepEqual(await thirdReport.json(), { reported: true });
  freshList = await listComments();
  assert.equal(freshList.status, 200);
  assert.equal((await freshList.json()).comments.length, 0);

  const reportAfterHidden = await report(1, "198.51.100.13");
  assert.equal(reportAfterHidden.status, 404);
});
