import assert from "node:assert/strict";
import {
  applyAnalysis, applyCriticalDecisionCoverageAudit, calculatedConversationProgress, completionGate, createProjectContext,
  enableCriticalDecisionCoverageAudit, planNext, recordAnswer, recordInference, runSpecRepairPipeline, setDimensions,
} from "../requirements-core.js";

const baseUrl = process.env.SPEC_TARO_BASE_URL || "http://localhost:5173";
const idea = "家族の冷蔵庫にある食材を管理するアプリを作りたい";

async function post(path, body) {
  const response = await fetch(`${baseUrl}/api/requirements/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
  return payload;
}

let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
context = applyAnalysis(context, await post("analyze", { idea }));
context = setDimensions(context, await post("dimensions", { context }));
let question = planNext(context);
assert.ok(question, "an ambiguous family refrigerator idea must yield a Product Decision");

const firstOptions = question.question.options;
const sharedAnswer = firstOptions.find((option) => /家族|全員|共有/.test(option)) ?? question.question.recommended;
context = recordAnswer(context, question.id, sharedAnswer, sharedAnswer === question.question.recommended);

let direct = planNext(context);
if (!direct) context = recordInference(context, await post("infer-mvp", { context }));
if (!planNext(context) && completionGate(context).coverageAuditPending) context = applyCriticalDecisionCoverageAudit(context, await post("coverage-audit", { context }));
question = planNext(context);
assert.equal(completionGate(context).complete, false, "sharing alone must not pass Completion Gate");
assert.ok(question, "the next unresolved critical Product Decision must be presented");
assert.ok(calculatedConversationProgress(context) < 100);
assert.equal(context.facts.some((fact) => fact.source === "ai_inferred" && /消費/.test(String(fact.value))), false);

let answered = 1;
while (question && answered < 7) {
  context = recordAnswer(context, question.id, question.question.recommended, true);
  direct = planNext(context);
  if (!direct) context = recordInference(context, await post("infer-mvp", { context }));
  if (!planNext(context) && completionGate(context).coverageAuditPending) context = applyCriticalDecisionCoverageAudit(context, await post("coverage-audit", { context }));
  question = planNext(context);
  answered += 1;
}
assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));

const result = await runSpecRepairPipeline({
  context,
  generateSpec: (canonicalContext) => post("generate-spec", { context: canonicalContext }),
  validateRemote: (canonicalContext, spec) => post("validate", { context: canonicalContext, spec }),
});
assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
console.log(`Real HTTP refrigerator flow: PASS (${answered} answered Product Decision(s), SPEC validated)`);
