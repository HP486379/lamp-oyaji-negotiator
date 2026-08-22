import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createJsonBodyParser, jsonBodyLimitErrorHandler, requestSafetyConfig, validateRequirementsInput } from "../server/request-safety.js";

test("request safety defaults are bounded and configurable", () => {
  assert.deepEqual(requestSafetyConfig({}), { maxIdeaChars: 8000, jsonBodyLimit: "256kb" });
  assert.deepEqual(requestSafetyConfig({ AI_MAX_IDEA_CHARS: "1200", HTTP_JSON_BODY_LIMIT: "384kb" }), { maxIdeaChars: 1200, jsonBodyLimit: "384kb" });
  assert.equal(requestSafetyConfig({ HTTP_JSON_BODY_LIMIT: "not-a-size" }).jsonBodyLimit, "256kb");
});

test("8000 idea characters pass, while 8001 are rejected before usage or OpenAI handlers", () => {
  const config = requestSafetyConfig({});
  let usageCalls = 0;
  let openAiCalls = 0;
  const dispatch = (idea) => {
    validateRequirementsInput("analyze", { idea }, config);
    usageCalls += 1;
    openAiCalls += 1;
  };
  dispatch("a".repeat(8000));
  assert.equal(usageCalls, 1);
  assert.equal(openAiCalls, 1);
  assert.throws(() => dispatch("a".repeat(8001)), (error) => error.status === 413 && error.code === "AI_IDEA_TOO_LARGE");
  assert.equal(usageCalls, 1);
  assert.equal(openAiCalls, 1);
  assert.throws(() => validateRequirementsInput("generate-spec", { context: { idea: "a".repeat(8001) } }, config), (error) => error.status === 413 && error.code === "AI_IDEA_TOO_LARGE");
});

async function withBodyLimit(limit, run) {
  const app = express();
  let handlerCalls = 0;
  app.use(createJsonBodyParser(limit));
  app.post("/requirements", (_req, res) => { handlerCalls += 1; res.json({ ok: true }); });
  app.use(jsonBodyLimitErrorHandler);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try { await run(`http://127.0.0.1:${server.address().port}/requirements`, () => handlerCalls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("oversized JSON is rejected with a safe 413 before the route handler", async () => {
  await withBodyLimit("1kb", async (url, calls) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: "x".repeat(2048) }) });
    const payload = await response.json();
    assert.equal(response.status, 413);
    assert.equal(payload.error.code, "HTTP_JSON_BODY_TOO_LARGE");
    assert.doesNotMatch(JSON.stringify(payload), /stack|entity\.too\.large|SyntaxError/);
    assert.equal(calls(), 0);
  });
});

test("a normal SPEC flow payload remains below the 256kb default", async () => {
  await withBodyLimit(requestSafetyConfig({}).jsonBodyLimit, async (url, calls) => {
    const body = { context: { sessionId: "normal-session", facts: Array.from({ length: 80 }, (_, index) => ({ key: `fact-${index}`, value: "正常な要件データ".repeat(20) })) }, spec: { projectOverview: "通常のSPEC" } };
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.equal(calls(), 1);
  });
});

