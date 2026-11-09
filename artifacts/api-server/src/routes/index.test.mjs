import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import router from "./index.ts";

test("disabled exam feedback endpoints are inaccessible while other API routes work", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [method, path] of [
      ["GET", "/api/exam-feedback"],
      ["GET", "/api/exam-feedback?professor=example&course=example"],
      ["POST", "/api/exam-feedback"],
      ["POST", "/api/exam-feedback/1/report"],
    ]) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 404, `${method} ${path} must remain unavailable`);
    }
    const health = await fetch(`${base}/api/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
