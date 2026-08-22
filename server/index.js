import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { diagnostic } from "./diagnostics.js";
import { apiError, requirementsAI } from "./ai.js";
import { AIUsageGuard, AIUsageLimitError, usageGuardConfig } from "./ai-usage-guard.js";
import { ParkingError, ParkingStore } from "./parking-store.js";
import { createJsonBodyParser, jsonBodyLimitErrorHandler, RequestInputError, requestSafetyConfig, validateRequirementsInput } from "./request-safety.js";

const app = express();
const port = Number(process.env.PORT || 5173);
const trustProxy = process.env.TRUST_PROXY?.trim() || "loopback, linklocal, uniquelocal";
app.set("trust proxy", trustProxy);
const usageConfig = usageGuardConfig();
const safetyConfig = requestSafetyConfig();
const aiUsageGuard = new AIUsageGuard({ config: usageConfig, diagnostic });
diagnostic("server_boot", { runtime_revision: "completion-gate-provenance-v3", port, trust_proxy: trustProxy, ai_usage_limits_enabled: usageConfig.enabled, max_idea_chars: safetyConfig.maxIdeaChars, json_body_limit: safetyConfig.jsonBodyLimit });
app.use(createJsonBodyParser(safetyConfig.jsonBodyLimit));
const parkingStore = new ParkingStore();
const parkingRoute = (handler) => async (req, res) => {
  try { res.json(await handler(req)); }
  catch (error) {
    const status = error instanceof ParkingError ? error.status : 500;
    res.status(status).json({ error: { message: error.message || "駐車場操作に失敗しました。", code: error.code ?? "PARKING_ERROR" } });
  }
};
app.get("/api/parking/state", parkingRoute(() => parkingStore.snapshot()));
app.post("/api/parking/spots", parkingRoute((req) => parkingStore.createSpot(req.body)));
app.post("/api/parking/slots", parkingRoute((req) => parkingStore.createSlot(req.body)));
app.get("/api/parking/search", parkingRoute((req) => parkingStore.search(req.query.city)));
app.post("/api/parking/reservations", parkingRoute((req) => parkingStore.reserve(req.body)));
const requirementsRoute = (operation, handler) => async (req, res) => {
  const sessionId = req.body?.sessionId ?? req.body?.context?.sessionId ?? "anonymous";
  try {
    validateRequirementsInput(operation, req.body, safetyConfig);
    const result = await aiUsageGuard.run({ ip: req.ip, sessionId, operation, input: req.body }, (requestContext) => handler(req, requestContext));
    res.json(result);
  }
  catch (error) {
    if (error instanceof AIUsageLimitError) {
      return res.status(429).json({ error: { message: error.message, code: error.code } });
    }
    if (error instanceof RequestInputError) {
      return res.status(error.status).json({ error: { message: error.message, code: error.code } });
    }
    const result = apiError(error);
    res.status(result.status).json({ error: { message: result.message } });
  }
};
// Reconnect the existing requirements engine without altering its rules.
app.post("/api/requirements/analyze", requirementsRoute("analyze", (req, requestContext) => requirementsAI.analyzeIdea(req.body.idea, { requestContext })));
app.post("/api/requirements/dimensions", requirementsRoute("dimensions", (req, requestContext) => requirementsAI.generateDimensions(req.body.context, { requestContext })));
app.post("/api/requirements/infer-mvp", requirementsRoute("infer-mvp", async (req, requestContext) => {
  const context = req.body.context ?? {};
  const result = await requirementsAI.inferMvp(context, { requestContext });
  diagnostic("completion_reassessment", {
    session_id: context.sessionId ?? null,
    answered_question_ids: context.answeredQuestionKeys ?? [],
    answered_decision_domains: context.answeredDecisionDomains ?? [],
    unresolved_before: (context.completionGate?.unresolvedCriticalProductDecisions ?? []).map((item) => item.decisionDomain),
    returned_critical_domains: (result.criticalProductDecisions ?? []).map((item) => item.decisionDomain),
    question_necessary_domains: (result.criticalProductDecisions ?? []).filter((item) => item.necessity?.requiresUserDecision === true && item.necessity?.safeMvpDefaultAvailable === false && item.necessity?.materiallyChangesProduct === true && item.necessity?.derivableFromConfirmedDecision === false).map((item) => item.decisionDomain),
    nonblocking_defaultable_domains: (result.criticalProductDecisions ?? []).filter((item) => item.necessity?.safeMvpDefaultAvailable === true || item.necessity?.materiallyChangesProduct === false || item.necessity?.derivableFromConfirmedDecision === true || item.necessity?.requiresUserDecision === false).map((item) => item.decisionDomain),
    returned_question_domains: (result.clarificationQuestions ?? []).map((item) => item.question?.decisionDomain ?? item.id),
    returned_inference_ids: (result.aiInferredRequirements ?? []).map((item) => item.key),
  });
  return result;
}));
app.post("/api/requirements/coverage-audit", requirementsRoute("coverage-audit", async (req, requestContext) => {
  const context = req.body.context ?? {};
  const result = await requirementsAI.auditCriticalDecisionCoverage(context, { requestContext });
  diagnostic("critical_decision_coverage_audit", {
    session_id: context.sessionId ?? null,
    coverage_complete: result.coverageComplete,
    audited_domain_count: result.auditedDecisionDomains?.length ?? 0,
    discovered_critical_domains: (result.criticalProductDecisions ?? []).map((item) => item.decisionDomain),
    question_necessary_domains: (result.criticalProductDecisions ?? []).filter((item) => item.necessity?.requiresUserDecision === true && item.necessity?.safeMvpDefaultAvailable === false && item.necessity?.materiallyChangesProduct === true && item.necessity?.derivableFromConfirmedDecision === false).map((item) => item.decisionDomain),
    nonblocking_defaultable_domains: (result.criticalProductDecisions ?? []).filter((item) => item.necessity?.safeMvpDefaultAvailable === true || item.necessity?.materiallyChangesProduct === false || item.necessity?.derivableFromConfirmedDecision === true || item.necessity?.requiresUserDecision === false).map((item) => item.decisionDomain),
    returned_question_domains: (result.clarificationQuestions ?? []).map((item) => item.question?.decisionDomain ?? item.id),
    returned_inference_ids: (result.aiInferredRequirements ?? []).map((item) => item.key),
    returned_proposal_ids: (result.implementationProposals ?? []).map((item) => item.key),
    negotiation_phase: context.status ?? null,
    confirmed_final_decision_ids: (context.confirmedFinalDecisions ?? []).map((item) => item.id),
  });
  return result;
}));
app.post("/api/requirements/generate-spec", requirementsRoute("generate-spec", (req, requestContext) => requirementsAI.generateSpec(req.body.context, { requestContext })));
app.post("/api/requirements/validate", requirementsRoute("validate", (req, requestContext) => requirementsAI.validateSpec(req.body.context, req.body.spec, { requestContext })));
app.use(jsonBodyLimitErrorHandler);
if (process.env.NODE_ENV === "production" || process.argv.includes("--production")) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(here, "..", "dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(here, "..", "dist", "index.html")));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const server = app.listen(port, () => console.log(`仕様太郎 v4.0: http://localhost:${port}`));
server.on("close", () => aiUsageGuard.close());
server.on("error", (error) => {
  console.error(`[requirements] サーバーを起動できませんでした (port=${port}, code=${error.code || "unknown"})`);
  process.exitCode = 1;
});


