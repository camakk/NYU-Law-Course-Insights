---
name: Evaluation comparison policy
description: Why evaluation rankings use approximate response weights and preserve source records.
---

Treat course comparisons as summaries of subjective student evaluations, not objective proof of teaching quality. Use offering response counts as approximate weights and disclose that per-question response counts are unavailable and source averages are already rounded.

**Why:** The uploaded workbook reports offering-level response counts only. Equal weighting would overemphasize tiny sections; pretending exact question-level weights exist would overstate precision.

**How to apply:** Retain response-count context and small-sample caveats when extending comparisons. Do not treat missing ratings as zero, merge duplicate-looking offering rows, or silently repair source anomalies. The user's core requirement is professor results across all classes and teacher comparisons within each individual course.

For directory minimums, interpret “courses taught” as distinct course titles; retain individual sections and repeat terms under the separate “class offerings” measure.

**Why:** Repeated sections should not imply a broader range of teaching experience. Separate measures let users filter on either breadth or number of offerings.

**How to apply:** Keep these labels distinct in future filters and apply minimums to the selected semester's records.

For recent-history columns, show up to three distinct partner items and use the latest semester for each professor–course pairing.

**Why:** Repeated sections of the same professor–course pairing should not occupy multiple slots or overstate the range of recent teaching.

**How to apply:** Collapse repeated course titles for a professor and repeated professors for a course, then order by latest semester.

Infer course categories from title keywords using this precedence: Externship, Clinic, Colloquium, Seminar, then Course.

**Why:** Titles such as “Clinic Seminar” or “Externship Seminar” identify a specific program type, not just a seminar.

**How to apply:** Use the same classifier for each course record and its directory entry; titles with no indicator remain Course.

Anonymous post-exam feedback is attached to a professor–course pair across terms, and uses an optional 1–5 difficulty rating independent of the written comment.

**Why:** This is the audience's chosen grouping; the source has no course codes, and a course pair may recur in many semesters.

**How to apply:** Do not imply that new feedback belongs to a specific semester or exam offering.
