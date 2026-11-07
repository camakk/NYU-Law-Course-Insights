---
name: PostgreSQL integration test lifecycle
description: Running temporary PostgreSQL instances for tests in this Replit workspace.
---

Run a temporary local PostgreSQL server as a managed background process when executing database integration tests. Starting it as a daemon from a short-lived shell command may appear successful, but it can stop when that command ends.

**Why:** PostgreSQL was reachable inside the launch command but had exited by the next tool call, making a real-database test fail with a connection refusal.

**How to apply:** Start the foreground `postgres` process through the background shell facility, run integration tests while it remains active, then stop the process and remove its temporary data directory.
