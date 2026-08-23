import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnalysis,
  completionGate,
  createProjectContext,
  enableCriticalDecisionCoverageAudit,
  ensureCompletionQuestion,
  planNext,
  recordAnswer,
  setDimensions,
  applyCriticalDecisionCoverageAudit,
} from "../requirements-core.js";

const grounding = (span) => ({
  grounded: true, sourceType: "initial_input", sourceRef: "idea", sourceInitialInputSpan: span,
  parentDomain: null, answerId: null, directCausalRelation: true,
  causalExplanation: "初期入力で明示された中心体験に直接必要です。",
  directlyAffectsPrimaryFlow: true, directlyAffectsRequiredData: false,
});

test("an unresolved material core capability blocks completion even when analysis omitted its decision", () => {
  const idea = "利用者が自動の相手と対戦できるアプリを作りたい";
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
  context = applyAnalysis(context, {
    projectType: "対話型アプリ", platform: null, genre: null,
    purpose: "利用者が自動の相手と対戦する。", targetUsers: "利用者", managedObject: "対戦", primaryAction: "相手と対戦する",
    persistedOutcome: null, successCondition: "対戦を完了できる", knownFacts: [], uncertainties: [], criticalProductDecisions: [],
    coreCapabilities: [{
      id: "interactive_counterparty", description: "利用者が自動の相手と対戦する", grounding: grounding("自動の相手と対戦"),
      requiredForCoreUserValue: true, requiredForPrimaryFlow: true, resolution: "unresolved",
      relatedDecisionDomains: ["counterparty_interaction_rules"], materiallyChangesProduct: true, requiresUserDecision: true,
      safeInference: { directDerivation: false, derivationDepth: 1, introducesNewProductValue: false, hasMultipleReasonableProductBehaviors: true, rationale: "対戦の進め方には複数の合理的な利用体験があります。" },
    }],
  });
  context = setDimensions(context, []);
  assert.equal(completionGate(context).complete, false);
  assert.ok(completionGate(context).unresolvedCriticalProductDecisions.some((item) => item.decisionDomain === "counterparty_interaction_rules"));
  context = ensureCompletionQuestion(context);
  assert.equal(planNext(context)?.question?.decisionDomain, "counterparty_interaction_rules");
  context = recordAnswer(context, planNext(context).id, "推奨される最小方針で進める", true);
  assert.ok(context.answeredDecisionDomains.includes("counterparty_interaction_rules"));
});

test("a directly inferred core capability with no behavioral alternative does not create a question", () => {
  const idea = "個人が記録を入力してこの端末の一覧で確認するアプリ";
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
  context = applyAnalysis(context, {
    projectType: "記録", platform: null, genre: null, purpose: "記録を一覧で確認する。", targetUsers: "個人", managedObject: "記録", primaryAction: "記録を入力して確認する",
    persistedOutcome: "この端末に記録を保持する", successCondition: "一覧で確認できる", knownFacts: [], uncertainties: [], criticalProductDecisions: [],
    coreCapabilities: [{
      id: "local_record_view", description: "入力した記録を同じ端末の一覧で確認する", grounding: grounding("この端末の一覧で確認"),
      requiredForCoreUserValue: true, requiredForPrimaryFlow: true, resolution: "safely_inferable",
      relatedDecisionDomains: [], materiallyChangesProduct: false, requiresUserDecision: false,
      safeInference: { directDerivation: true, derivationDepth: 1, introducesNewProductValue: false, hasMultipleReasonableProductBehaviors: false, rationale: "初期入力が端末内の一覧確認を直接定めています。" },
    }],
  });
  context = setDimensions(context, []);
  assert.equal(completionGate(context).unresolvedCriticalProductDecisions.length, 0);
});

test("coverage audit rediscovers an omitted material core capability before completion", () => {
  const idea = "利用者が相手と競う体験を提供するアプリ";
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
  context = applyAnalysis(context, {
    projectType: "対話型アプリ", platform: null, genre: null, purpose: "相手と競う体験を提供する。", targetUsers: "利用者", managedObject: "対戦", primaryAction: "相手と競う",
    persistedOutcome: null, successCondition: "体験を完了できる", knownFacts: [], uncertainties: [], coreCapabilities: [], criticalProductDecisions: [],
  });
  context = setDimensions(context, []);
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "中心の相手との振る舞いが未確定です。", auditedDecisionDomains: [], criticalProductDecisions: [], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
    coreCapabilities: [{
      id: "counterparty_behavior", description: "利用者が相手と競う", grounding: grounding("相手と競う"), requiredForCoreUserValue: true, requiredForPrimaryFlow: true,
      resolution: "unresolved", relatedDecisionDomains: ["counterparty_behavior_policy"], materiallyChangesProduct: true, requiresUserDecision: true,
      safeInference: { directDerivation: false, derivationDepth: 1, introducesNewProductValue: false, hasMultipleReasonableProductBehaviors: true, rationale: "競い方により利用者の体験が変わります。" },
    }],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(planNext(context)?.question?.decisionDomain, "counterparty_behavior_policy");
});
