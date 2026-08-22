async function request(path, body, { signal } = {}) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  // The server owns the OpenAI deadline. Browser deadlines are deliberately
  // longer so a healthy server request is never abandoned while still in
  // flight, which previously left duplicate retries running concurrently.
  const timeoutByPath = { "infer-mvp": 60000, "coverage-audit": 55000, "generate-spec": 75000 };
  const timeout = timeoutByPath[path] ?? 45000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`/api/requirements/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || "AIによる仕様分析に失敗しました。再試行してください。");
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI処理がタイムアウトしました。再試行してください。");
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abortFromCaller); }
}
export class HttpRequirementsAI {
  startProject(idea, options) { return request("start", { idea }, options); }
  analyzeIdea(idea, sessionId, options) { return request("analyze", { idea, sessionId }, options); }
  generateDimensions(context, options) { return request("dimensions", { context }, options); }
  inferMvp(context, options) { return request("infer-mvp", { context }, options); }
  auditCriticalDecisionCoverage(context, options) { return request("coverage-audit", { context }, options); }
  generateSpec(context, options) { return request("generate-spec", { context }, options); }
  validateSpec(context, spec, options) { return request("validate", { context, spec }, options); }
}


