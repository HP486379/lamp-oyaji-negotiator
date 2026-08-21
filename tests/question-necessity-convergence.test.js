import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnalysis, applyCriticalDecisionCoverageAudit, calculatedConversationProgress,
  completionGate, createProjectContext, criticalDecisionRequiresQuestion,
  enableCriticalDecisionCoverageAudit, planNext, recordAnswer, recordInference, setDimensions,
} from "../requirements-core.js";

const necessity = (overrides = {}) => ({
  safeMvpDefaultAvailable: false,
  materiallyChangesProduct: true,
  derivableFromConfirmedDecision: false,
  requiresUserDecision: true,
  derivationDepth: 0,
  rationale: "製品の主要な挙動をユーザーが決める必要があります。",
  ...overrides,
});

const question = (id, boundary = "primary_flow") => ({
  title: `${id}をどうしますか？`, intent: "主要な製品挙動を決めます。",
  options: ["方式A", "方式B"], recommended: "方式A", recommendationReason: "MVPを明確にできるためです。",
  decisionDomain: id, decisionBoundary: boundary, informationGain: "high", architecturalImpact: "major",
  necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
});

function contextWithDecisions(idea, domains) {
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(idea));
  context = applyAnalysis(context, {
    projectType: "generic", platform: null, genre: null, purpose: idea,
    targetUsers: "主な利用者", managedObject: "管理対象", primaryAction: "対象を登録して確認する",
    persistedOutcome: "登録結果", successCondition: "登録結果を確認できる", knownFacts: [], uncertainties: [],
    criticalProductDecisions: domains.map((decisionDomain) => ({ decisionDomain, reason: "主要な選択です。", resolvedByInitialInput: false, necessity: necessity() })),
  });
  context = setDimensions(context, domains.map((id) => ({ id, label: id, importance: "high", userJudgmentRequired: true, known: false, value: null, question: question(id, id.includes("role") ? "roles_permissions" : "primary_flow") })));
  for (const id of domains) context = recordAnswer(context, id, `${id}の確定値`);
  return context;
}

test("Question Necessity Test rejects defaultable, non-material, and derived follow-on decisions", () => {
  assert.equal(criticalDecisionRequiresQuestion({ necessity: necessity() }), true);
  assert.equal(criticalDecisionRequiresQuestion({ necessity: necessity({ safeMvpDefaultAvailable: true }) }), false);
  assert.equal(criticalDecisionRequiresQuestion({ necessity: necessity({ materiallyChangesProduct: false }) }), false);
  assert.equal(criticalDecisionRequiresQuestion({ necessity: necessity({ derivableFromConfirmedDecision: true }) }), false);
  assert.equal(criticalDecisionRequiresQuestion({ necessity: necessity({ requiresUserDecision: false }) }), false);
});

test("ordinary reassessment cannot attach a question to a noncritical follow-on", () => {
  let context = contextWithDecisions("子どもの取引を親が承認するお小遣いアプリ", ["transaction_approval"]);
  context = recordInference(context, {
    aiInferredRequirements: [], implementationProposals: [], futureOptional: [], stateTransitionGaps: [],
    criticalProductDecisions: [{ decisionDomain: "approval_timeout", reason: "承認待ちの派生詳細です。", necessity: necessity({ safeMvpDefaultAvailable: true, derivationDepth: 2 }) }],
    clarificationQuestions: [{ id: "approval_timeout_q", label: "承認期限", importance: "high", question: question("approval_timeout") }],
  });
  assert.equal(context.reassessedCriticalProductDecisions?.some((item) => item.decisionDomain === "approval_timeout"), false);
  assert.equal(context.dimensions.some((item) => item.id === "approval_timeout_q"), false);
});

