import "dotenv/config";
import assert from "node:assert/strict";
import { requirementsAI } from "../server/ai.js";
import {
  applyAnalysis,
  applyCriticalDecisionCoverageAudit,
  buildMarkdown,
  completionGate,
  createProjectContext,
  enableCriticalDecisionCoverageAudit,
  planNext,
  recordAnswer,
  recordInference,
  runSpecRepairPipeline,
  setDimensions,
} from "../requirements-core.js";

const idea = "ユーザーが手持ちの食材を登録すると、その日のうちに作れる料理（レシピ）を提案して料理選びを助け、買い物の手間や食材の廃棄を減らす。";
const asked = [];

async function withTransientRetry(operation) {
  try { return await operation(); }
  catch (error) {
    if (!(["AbortError", "APIConnectionTimeoutError", "APIUserAbortError", "StructuredOutputMissingError"].includes(error?.name) || error?.code === "ETIMEDOUT")) throw error;
    return operation();
  }
}

function selectedAnswer(question) {
  const domain = question.question.decisionDomain;
  const choices = question.question.options;
  if (/match|partial|ingredient.*recipe|eligibility|rule/i.test(domain)) {
    return choices.find((choice) => /(?:完全一致のみ|全(?:て|部|必要).*(?:場合のみ|満たす)|不足.*(?:含めない|提案しない))/.test(choice) && !/不足.*(?:許容|下位|候補)/.test(choice))
      ?? choices.find((choice) => /完全|全材料|すべて|全必要/.test(choice) && !/不足.*(?:許容|下位|候補)/.test(choice))
      ?? question.question.recommended;
  }
  const preferred = /source|recipe.*coverage|content/i.test(domain)
    ? /内蔵|アプリ内|あらかじめ|事前収録/
    : /storage|sync|identity|account|data.*boundary|ownership/i.test(domain)
      ? /端末|ローカル|アカウント不要/
      : null;
  return preferred ? choices.find((choice) => preferred.test(choice)) ?? question.question.recommended : question.question.recommended;
}

function answeredExpectedDomain(pattern) {
  return asked.some((item) => pattern.test(`${item.domain} ${item.title}`));
}

let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
context = applyAnalysis(context, await withTransientRetry(() => requirementsAI.analyzeIdea(idea)));
context = setDimensions(context, await withTransientRetry(() => requirementsAI.generateDimensions(context)));

for (let step = 0; step < 10 && !completionGate(context).complete; step += 1) {
  const question = planNext(context);
  if (question) {
    const answer = selectedAnswer(question);
    asked.push({ domain: question.question.decisionDomain, title: question.question.title, answer });
    console.log(JSON.stringify({ stage: "question_answered", ...asked.at(-1) }));
    context = recordAnswer(context, question.id, answer, answer === question.question.recommended);
    continue;
  }
  context = recordInference(context, await withTransientRetry(() => requirementsAI.inferMvp(context)));
  if (!planNext(context) && completionGate(context).coverageAuditPending) {
    context = applyCriticalDecisionCoverageAudit(context, await withTransientRetry(() => requirementsAI.auditCriticalDecisionCoverage(context)));
  }
  if (!planNext(context) && !completionGate(context).complete && !completionGate(context).coverageAuditPending) {
    throw new Error(`Recipe questioning stalled: ${JSON.stringify(completionGate(context))}`);
  }
}

assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
console.log(JSON.stringify({ stage: "questions_complete", questionCount: asked.length, questions: asked }));
assert.ok(asked.length > 0, "recipe idea must not complete with zero answers");
assert.ok(answeredExpectedDomain(/source|レシピ.*範囲|どのレシピ/i), "recipe content source must be confirmed");
assert.ok(answeredExpectedDomain(/match|partial|eligibility|当日作|条件|不足|必要.*食材|材料.*揃/i), "matching eligibility must be confirmed");
assert.ok(answeredExpectedDomain(/storage|sync|ownership|保存|同期/i), "data ownership/access boundary must be confirmed");

const diagnostics = [];
const result = await runSpecRepairPipeline({
  context,
  generateSpec: (canonicalContext) => withTransientRetry(() => requirementsAI.generateSpec(canonicalContext)),
  validateRemote: (canonicalContext, spec) => withTransientRetry(() => requirementsAI.validateSpec(canonicalContext, spec)),
  onDiagnostic: (entries) => diagnostics.push(...entries),
});

assert.equal(result.validation.valid, true, JSON.stringify(diagnostics));
assert.equal(result.context.canonicalRequirements.dataBoundary.mode, "local_only");
assert.equal(/同一ローカルデータを参照する画面へ即時反映/.test(result.spec.outOfScope), false);
if (process.env.PRINT_SPEC === "true") console.log(buildMarkdown(result.context, result.spec));
console.log(JSON.stringify({ status: "PASS", questionCount: asked.length, questions: asked, iterations: result.trace.length }));
