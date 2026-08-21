import assert from "node:assert/strict";
import { SOURCE, buildCanonicalRequirements, calculatedConversationProgress, completionGate, createProjectContext, monotonicDisplayProgress, planNext, questionPresentationGuard, readiness, recordAnswer, recordInference, setDimensions, validateLocally } from "../requirements-core.js";

const productQuestion = (decisionDomain, options) => ({
  title: "MVPの方針を決めますか？", intent: "主要な予約体験を決めます。", options,
  recommended: options[0]?.label ?? options[0], recommendationReason: "主要フローを定義するためです。",
  decisionDomain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
  necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
});

const necessary = { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "予約の主要フローに不可欠です。" };

export function runSalonFlow() {
  let context = setDimensions(createProjectContext("美容院の予約ができるアプリを作りたい"), [
    {
      id: "booking_availability", label: "予約済み枠の扱い", importance: "high", userJudgmentRequired: true, known: false, value: null,
      question: productQuestion("reservation_availability", [
        { label: "確定済みの枠は全利用者が予約できない", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
        { label: "同一端末の利用者だけ予約済みとして扱う", violatesCoreInvariant: true, violatesConfirmedDecision: false, destructiveReason: "他の利用者が同じ枠を確定できてしまうためです。" },
        { label: "端末内だけで予約済み枠を排他する", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
      ]),
    },
    {
      id: "prepayment_policy", label: "事前決済", importance: "high", userJudgmentRequired: true, known: false, value: null,
      question: productQuestion("payment_policy", [
        { label: "事前決済は行わず予約だけを受け付ける", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
        { label: "事前決済を必須にする", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
      ]),
    },
  ]);

  assert.deepEqual(context.coreInvariants.map((item) => item.id), ["reservation_exclusivity", "confirmed_slot_unavailable", "reservation_conflict_recheck"]);
  const duplicateDimension = context.dimensions.find((item) => item.id === "booking_availability");
  assert.deepEqual(duplicateDimension.question.options, ["確定済みの枠は全利用者が予約できない"]);
  assert.equal(planNext(context)?.id, "prepayment_policy");

  context = recordAnswer(context, "prepayment_policy", "事前決済は行わず予約だけを受け付ける", true);
  context = recordInference(context, {
    aiInferredRequirements: [
      { key: "reservation_exclusivity", value: "確定済みの予約枠は他の利用者が予約できない。", reason: "予約のコア整合性です。", decisionDomain: "reservation_availability", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: necessary, eligibility: { sourceKey: "core_user_value", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false } },
      { key: "customer_account_required", value: "利用者アカウントを必須にする。", reason: "ゲスト予約等の代替があるため未確定です。", decisionDomain: "identity_policy", uniquelyDerived: false, hasMultipleReasonableImplementations: true, necessity: { ...necessary, coreUserValueRequired: false, primaryFlowRequired: false }, eligibility: { sourceKey: "initial_input", directDerivation: false, derivationDepth: 1, acceptanceCriteriaRequired: false, introducesNewProductValue: true } },
    ],
    implementationProposals: [], futureOptional: [],
    clarificationQuestions: [{ id: "repeat_booking_availability", label: "重複予約", importance: "high", question: productQuestion("reservation_exclusivity", [
      { label: "全利用者に対して枠を予約不可にする", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
      { label: "同一端末だけ予約済みとして扱う", violatesCoreInvariant: true, violatesConfirmedDecision: false, destructiveReason: "二重予約を許すためです。" },
    ]) }],
    stateTransitionGaps: [],
  });

  assert.equal(context.facts.some((fact) => fact.key === "customer_account_required" && fact.source === SOURCE.AI), false);
  assert.equal(context.implementationProposals.some((item) => item.key === "customer_account_required"), true);
  assert.equal(context.dimensions.some((item) => item.id === "repeat_booking_availability"), false);
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
  assert.equal(buildCanonicalRequirements(context).coreInvariants.length, 3);

  const spec = {
    projectOverview: "美容院の予約アプリ", coreUserValue: "利用者が空いている美容院の時間枠を安全に予約できる。",
    mvpScope: "空き枠の確認と予約を提供し、同一予約枠への重複確定を拒否する。", outOfScope: "ポイント、クーポン、通知、口コミは対象外。",
    userFlow: "利用者は空き枠を選び、予約を確定する。", screens: "空き枠一覧と予約確認画面。",
    functionalRequirements: "FR1: 利用者は空き枠を予約できる。FR2: 確定済みの枠は他の利用者が予約できない。",
    dataModel: "Reservation { id: string, slot: datetime }", stateTransitions: "予約確定直前に競合を再確認し、競合する予約は確定しない。",
    errorHandling: "競合が見つかった場合は予約を確定せず、空き枠を再確認する。", implementationRules: "排他制御の方式は実装時に選定する。",
    acceptanceCriteria: "AC1: 利用者は空き枠を予約できる。AC2: 同一の時間枠への重複予約は確定できない。",
  };
  assert.equal(validateLocally(context, spec).valid, true, JSON.stringify(validateLocally(context, spec).issues));
  return { questionCount: 1, questions: ["事前決済を必須にするか"], invariants: context.coreInvariants.map((item) => item.value) };
}

/** Reproduces the reported failure: the initial provider supplied no questions. */
export function runSalonCompletionGateFlow() {
  let context = setDimensions(createProjectContext("美容院の予約ができるアプリを作りたい"), []);
  assert.equal(readiness(context), 0);
  assert.equal(planNext(context), null);

  context = recordInference(context, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [] });
  const first = planNext(context);
  assert.equal(first?.id, "reservation_primary_flow");
  assert.doesNotMatch(first.question.title, /二重予約|重複予約/);
  assert.equal(first.question.options.some((option) => /同一端末.*予約済み|端末内.*排他/.test(option)), false);

  context = recordAnswer(context, first.id, "メニューと日時を選んで予約を確定する", true);
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "customer_account_required", value: "利用者アカウントを必須にする。", reason: "複数の合理的な識別方法があるため、必須にはできません。", decisionDomain: "identity_policy", uniquelyDerived: false, hasMultipleReasonableImplementations: true, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: false, reason: "未確定です。" }, eligibility: { sourceKey: "initial_input", directDerivation: false, derivationDepth: 1, acceptanceCriteriaRequired: false, introducesNewProductValue: true } }],
    implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [],
  });

  assert.equal(context.facts.some((fact) => fact.key === "customer_account_required" && fact.source === SOURCE.AI), false);
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
  const spec = {
    projectOverview: "美容院の予約アプリ", coreUserValue: "利用者がメニューと日時を選んで安全に予約できる。",
    mvpScope: "メニューと日時の選択、予約確定、同一予約枠への重複確定防止を提供する。", outOfScope: "任意の会員制度や通知。",
    userFlow: "利用者はメニューと日時を選び、予約を確定する。", screens: "予約選択画面と確認画面。",
    functionalRequirements: "FR1: 利用者はメニューと日時を選べる。FR2: 確定済み枠は他の利用者が予約できない。",
    dataModel: "Reservation { id: string, menu: string, slot: datetime }", stateTransitions: "予約確定直前に競合を再確認し、競合する同一時間枠の予約は確定しない。",
    errorHandling: "競合が見つかった場合は確定せず、利用者に空き枠を再確認させる。", implementationRules: "排他制御の内部方式は実装時に選定する。",
    acceptanceCriteria: "AC1: 利用者はメニューと日時を選んで予約できる。AC2: 同一時間枠への二重予約は確定できない。",
  };
  assert.equal(validateLocally(context, spec).valid, true, JSON.stringify(validateLocally(context, spec).issues));
  return { questionCount: 1, questions: [first.question.title], invariants: context.coreInvariants.map((item) => item.value) };
}

