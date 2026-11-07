---
name: Isolated feedback API tests
description: Decisions for integration-testing anonymous feedback without creating public test content.
---

Exercise feedback POST/GET routes against an injected, isolated database. Do not post fixtures into the shared development database because comments are public and there is no normal delete endpoint.

**Why:** The meaningful regression check needs a real create-then-list request, but test comments must not persist in the app.

**How to apply:** Keep route construction injectable for tests. With pg-mem and Drizzle, use the pg-proxy adapter; the node-postgres adapter fails on Drizzle's type parser metadata, and pg-mem does not support the nested HAVING report filter. If a test adapter removes that filter, only do so when its report table is empty and fail explicitly if the expected SQL shape changes.
