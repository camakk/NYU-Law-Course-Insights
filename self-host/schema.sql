BEGIN;

CREATE TABLE IF NOT EXISTS exam_feedback (
  id serial PRIMARY KEY,
  professor varchar(200) NOT NULL,
  course varchar(300) NOT NULL,
  difficulty integer,
  comment text,
  exam_taken boolean,
  exam_completed boolean,
  grade varchar(30),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_feedback_difficulty_range
    CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
  CONSTRAINT exam_feedback_content_required
    CHECK (difficulty IS NOT NULL OR (comment IS NOT NULL AND length(trim(comment)) >= 10))
);

CREATE TABLE IF NOT EXISTS exam_feedback_reports (
  id serial PRIMARY KEY,
  feedback_id integer NOT NULL REFERENCES exam_feedback(id) ON DELETE CASCADE,
  reporter_fingerprint varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_feedback_reports_once_per_reporter
  ON exam_feedback_reports(feedback_id, reporter_fingerprint);

COMMIT;