export function runSalonProductLanguageAndProgressFlow() {
  let context = setDimensions(createProjectContext("美容院の予約ができるアプリを作りたい"), []);
  const technicalQuestion = productQuestion("customer_info_required_at_reservation_creation", [
    { label: "予約作成時に顧客情報をNULL許容にする", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
    { label: "Reservationレコード作成時にNOT NULLにする", violatesCoreInvariant: false, violatesConfirmedDecision: false, destructiveReason: null },
  ]);
  technicalQuestion.title = "予約作成時の顧客情報をNULL許容にしますか？";
  technicalQuestion.intent = "永続化とレコード作成の方式を決めます。";
  technicalQuestion.recommendationReason = "DBの制約を簡単にするためです。";
  technicalQuestion.presentation = { isProductLanguage: false, technicalTermsFound: ["NULL", "DB", "レコード"] };
  context = recordInference(context, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [{ id: "customer_info_required_at_reservation_creation", label: "顧客情報", importance: "high", question: technicalQuestion }], stateTransitionGaps: [] });
  const question = planNext(context);
  assert.equal(question?.id, "customer_info_required_at_reservation_creation");
  assert.equal(questionPresentationGuard(question.question, context).safe, true);
  assert.doesNotMatch([question.question.title, question.question.intent, question.question.recommendationReason, ...question.question.options].join("\n"), /NULL|\bDB\b|永続化|レコード|Reservation|NOT NULL/i);
  assert.match(question.question.title, /予約する人の情報/);

  assert.equal(monotonicDisplayProgress(99, 50), 99);
  assert.equal(completionGate(context).complete, false);
  assert.ok(calculatedConversationProgress(context) < 100);
  assert.equal(monotonicDisplayProgress(100, calculatedConversationProgress(context)), 100);
  context = recordAnswer(context, question.id, question.question.recommended, true);
  context = recordInference(context, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [] });
  assert.equal(readiness(context), 100);
  return question.question;
}