test("child allowance converges after major decisions instead of recursively asking approval details", () => {
  let context = contextWithDecisions("子どものお小遣いを管理するアプリを作りたい", [
    "roles_permissions", "transaction_approval", "balance_ownership", "primary_flow", "multiple_children_scope",
  ]);
  const followOns = [
    ["approval_timeout", { safeMvpDefaultAvailable: true }],
    ["child_withdrawal_notification", { safeMvpDefaultAvailable: true }],
    ["history_presentation", { materiallyChangesProduct: false }],
    ["pending_transaction_edit_details", { derivableFromConfirmedDecision: true }],
  ].map(([decisionDomain, flags]) => ({ decisionDomain, reason: "承認フローから派生した詳細です。", necessity: necessity({ ...flags, derivationDepth: 2 }) }));
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "派生詳細を評価しました。", auditedDecisionDomains: followOns.map((item) => item.decisionDomain),
    criticalProductDecisions: followOns,
    clarificationQuestions: [{ id: "approval_timeout_q", label: "承認期限", importance: "high", question: question("approval_timeout") }],
    aiInferredRequirements: [], implementationProposals: [{ key: "pending_default", title: "承認待ち", description: "期限を設けず承認待ちを維持します。", recommended: true, reason: "保守的で可逆的なMVP既定です。", alternatives: [] }],
    stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
  assert.equal(planNext(context), null);
  assert.deepEqual(context.criticalDecisionCoverageAudit.nonBlockingDecisionDomains.sort(), followOns.map((item) => item.decisionDomain).sort());
  assert.equal(calculatedConversationProgress(context), 100);
});

test("summer festival completion is not blocked by secondary exception handling", () => {
  let context = contextWithDecisions("町内会の夏祭りの出店とスタッフ配置を管理したい", ["staff_identity", "staff_assignment_flow", "assignment_conflict", "assignment_time_unit"]);
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "例外処理を評価しました。", auditedDecisionDomains: ["late_staff_reassignment", "conflict_message_format"],
    criticalProductDecisions: [
      { decisionDomain: "late_staff_reassignment", reason: "当日変更の詳細です。", necessity: necessity({ safeMvpDefaultAvailable: true, derivationDepth: 2 }) },
      { decisionDomain: "conflict_message_format", reason: "表示詳細です。", necessity: necessity({ materiallyChangesProduct: false, derivationDepth: 2 }) },
    ], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true);
  assert.equal(planNext(context), null);
});

test("a detailed initial idea can complete without manufacturing questions", () => {
  let context = enableCriticalDecisionCoverageAudit(createProjectContext("個人が読んだ本の題名と感想を手入力し、同じ端末の一覧で確認するアプリ"));
  context = applyAnalysis(context, {
    projectType: "reading_log", platform: null, genre: null, purpose: "読書記録を残す", targetUsers: "個人", managedObject: "本と感想",
    primaryAction: "題名と感想を手入力する", persistedOutcome: "読書記録", successCondition: "一覧で確認できる", knownFacts: [], uncertainties: [], criticalProductDecisions: [],
  });
  context = setDimensions(context, []);
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: true, coverageSummary: "主要フローは入力で確定済みです。", auditedDecisionDomains: ["actor", "entry_flow", "stored_result"],
    criticalProductDecisions: [], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true);
  assert.equal(planNext(context), null);
});

test("coverage audit still asks a genuinely new product-owner decision", () => {
  let context = contextWithDecisions("複数人で共有する申請アプリ", ["primary_flow"]);
  const newDecision = { decisionDomain: "irreversible_submission_policy", reason: "送信後の撤回可否で不可逆な主要フローが変わります。", necessity: necessity({ derivationDepth: 1 }) };
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "不可逆操作の方針が未確定です。", auditedDecisionDomains: [newDecision.decisionDomain],
    criticalProductDecisions: [newDecision],
    clarificationQuestions: [{ id: "submission_policy_q", label: "送信後の扱い", importance: "high", question: question(newDecision.decisionDomain) }],
    aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(planNext(context)?.question.decisionDomain, newDecision.decisionDomain);
  assert.deepEqual(context.criticalDecisionCoverageAudit.discoveredDecisionDomains, [newDecision.decisionDomain]);
});
