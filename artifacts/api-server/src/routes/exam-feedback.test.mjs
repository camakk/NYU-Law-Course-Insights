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
      (${quoteSql(firstPair.professor)}, ${quoteSql(firstPair.course)}, 'Legacy unknown record', null, null, '2020-01-03T00:00:00Z');
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
