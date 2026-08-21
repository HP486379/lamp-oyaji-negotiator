async function request(path, body) {
  const controller = new AbortController();
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
  } finally { clearTimeout(timer); }
}
export class HttpRequirementsAI {
  startProject(idea) { return request("start", { idea }); }
  analyzeIdea(idea) { return request("analyze", { idea }); }
  generateDimensions(context) { return request("dimensions", { context }); }
  inferMvp(context) { return request("infer-mvp", { context }); }
  auditCriticalDecisionCoverage(context) { return request("coverage-audit", { context }); }
  generateSpec(context) { return request("generate-spec", { context }); }
  validateSpec(context, spec) { return request("validate", { context, spec }); }
}
