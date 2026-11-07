---
name: Feedback report test adapter
description: pg-mem limitation and test adaptation for grouped feedback report visibility queries.
---

When testing feedback comment visibility with pg-mem, resolve IDs meeting the report threshold from the isolated report table and substitute a literal ID exclusion in the generated list query.

**Why:** pg-mem does not reliably plan the grouped `HAVING COUNT` subquery used by production report filtering, so the unadapted route query fails before exercising behavior.

**How to apply:** Keep the production route query intact; adapt only the test database callback and derive hidden IDs from the test database's report rows.
