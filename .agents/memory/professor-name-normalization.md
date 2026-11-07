---
name: Professor name normalization
description: Conservative identity matching for professor names in course evaluations.
---

Merge professor variants with the same first and last name when their only middle-name difference is one unambiguous initial. Prefer the spelling with the middle initial. Normalize harmless punctuation and diacritic differences, but leave conflicting initials and ambiguous middle-name variants separate.

**Why:** Grouping clear name variants keeps course and professor statistics accurate without combining distinct people who share a first and last name.

**How to apply:** Use one shared alias map wherever evaluation records or anonymous course feedback are grouped, searched, linked, or validated.
