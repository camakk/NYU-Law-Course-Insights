---
name: Exam completion labels
description: Product rule for recording whether a student finished an exam in anonymous post-exam feedback.
---

New post-exam feedback must require an explicit finished/not-finished answer and show that status as a label on the public comment. Keep this distinct from whether the student took the exam.

**Why:** The user requires completion status to be recorded. Older `examTaken` values describe attendance and cannot safely be inferred as completion.

**How to apply:** Persist completion separately for new submissions, display it on comment cards, and preserve legacy attendance labels for records without completion data.
