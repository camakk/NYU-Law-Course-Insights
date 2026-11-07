import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/pg-proxy";
import { getExamCompletionLabel } from "../../../course-insights/src/lib/exam-completion-label.ts";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-only-exam-feedback-secret";

const { createExamFeedbackRouter } = await import("./exam-feedback.ts");
const dataset = JSON.parse(
  await readFile(
    new URL(
      "../../../course-insights/public/data/evaluations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const firstPair = dataset.records.find(
  (record) => record.professor && record.course,
);
assert.ok(
  firstPair,
  "the evaluation dataset must include a valid professor/course pair",
);
const pairings = new Set([`${firstPair.professor}\u0000${firstPair.course}`]);

function interpolateParams(query, params) {
  // pg-mem cannot plan the empty-report HAVING subquery used by the API. With
  // the isolated test database containing no reports, removing this exclusion
  // keeps list behavior equivalent for the create/list completion assertions.
  const unfilteredReportQuery = query.replace(
    /\s+and "exam_feedback"\."id" not in \(select "feedback_id" from "exam_feedback_reports" group by "exam_feedback_reports"\."feedback_id" having count\("exam_feedback_reports"\."id"\) >= \$\d+\)/i,
    "",
  );
  if (
    query.includes('not in (select "feedback_id"') &&
    unfilteredReportQuery === query
  ) {
    throw new Error(
      "The in-memory database cannot handle the report-filter subquery.",
    );
  }

  return unfilteredReportQuery.replace(/\$(\d+)/g, (_, index) => {
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

  const database = drizzle(async (query, params) => {
    const result = memory.public.query(interpolateParams(query, params));
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
    [false, true],
  );
  assert.deepEqual(list.comments.map(getExamCompletionLabel).sort(), [
    "Did not finish exam",
    "Finished exam",
  ]);
});
