/** Browser-safe adapter.  Secrets stay in the server that implements these routes. */
async function request(path, body) {
  const controller = new AbortController();
  const timeoutByPath = { "infer-mvp": 60000, "coverage-audit": 55000, "generate-spec": 75000 };
  const timer = setTimeout(() => controller.abort(), timeoutByPath[path] ?? 45000);
  try {
  const response = await fetch(`/api/requirements/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: controller.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "AIによる仕様分析に失敗しました。再試行してください。");
    error.status = response.status;
    throw error;
  }
  return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI処理がタイムアウトしました。もう一度試してください。");
    throw error;
  } finally { clearTimeout(timer); }
}

/** RequirementsAI contract: each server response must be JSON-schema validated. */
export class HttpRequirementsAI {
  analyzeIdea(idea, sessionId) { return request("analyze", { idea, sessionId }); }
  generateDimensions(context) { return request("dimensions", { context }); }
  inferMvp(context) { return request("infer-mvp", { context }); }
  auditCriticalDecisionCoverage(context) { return request("coverage-audit", { context }); }
  generateSpec(context) { return request("generate-spec", { context }); }
  validateSpec(context, spec) { return request("validate", { context, spec }); }
}

