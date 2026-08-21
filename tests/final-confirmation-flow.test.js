import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE, applyAnalysis, applyCriticalDecisionCoverageAudit, completionGate, confirmFinalDecisions,
  createProjectContext, enableCriticalDecisionCoverageAudit, planNext, recordAnswer,
  registerFinalConfirmation, semanticDecisionDomainEquivalent, setDimensions,
} from "../requirements-core.js";

const question = (id, domain) => ({
  id, label: id, importance: "high", userJudgmentRequired: true, known: false, value: null,
  question: {
    title: `${id}を決めます`, intent: "主要なプロダクト挙動を決めます。", options: ["案A", "案B"], recommended: "案A", recommendationReason: "MVPに適するためです。",
    decisionDomain: domain, decisionBoundary: domain === "roles_permissions" ? "roles_permissions" : "primary_flow", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  },
});

function allowanceContext() {
  let context = enableCriticalDecisionCoverageAudit(createProjectContext("子どものお小遣いを管理するアプリを作りたい"));
  context = applyAnalysis(context, {
    projectType: "お小遣い管理", platform: null, genre: null, purpose: "子どものお小遣いを管理する。", targetUsers: "保護者と子ども", managedObject: "お小遣い取引",
    primaryAction: "お小遣いの取引を登録する", persistedOutcome: "取引と残高", successCondition: "現在残高を確認できる", knownFacts: [], uncertainties: [],
    criticalProductDecisions: [
      { decisionDomain: "roles_permissions", reason: "誰が操作するか。", resolvedByInitialInput: false },
      { decisionDomain: "primary_flow", reason: "お小遣いをどう登録するか。", resolvedByInitialInput: false },
      { decisionDomain: "mvp_feature", reason: "残高整合性をどう保つか。", resolvedByInitialInput: false },
    ],
  });
  context = setDimensions(context, [
    question("roles_permissions_account_model", "roles_permissions"),
    question("primary_flow_auto_allowance", "primary_flow"),
    question("mvp_feature_consistency_guarantee", "mvp_feature"),
  ]);
  context = recordAnswer(context, "roles_permissions_account_model", "保護者が管理し子どもが確認する");
  context = recordAnswer(context, "primary_flow_auto_allowance", "保護者が入金・支出を登録する");
  context = recordAnswer(context, "mvp_feature_consistency_guarantee", "取引履歴から残高を一貫して計算する");
  context = {
    ...context,
    facts: [...context.facts, { key: "transaction_types", value: "入金と支出を扱う", source: SOURCE.AI, decisionDomain: "transaction_types", uniquelyDerived: true }],
    inferredDecisionDomains: [...context.inferredDecisionDomains, "transaction_types"],
  };
  return applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: true, coverageSummary: "主要判断は解決済みです。", auditedDecisionDomains: ["roles_permissions", "primary_flow", "mvp_feature", "transaction_types"],
    criticalProductDecisions: [], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
}

test("final confirmation approval deduplicates answered semantic domains and proceeds to SPEC generation", () => {
  const transitions = ["QUESTIONING", "COVERAGE_AUDIT"];
  let context = allowanceContext();
  assert.equal(completionGate(context).complete, true);
  const review = registerFinalConfirmation(context);
  assert.equal(review.loopDetected, false);
  context = review.context;
  transitions.push("FINAL_CONFIRMATION");

  context = confirmFinalDecisions(context);
  transitions.push("USER_CONFIRMED", "FINAL_COVERAGE_CHECK");
  assert.equal(completionGate(context).complete, false, "final approval must invalidate the previous audit fingerprint");
  assert.deepEqual(context.confirmedFinalDecisions.map((item) => item.id).sort(), ["mvp_feature_consistency_guarantee", "primary_flow_auto_allowance", "roles_permissions_account_model", "transaction_types"].sort());

  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "既存決定の表現差だけが返りました。", auditedDecisionDomains: ["roles_permissions", "primary_flow"],
    criticalProductDecisions: [
      { decisionDomain: "roles_permissions", reason: "既回答domainです。" },
      { decisionDomain: "primary_flow", reason: "既回答domainです。" },
      { decisionDomain: "roles_permissions_account_model", reason: "ID表現だけが異なります。" },
    ],
    clarificationQuestions: [{ ...question("roles_again", "roles_permissions"), label: "roles_again" }],
    aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
  assert.equal(planNext(context), null);
  assert.deepEqual(context.criticalDecisionCoverageAudit.discoveredDecisionDomains, []);
  transitions.push("SPEC_GENERATION");
  assert.deepEqual(transitions, ["QUESTIONING", "COVERAGE_AUDIT", "FINAL_CONFIRMATION", "USER_CONFIRMED", "FINAL_COVERAGE_CHECK", "SPEC_GENERATION"]);
});

test("final coverage check returns only a genuinely new semantic decision to questioning", () => {
  let context = confirmFinalDecisions(registerFinalConfirmation(allowanceContext()).context);
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "取引の訂正方法が新たに未確定です。", auditedDecisionDomains: ["transaction_edit_policy"],
    criticalProductDecisions: [{ decisionDomain: "transaction_edit_policy", reason: "回答によって主要な訂正フローが変わります。" }],
    clarificationQuestions: [question("transaction_edit_policy", "transaction_edit_policy")],
    aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(planNext(context)?.id, "transaction_edit_policy");
  assert.equal(context.criticalDecisionCoverageAudit.discoveredDecisionDomains.length, 1);
});

test("same final decision fingerprint cannot display FINAL_CONFIRMATION twice", () => {
  const first = registerFinalConfirmation(allowanceContext());
  assert.equal(first.loopDetected, false);
  const second = registerFinalConfirmation(first.context);
  assert.equal(second.loopDetected, true);
  assert.equal(semanticDecisionDomainEquivalent("roles_permissions_account_model", "roles_permissions"), true);
  assert.equal(semanticDecisionDomainEquivalent("primary_flow_auto_allowance", "primary_flow"), true);
});
