import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { diagnostic } from "./diagnostics.js";
import { apiError, requirementsAI } from "./ai.js";
import { ParkingError, ParkingStore } from "./parking-store.js";

const app = express();
const port = Number(process.env.PORT || 5173);
diagnostic("server_boot", { runtime_revision: "completion-gate-provenance-v3", port });
app.use(express.json({ limit: "1mb" }));
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
const requirementsRoute = (handler) => async (req, res) => {
  try { res.json(await handler(req)); }
  catch (error) {
    const result = apiError(error);
    res.status(result.status).json({ error: { message: result.message } });
  }
};
// Reconnect the existing requirements engine without altering its rules.
app.post("/api/requirements/analyze", requirementsRoute((req) => requirementsAI.analyzeIdea(req.body.idea)));
app.post("/api/requirements/dimensions", requirementsRoute((req) => requirementsAI.generateDimensions(req.body.context)));
app.post("/api/requirements/infer-mvp", requirementsRoute(async (req) => {
  const context = req.body.context ?? {};
  const result = await requirementsAI.inferMvp(context);
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
app.post("/api/requirements/coverage-audit", requirementsRoute(async (req) => {
  const context = req.body.context ?? {};
  const result = await requirementsAI.auditCriticalDecisionCoverage(context);
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
app.post("/api/requirements/generate-spec", requirementsRoute((req) => requirementsAI.generateSpec(req.body.context)));
app.post("/api/requirements/validate", requirementsRoute((req) => requirementsAI.validateSpec(req.body.context, req.body.spec)));
if (process.env.NODE_ENV === "production" || process.argv.includes("--production")) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(here, "..", "dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(here, "..", "dist", "index.html")));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const server = app.listen(port, () => console.log(`仕様太郎 v4.0: http://localhost:${port}`));
server.on("error", (error) => {
  console.error(`[requirements] サーバーを起動できませんでした (port=${port}, code=${error.code || "unknown"})`);
  process.exitCode = 1;
});
