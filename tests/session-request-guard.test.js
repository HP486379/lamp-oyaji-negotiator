import test from "node:test";
import assert from "node:assert/strict";
import { SessionRequestGuard } from "../src/session-request-guard.js";

test("a late response from session A cannot update session B", () => {
  const guard = new SessionRequestGuard();
  guard.beginSession("session-a");
  const oldRequest = guard.beginRequest("session-a");
  guard.beginSession("session-b");
  const currentRequest = guard.beginRequest("session-b");
  const state = { sessionId: "session-b", phase: "thinking", question: null, context: "session-b-context", error: "", markdown: "", generatedSpec: null };
  const apply = (request, update) => request.isCurrent() ? { ...state, ...update } : state;
  assert.equal(apply(oldRequest, { phase: "question", context: "old" }), state);
  assert.deepEqual(apply(currentRequest, { phase: "question", context: "new" }), { ...state, phase: "question", context: "new" });
});

test("a stale request error is not eligible for display", () => {
  const guard = new SessionRequestGuard();
  guard.beginSession("session-a");
  const oldRequest = guard.beginRequest("session-a");
  guard.invalidate();
  assert.equal(oldRequest.isCurrent(), false);
  assert.equal(oldRequest.signal.aborted, true);
  const currentState = { phase: "start", error: "" };
  const nextState = oldRequest.isCurrent() ? { ...currentState, error: "old request failed" } : currentState;
  assert.equal(nextState, currentState);
});

test("a response from the current session remains applicable", () => {
  const guard = new SessionRequestGuard();
  guard.beginSession("session-a");
  const request = guard.beginRequest("session-a");
  assert.equal(request.isCurrent(), true);
  request.finish();
  assert.equal(guard.activeRequestCount, 0);
  assert.equal(request.isCurrent(), true);
});

test("reset aborts all active requests", () => {
  const guard = new SessionRequestGuard();
  guard.beginSession("session-a");
  const first = guard.beginRequest("session-a");
  const second = guard.beginRequest("session-a");
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  guard.invalidate();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(guard.activeRequestCount, 0);
});

test("a newer request token supersedes an older request in the same session", () => {
  const guard = new SessionRequestGuard();
  guard.beginSession("session-a");
  const oldRequest = guard.beginRequest("session-a");
  const newRequest = guard.beginRequest("session-a");
  assert.equal(oldRequest.signal.aborted, true);
  assert.equal(oldRequest.isCurrent(), false);
  assert.equal(newRequest.isCurrent(), true);
});

