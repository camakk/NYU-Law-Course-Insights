import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const examFeedbackTable = pgTable(
  "exam_feedback",
  {
    id: serial("id").primaryKey(),
    professor: varchar("professor", { length: 200 }).notNull(),
    course: varchar("course", { length: 300 }).notNull(),
    difficulty: integer("difficulty"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "exam_feedback_difficulty_range",
      sql`${table.difficulty} is null or ${table.difficulty} between 1 and 5`,
    ),
    check(
      "exam_feedback_content_required",
      sql`${table.difficulty} is not null or (${table.comment} is not null and length(trim(${table.comment})) >= 10)`,
    ),
  ],
);

export const examFeedbackReportsTable = pgTable(
  "exam_feedback_reports",
  {
    id: serial("id").primaryKey(),
    feedbackId: integer("feedback_id")
      .notNull()
      .references(() => examFeedbackTable.id, { onDelete: "cascade" }),
    reporterFingerprint: varchar("reporter_fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("exam_feedback_reports_once_per_reporter").on(
      table.feedbackId,
      table.reporterFingerprint,
    ),
  ],
);
