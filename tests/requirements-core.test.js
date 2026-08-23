import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE, applyAnalysis, applyCriticalDecisionCoverageAudit, buildCanonicalRequirements, buildMarkdown, buildRepairDiagnostics, buildSessionTrace, buildValidationLogEntries, calculatedConversationProgress, canonicalizeContext, canonicalizeSpec, completionGate, createProjectContext, deriveCoreInvariants, enableCriticalDecisionCoverageAudit, ensureCompletionQuestion, hasUnresolvedStateTransitionGaps, planNext, questionPresentationGuard, readiness, recordAnswer, recordInference, repairConsistency, runSpecRepairPipeline, setDimensions, validateLocally } from "../requirements-core.js";

const dimensions = [{ id: "audience", label: "対象者", importance: "high", userJudgmentRequired: true, known: false, value: null, question: { title: "誰が使いますか？", intent: "利用者を決めます", options: ["一般利用者", "業務利用者"], recommended: "一般利用者", recommendationReason: "MVPの対象を絞れます" } }];
const completeSpec = { projectOverview: "入力したアイデアに基づくアプリ", coreUserValue: "利用者が短時間で目的を達成できる", mvpScope: "最小の主要フローを提供する", outOfScope: "次期以降の拡張", userFlow: "開始、入力、結果表示", screens: "開始画面と結果画面", functionalRequirements: "入力を処理して結果を表示する", dataModel: "必要最小限のデータ", stateTransitions: "開始から完了", errorHandling: "失敗時に再試行を案内する", implementationRules: "個人情報を不用意に保存しない", acceptanceCriteria: "主要フローを完了できる" };

test("unrelated ideas use the same generic workflow and retain isolation", () => {
  for (const idea of [
    "ハムスターがケージから脱出するゲームを作りたい",
    "Jポップのイントロクイズが簡単にできるゲームを作りたい",
    "気軽に始められる瞑想アプリを作りたい",
    "2つのPDFを比較して差分を表示するアプリを作りたい",
    "自動設定した予定を誰でも編集してポイントをもらえるアプリを作りたい",
    "料理の献立と買い物リストを提案するアプリを作りたい",
  ]) {
    let context = setDimensions(applyAnalysis(createProjectContext(idea), { purpose: idea, knownFacts: [] }), dimensions);
    context = recordAnswer(context, "audience", "一般利用者", true);
    context = recordInference(context, { aiInferredRequirements: [{ key: "core_flow", value: "主要フロー", reason: "MVPに必要" }], implementationProposals: [], futureOptional: [] });
    assert.equal(planNext(context), null);
    assert.ok(validateLocally(context, completeSpec).valid);
    assert.match(buildMarkdown(context, completeSpec), /User Confirmed Decisions/);
  }
});

test("each new project has a fresh isolated context", () => {
  const first = recordAnswer(setDimensions(createProjectContext("first"), dimensions), "audience", "first");
  const second = setDimensions(createProjectContext("second"), dimensions);
  assert.notEqual(first.sessionId, second.sessionId); assert.equal(second.answers.audience, undefined); assert.equal(second.history.length, 0);
});

test("nullable values remain unanswered until decided", () => {
  assert.equal(planNext(setDimensions(createProjectContext("nullable"), dimensions)).id, "audience");
});

test("v4.1 renders each decision in exactly one visible category", () => {
  let context = setDimensions(createProjectContext("分類テスト"), dimensions);
  context = recordAnswer(context, "audience", "利用者", true);
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "offline_mode", value: "不要", reason: "MVPでは不要" }],
    implementationProposals: [{ key: "ui_stack", title: "UI技術", description: "Vite + React", recommended: true, reason: "素早く検証できる", alternatives: ["別のWeb UI"] }],
    futureOptional: [{ key: "analytics", value: "利用分析", reason: "MVP後に判断" }],
  });
  const markdown = buildMarkdown(context, completeSpec);
  for (const heading of ["User Confirmed Decisions", "AI-Inferred Requirements", "Implementation Proposal", "Future / Optional"]) assert.match(markdown, new RegExp(`## ${heading.replace("/", "\\/")}`));
  assert.ok(validateLocally(context, completeSpec).valid);
});

test("v4.1 canonicalizes internal duplication into a non-blocking warning", () => {
  const context = { ...createProjectContext("不正分類"), facts: [{ key: "same", value: "user", source: SOURCE.USER }, { key: "same", value: "ai", source: SOURCE.AI }], implementationProposals: [{ key: "one", recommended: true }, { key: "two", recommended: true }], futureOptional: [] };
  const result = validateLocally(context, completeSpec);
  assert.equal(result.valid, true); assert.ok(result.issues.some((issue) => issue.section === "classification" && issue.severity === "warning")); assert.ok(result.issues.some((issue) => issue.section === "Implementation Proposal" && issue.severity === "warning"));
});

test("travel checklist regression canonicalizes categories and allows SPEC generation", () => {
  let context = setDimensions(createProjectContext("旅行の持ち物チェックリストを自動提案し、予定に合わせて編集できるアプリ"), dimensions);
  context = recordAnswer(context, "audience", "旅行者", true);
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "sharing_format", value: "チェックリストを共有できる", reason: "同行者との確認に必要" }],
    implementationProposals: [{ key: "local_storage_tech", title: "保存方式", description: "localStorage", recommended: true, reason: "MVPを素早く検証できる", alternatives: ["SQLite"] }],
    futureOptional: [{ key: "cloud_sync", value: "クラウド同期", reason: "MVP後に判断" }, { key: "advanced_analytics_and_usage_tracking", value: "高度な利用分析", reason: "MVP後に判断" }],
  });
  // Simulate a provider retaining provenance in more than one internal field.
  context = { ...context, inferredDecisions: { ...context.inferredDecisions, audience: { value: "旅行者", reason: "古い内部記録" } } };
  const result = validateLocally(context, completeSpec);
  assert.equal(result.valid, true);
  const markdown = buildMarkdown(context, completeSpec);
  assert.equal((markdown.match(/\*\*sharing_format\*\*/g) ?? []).length, 1);
  for (const heading of ["User Confirmed Decisions", "AI-Inferred Requirements", "Implementation Proposal", "Future / Optional", "MVP Scope"]) assert.match(markdown, new RegExp(heading.replace("/", "\\/")));
});

test("confirmed advanced gamification is never silently reduced and requests clarification", () => {
  let context = setDimensions(createProjectContext("親子の貯金習慣アプリ"), dimensions);
  context = recordAnswer(context, "audience", "保護者と子供");
  context = { ...context, facts: [...context.facts, { key: "education", value: "高度：ゲーム化（ゲーミフィケーション）を導入", source: SOURCE.USER, reason: "ユーザーが自由回答で決定" }] };
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "simple_gamification_core", value: "MVP向けに最小限のゲーム化を実装", reason: "簡略化", necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: false, reason: "不要" } }],
    implementationProposals: [], futureOptional: [],
    clarificationQuestions: [{ id: "gamification_scope", label: "ゲーム化の詳細", importance: "high", question: { title: "高度なゲーム化で、MVPに含める要素は？", intent: "ユーザーの決定を縮小せず具体化します", options: ["レベル／経験値", "バッジ／実績", "連続記録", "ミッション／クエスト", "仮想報酬", "複数を組み合わせる"], recommended: "複数を組み合わせる", recommendationReason: "高度という要望を具体化するため" } }],
  });
  assert.equal(planNext(context).id, "gamification_scope");
  const reduced = { ...completeSpec, mvpScope: "最小限のゲーミフィケーションを実装", implementationRules: "ゲーミフィケーションは最小限のバッジに限定", acceptanceCriteria: "バッジだけを表示できる" };
  assert.equal(validateLocally(context, reduced).valid, false);
  assert.ok(validateLocally(context, reduced).issues.some((issue) => /縮小/.test(issue.message)));
});

test("unrequested convenience features do not become MVP requirements", () => {
  const context = { ...createProjectContext("簡単な家計メモ"), facts: [{ key: "idea", value: "簡単な家計メモ", source: SOURCE.INITIAL }, { key: "audience", value: "個人", source: SOURCE.USER }], implementationProposals: [{ key: "backup", title: "バックアップ", description: "クラウドバックアップ", recommended: true, reason: "任意", alternatives: [] }], futureOptional: [{ key: "analytics", value: "高度なAnalytics", reason: "将来" }] };
  const inflated = { ...completeSpec, mvpScope: "CSVエクスポート、チュートリアル、バックアップ、高度なAnalytics、クラウド同期は必須", functionalRequirements: "CSVエクスポートを提供する", acceptanceCriteria: "クラウド同期できる" };
  const result = validateLocally(context, inflated);
  assert.equal(result.valid, false);
  assert.ok(result.issues.filter((issue) => issue.severity === "error").length >= 3);
});

test("an answered decision key is never asked again, including generated duplicates", () => {
  const externalQuestion = { title: "外部送金や銀行連携を含めますか？", intent: "不要な新機能を確認しない", options: ["含めない", "含める"], recommended: "含めない", recommendationReason: "MVPを絞る", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesUserRequest: false, introducesNewFeature: true } };
  const coreQuestion = { title: "中心となる体験は？", intent: "主要フローを決める", options: ["記録", "目標"], recommended: "記録", recommendationReason: "基本価値", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesUserRequest: false, introducesNewFeature: false } };
  let context = setDimensions(createProjectContext("子供のお小遣い管理アプリ"), [
    { id: "external_transfer", label: "外部送金", importance: "high", userJudgmentRequired: true, known: false, value: null, question: externalQuestion },
    { id: "core_experience", label: "中心体験", importance: "high", userJudgmentRequired: true, known: false, value: null, question: coreQuestion },
  ]);
  assert.equal(planNext(context).id, "core_experience");
  context = recordAnswer(context, "external_transfer", "含めない");
  assert.equal(recordAnswer(context, "external_transfer", "含める"), context);
  context = recordInference(context, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [{ id: "external_transfer", label: "外部送金", importance: "high", question: coreQuestion }] });
  assert.notEqual(planNext(context)?.id, "external_transfer");
  assert.equal(context.facts.filter((fact) => fact.key === "external_transfer" && fact.source === SOURCE.USER).length, 1);
});

test("question necessity permits product-value clarification but blocks a new feature", () => {
  const allowed = { title: "ゲーム化の詳細", intent: "明示要求を具体化", options: ["レベル／経験値", "複数を組み合わせる"], recommended: "複数を組み合わせる", recommendationReason: "高度な要求を満たす", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesUserRequest: true, introducesNewFeature: false } };
  const blocked = { title: "銀行連携を含めますか？", intent: "新機能", options: ["含めない", "含める"], recommended: "含めない", recommendationReason: "不要", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesUserRequest: false, introducesNewFeature: true } };
  const context = setDimensions(createProjectContext("子供のお小遣い管理アプリ"), [
    { id: "bank_link", label: "銀行連携", importance: "high", userJudgmentRequired: true, known: false, value: null, question: blocked },
    { id: "gamification_scope", label: "ゲーム化の詳細", importance: "high", userJudgmentRequired: true, known: false, value: null, question: allowed },
  ]);
  assert.equal(planNext(context).id, "gamification_scope");
});

test("answered decisions survive a failed-or-retried inference transition", () => {
  let context = setDimensions(createProjectContext("子供のお小遣い管理アプリ"), dimensions);
  context = recordAnswer(context, "audience", "保護者と子供", true);
  const beforeRetry = JSON.parse(JSON.stringify(context));
  const afterRetry = recordInference(beforeRetry, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [] });
  assert.equal(afterRetry.answers.audience, "保護者と子供");
  assert.deepEqual(afterRetry.answeredQuestionKeys, ["audience"]);
  assert.equal(afterRetry.facts.filter((fact) => fact.key === "audience" && fact.source === SOURCE.USER).length, 1);
});

test("product decision sufficiency reaches 100 without implementation-detail questions", () => {
  const product = { title: "誰が使いますか？", intent: "対象者", options: ["親子", "子供"], recommended: "親子", recommendationReason: "中心価値", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false } };
  const detail = { title: "PINポリシーは？", intent: "実装詳細", options: ["4桁", "6桁"], recommended: "4桁", recommendationReason: "詳細", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesExplicitUserRequest: false, changesProductBehavior: false, introducesNewFeature: false, implementationDetailOnly: true, derivedOnlyFromAIInference: true } };
  let context = setDimensions(createProjectContext("子供のお小遣い管理アプリ"), [{ id: "account", label: "親子構造", importance: "high", userJudgmentRequired: true, known: false, value: null, question: product }, { id: "pin_policy", label: "PIN", importance: "low", userJudgmentRequired: true, known: false, value: null, question: detail }]);
  assert.equal(planNext(context).id, "account");
  context = recordAnswer(context, "account", "親子");
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
});

test("child allowance SPEC canonicalizes semantic requirements and blocks unconfirmed proposal details", () => {
  const context = {
    ...createProjectContext("A local-only child allowance manager"),
    facts: [
      { key: "idea", value: "A local-only child allowance manager", source: SOURCE.INITIAL },
      { key: "accounts", value: "A parent manages multiple child profiles", source: SOURCE.USER },
      { key: "pin", value: "The parent screen uses a 4 digit PIN", source: SOURCE.USER },
      { key: "parent_account_creation", value: "Create linked parent and child accounts", reason: "core flow", source: SOURCE.AI },
      { key: "basic_accounts", value: "Parent and child account relationship", reason: "core flow", source: SOURCE.AI },
      { key: "account_linking", value: "Link each child profile to its parent account", reason: "core flow", source: SOURCE.AI },
      { key: "history_and_filtering", value: "Category-based transaction history with filters", reason: "core flow", source: SOURCE.AI },
      { key: "transaction_categories_and_filters", value: "Transaction categories and filtered history", reason: "core flow", source: SOURCE.AI },
      { key: "category_filter_and_history", value: "Filter history by transaction category", reason: "core flow", source: SOURCE.AI },
      { key: "edit_proposal_workflow", value: "Child edit proposals require parent approval", reason: "permission flow", source: SOURCE.AI },
      { key: "edit_proposal_model", value: "Parent-approved proposal model for child edits", reason: "permission flow", source: SOURCE.AI },
    ],
    implementationProposals: [{ key: "pin_lockout", title: "PIN lockout", description: "Lock after 3 failed PIN attempts for 5 minutes", recommended: true, reason: "optional hardening", alternatives: [] }],
    futureOptional: [],
  };
  const model = canonicalizeContext(context);
  assert.equal(model.aiInferredRequirements.filter((item) => /account/.test(item.key)).length, 0);
  assert.equal(model.userConfirmed.filter((item) => /accounts/.test(item.key)).length, 1);
  assert.equal(model.aiInferredRequirements.filter((item) => /history|filter|categor/.test(item.key)).length, 0);
  assert.equal(model.implementationProposals.filter((item) => /history|filter|categor/.test(item.key)).length, 1);
  assert.equal(model.aiInferredRequirements.filter((item) => /edit.*proposal/.test(item.key)).length, 0);
  assert.equal(model.implementationProposals.filter((item) => /edit.*proposal/.test(item.key)).length, 1);

  const unsafe = canonicalizeSpec(context, {
    ...completeSpec,
    dataModel: "Parent { id, name, email, pinHash }",
    functionalRequirements: "Views use real-time sync for balances.",
    implementationRules: "Lock the PIN after 3 failed attempts for 5 minutes.",
    acceptanceCriteria: "The parent can use the 4 digit PIN and a 5 minute lockout occurs after 3 failures.",
  });
  assert.doesNotMatch(unsafe.dataModel, /email/i);
  assert.doesNotMatch(unsafe.functionalRequirements, /real-time sync/i);
  assert.equal(validateLocally(context, unsafe).valid, true);

  const safe = { ...unsafe, implementationRules: "Use the confirmed 4 digit PIN to protect the parent screen.", acceptanceCriteria: "The parent screen requires the confirmed 4 digit PIN before management actions." };
  assert.equal(validateLocally(context, safe).valid, true);
});

test("fridge flow stops after product decisions and rejects recursive implementation questions", () => {
  const productQuestion = (title) => ({ title, intent: "Changes the product's direct value", options: ["Option A", "Option B"], recommended: "Option A", recommendationReason: "MVP fit", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } });
  const blockedQuestion = (decisionClass, title) => ({ title, intent: "Internal implementation detail", options: ["A", "B"], recommended: "A", recommendationReason: "Not a product-owner decision", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesExplicitUserRequest: false, changesProductBehavior: false, introducesNewFeature: false, implementationDetailOnly: decisionClass === "implementation", derivedOnlyFromAIInference: true, decisionClass, requiresUserDecision: false } });
  let context = setDimensions(createProjectContext("A refrigerator food inventory app"), [
    { id: "audience", label: "Who uses it", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion("Who uses it?") },
    { id: "registration", label: "How to register", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion("How are foods registered?") },
    { id: "expiry", label: "Expiry handling", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion("How are expiry dates handled?") },
  ]);
  for (const dimension of [...context.dimensions]) context = recordAnswer(context, dimension.id, dimension.id === "registration" ? "Recognize a photo and present choices" : "Option A");
  context = recordInference(context, {
    aiInferredRequirements: [],
    implementationProposals: [
      { key: "merge_strategy", title: "Merge strategy", description: "Choose deterministic field merging", recommended: true, reason: "Internal consistency", alternatives: [] },
      { key: "sync_frequency", title: "Sync frequency", description: "Choose an appropriate refresh strategy", recommended: false, reason: "Implementation detail", alternatives: [] },
      { key: "change_log", title: "Change logging", description: "Keep an internal audit trail if useful", recommended: false, reason: "Implementation detail", alternatives: [] },
    ], futureOptional: [],
    clarificationQuestions: [
      { id: "photo_candidate_rejection", label: "Candidate rejection", importance: "low", question: blockedQuestion("edge_case", "What happens if no photo candidate is chosen?") },
      { id: "field_merge", label: "Field merge", importance: "low", question: blockedQuestion("implementation", "What are the exact field merge rules?") },
      { id: "sync_interval", label: "Sync interval", importance: "low", question: blockedQuestion("implementation", "Use seconds or one minute sync?") },
      { id: "log_display", label: "Log display", importance: "low", question: blockedQuestion("implementation", "Show internal change logs?") },
    ],
  });
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
  assert.equal(context.dimensions.some((item) => /photo_candidate_rejection|field_merge|sync_interval|log_display/.test(item.id)), false);
  assert.equal(context.implementationProposals.length, 3);
});

test("completion gate retains unresolved product decisions when an ambiguous family refrigerator idea starts with one question", async () => {
  const question = (domain, title) => ({
    title, intent: "家族が食材を管理する中心的な使い方を決めます。", options: ["選択肢A", "選択肢B"], recommended: "選択肢A", recommendationReason: "MVPの中心となる使い方を明確にするためです。",
    decisionDomain: domain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  });
  const analysis = {
    projectType: "食材管理", platform: null, genre: null, purpose: "家族が冷蔵庫内の食材を把握して管理する。", targetUsers: "家族", managedObject: "冷蔵庫内の食材", primaryAction: "食材の情報を確認して管理する。", persistedOutcome: null, successCondition: null, knownFacts: [], uncertainties: ["食材の登録方法", "管理で優先する情報"],
    criticalProductDecisions: [
      { decisionDomain: "food_registration_method", reason: "食材をどのように登録するかで主要な操作フローが変わります。", resolvedByInitialInput: false },
      { decisionDomain: "food_management_priority", reason: "家族が食材の何を優先して管理するかが未確定です。", resolvedByInitialInput: false },
    ],
  };
  let context = setDimensions(applyAnalysis(createProjectContext("家族の冷蔵庫にある食材を管理するアプリを作りたい"), analysis), [
    { id: "food_registration_method", label: "食材の登録方法", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("food_registration_method", "食材はどのように登録しますか？") },
  ]);
  assert.equal(planNext(context)?.id, "food_registration_method");
  context = recordAnswer(context, "food_registration_method", "手動で名前と数量を入力する", true);
  assert.equal(completionGate(context).complete, false);
  assert.equal(calculatedConversationProgress(context), 50);

  context = recordInference(context, {
    aiInferredRequirements: [], implementationProposals: [], futureOptional: [], stateTransitionGaps: [],
    clarificationQuestions: [{ id: "food_management_priority", label: "管理の中心", importance: "high", question: question("food_management_priority", "食材について、何を中心に確認できるようにしますか？") }],
  });
  assert.equal(planNext(context)?.id, "food_management_priority");
  assert.ok(calculatedConversationProgress(context) < 100);
  context = recordAnswer(context, "food_management_priority", "食材の残量と期限を確認する", true);
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
  assert.equal(calculatedConversationProgress(context), 100);

  const fridgeSpec = {
    projectOverview: "家族向け冷蔵庫食材管理アプリ", coreUserValue: "家族が冷蔵庫にある食材の残量と期限を把握できる。",
    mvpScope: "食材を手動登録し、残量と期限を一覧で確認する。", outOfScope: "購入提案や外部サービス連携。",
    userFlow: "家族は食材名と数量を入力し、残量と期限を確認する。", screens: "食材一覧と登録画面。",
    functionalRequirements: "FR1: 家族は食材名と数量を登録できる。FR2: 登録済み食材の残量と期限を確認できる。",
    dataModel: "FoodItem { id: string, name: string, quantity: number, expiryDate: date }", stateTransitions: "入力中 -> 登録済み: 食材情報を保存し、一覧に表示する。",
    errorHandling: "必須情報が不足する場合は入力を促す。", implementationRules: "入力内容を同じ家族の利用範囲で扱う。",
    acceptanceCriteria: "AC1: 家族は食材を登録できる。AC2: 登録後に残量と期限を確認できる。",
  };
  const result = await runSpecRepairPipeline({ context, generateSpec: async () => ({ spec: fridgeSpec }), validateRemote: async () => ({ valid: true, issues: [] }) });
  assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
});

test("a family-sharing answer and an inferred food-field requirement cannot complete an ambiguous refrigerator product", () => {
  const question = (domain, title) => ({
    title, intent: "家族が使う中心的な体験を決めます。", options: ["選択肢A", "選択肢B"], recommended: "選択肢A", recommendationReason: "MVPの中心を明確にするためです。",
    decisionDomain: domain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  });
  const analysis = {
    projectType: "食材管理", platform: null, genre: null, purpose: "家族の冷蔵庫にある食材を管理する。", targetUsers: "家族", managedObject: "冷蔵庫内の食材", primaryAction: "食材を管理する", persistedOutcome: null, successCondition: null, knownFacts: [], uncertainties: ["食材を管理する中心的な方法"], criticalProductDecisions: [],
  };
  let context = setDimensions(applyAnalysis(createProjectContext("家族の冷蔵庫にある食材を管理するアプリを作りたい"), analysis), [
    { id: "family_sharing", label: "家族での利用", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("family_sharing", "家族でどのように使いますか？") },
  ]);
  context = recordAnswer(context, "family_sharing", "家族メンバー全員が閲覧と編集（追加・更新・削除）できる共有モード", true);
  context = recordInference(context, {
    aiInferredRequirements: [{
      key: "required_fields_for_food_item", value: "食材には管理に必要な基本情報を保持する。", reason: "一覧表示に必要です。", decisionDomain: "food_item_fields", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "中心的な利用に必要です。" },
      eligibility: { sourceKey: "initial_input", sourceDecisionIds: [], sourceInitialInputSpan: "食材を管理する", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false },
    }], implementationProposals: [], futureOptional: [], stateTransitionGaps: [],
    criticalProductDecisions: [{ decisionDomain: "food_registration_method", reason: "食材をどう登録するかで主要な利用フローが変わります。" }],
    clarificationQuestions: [{ id: "food_registration_method", label: "食材の登録方法", importance: "high", question: question("food_registration_method", "食材はどのように登録しますか？") }],
  });
  assert.equal(completionGate(context).complete, false, JSON.stringify(completionGate(context)));
  assert.ok(calculatedConversationProgress(context) < 100);
  assert.equal(planNext(context)?.id, "food_registration_method");
  assert.equal(context.facts.some((fact) => fact.key === "required_fields_for_food_item" && fact.source === SOURCE.AI), true);
});

test("a scope-only refrigerator answer creates a primary-flow question even when inference returns only single-household scope", () => {
  const shareQuestion = {
    title: "冷蔵庫の共有と編集権限の範囲", intent: "家族での共有範囲を決めます。", options: ["家族内の全員が同等に閲覧・編集できる", "管理者だけが編集できる"], recommended: "家族内の全員が同等に閲覧・編集できる", recommendationReason: "家族で使いやすいためです。",
    decisionDomain: "primary_share_model", decisionBoundary: "roles_permissions", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  };
  let context = applyAnalysis(createProjectContext("家族の冷蔵庫にある食材を管理するアプリを作りたい"), {
    projectType: "食材管理", platform: null, genre: null, purpose: "家族の冷蔵庫にある食材を管理する。", targetUsers: "家族", managedObject: "食材", primaryAction: "食材を管理する", persistedOutcome: null, successCondition: null, knownFacts: [], uncertainties: [], criticalProductDecisions: [],
  });
  context = setDimensions(context, [{ id: "q_primary_share_model", label: "共有範囲", importance: "high", userJudgmentRequired: true, known: false, value: null, question: shareQuestion }]);
  context = recordAnswer(context, "q_primary_share_model", "家族内の全員が同等に閲覧・編集できる", true);
  assert.equal(completionGate(context).complete, false);
  assert.equal(calculatedConversationProgress(context), 50);
  assert.equal(planNext(ensureCompletionQuestion(context))?.id, "primary_flow_definition");

  context = recordInference(context, {
    aiInferredRequirements: [{
      key: "single_household_scope", value: "MVPは一つの家族の冷蔵庫内での食材管理に限定する。", reason: "共有範囲から直接導出できます。", decisionDomain: "single_household_scope", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: true, coreUserValueRequired: true, primaryFlowRequired: true, reason: "共有範囲に必要です。" },
      eligibility: { sourceKey: "primary_share_model", sourceDecisionIds: ["q_primary_share_model"], sourceInitialInputSpan: null, directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false },
    }], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [], criticalProductDecisions: [],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(calculatedConversationProgress(context), 50);
  assert.equal(planNext(context)?.id, "primary_flow_definition");
});

test("detailed initial input resolves its declared product decisions without adding questions", () => {
  const analysis = {
    projectType: "食材管理", platform: null, genre: null, purpose: "家族が冷蔵庫内の食材を残量と期限で管理する。", targetUsers: "家族", managedObject: "冷蔵庫内の食材", primaryAction: "食材を手動登録して残量と期限を確認する。", persistedOutcome: "食材情報", successCondition: "家族が残量と期限を確認できる", knownFacts: [], uncertainties: [],
    criticalProductDecisions: [
      { decisionDomain: "food_registration_method", reason: "初期入力で手動登録と明示されています。", resolvedByInitialInput: true },
      { decisionDomain: "food_management_priority", reason: "初期入力で残量と期限の確認が明示されています。", resolvedByInitialInput: true },
    ],
  };
  const context = setDimensions(applyAnalysis(createProjectContext("家族で使い、食材を手動登録して残量と期限を確認する冷蔵庫管理アプリ"), analysis), []);
  assert.equal(completionGate(context).complete, true);
  assert.equal(planNext(context), null);
  assert.equal(calculatedConversationProgress(context), 100);
});

test("meeting room flow asks independent domains and stops timezone and lifecycle drill-down", () => {
  const product = (domain) => ({ title: domain, intent: "Product decision", options: ["A", "B"], recommended: "A", recommendationReason: "MVP", decisionDomain: domain, decisionBoundary: "business_rule", informationGain: "high", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } });
  const implementation = (domain) => ({ title: domain, intent: "Implementation detail", options: ["A", "B"], recommended: "A", recommendationReason: "AI default", decisionDomain: domain, decisionBoundary: "none", informationGain: "low", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesExplicitUserRequest: false, changesProductBehavior: false, introducesNewFeature: false, implementationDetailOnly: true, derivedOnlyFromAIInference: true, decisionClass: "implementation", requiresUserDecision: false } });
  let context = setDimensions(createProjectContext("Internal meeting room reservation app"), [
    { id: "users", label: "users", importance: "high", userJudgmentRequired: true, known: false, value: null, question: product("users_permissions") },
    { id: "reservation", label: "reservation", importance: "high", userJudgmentRequired: true, known: false, value: null, question: product("reservation_policy") },
    { id: "timezone", label: "timezone", importance: "low", userJudgmentRequired: true, known: false, value: null, question: implementation("timezone") },
  ]);
  assert.equal(planNext(context).id, "users");
  context = recordAnswer(context, "users", "A");
  assert.equal(planNext(context).id, "reservation");
  context = recordAnswer(context, "reservation", "A");
  context = recordInference(context, { aiInferredRequirements: [{ key: "org_timezone", value: "Organization locale", reason: "AI default", decisionDomain: "timezone", necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: true, reason: "reservation" } }], implementationProposals: [], futureOptional: [], clarificationQuestions: [{ id: "timezone_display", label: "display", importance: "low", question: implementation("timezone") }, { id: "room_delete", label: "delete", importance: "low", question: implementation("room_lifecycle") }] });
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
  assert.deepEqual(context.answeredDecisionDomains, ["users_permissions", "reservation_policy"]);
});

test("meeting room inferred details stay proposals and cannot override confirmed privacy", () => {
  let context = {
    ...createProjectContext("Internal meeting room reservation app"),
    facts: [
      { key: "idea", value: "Internal meeting room reservation app", source: SOURCE.INITIAL },
      { key: "visibility_privacy", value: "Non-viewers must not see reservation details", source: SOURCE.USER },
    ],
  };
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "long_reservation_policy", value: "Set a threshold for long reservations", reason: "Several reasonable thresholds exist", decisionDomain: "reservation_policy", uniquelyDerived: false, hasMultipleReasonableImplementations: true, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: false, reason: "proposal" } }],
    implementationProposals: [], futureOptional: [], clarificationQuestions: [],
  });
  assert.equal(context.facts.some((fact) => fact.key === "long_reservation_policy" && fact.source === SOURCE.AI), false);
  assert.equal(context.implementationProposals.some((proposal) => proposal.key === "long_reservation_policy"), true);
  const unsafe = {
    ...completeSpec,
    mvpScope: "Reservations longer than 4 hours require a special rule; DRAFT and PENDING_APPROVAL conflict; show an alternative room.",
    functionalRequirements: "Show reservation details to all users, including non-viewers.",
    implementationRules: "Use a +/-30 minute conflict window.",
    acceptanceCriteria: "Offer an alternative room whenever a conflict occurs.",
  };
  const issues = validateLocally(context, unsafe).issues;
  assert.equal(issues.some((issue) => issue.section === "Specification certainty"), true);
  assert.equal(issues.some((issue) => issue.section === "Visibility / privacy"), true);
  const safe = { ...completeSpec, mvpScope: "Prevent double booking of the same room and time slot.", functionalRequirements: "Show only availability to non-viewers and reservation details to authorized viewers. Recheck reservation conflicts immediately before confirmation.", stateTransitions: "Before confirming a reservation, recheck the reservation conflict; conflicting overlapping reservations are not confirmed.", implementationRules: "Use the organization reservation policy without inventing thresholds.", acceptanceCriteria: "Authorized users can reserve an available room without exposing private reservation details, while an overlapping reservation is rejected." };
  assert.equal(validateLocally(context, safe).valid, true);
});

test("marketplace asks only decisions that branch actors or transaction state", () => {
  const question = (domain, impact) => ({ title: domain, intent: "Marketplace decision", options: ["A", "B"], recommended: "A", recommendationReason: "MVP", decisionDomain: domain, decisionBoundary: domain === "users_roles_permissions" ? "roles_permissions" : "primary_flow", informationGain: impact === "major" ? "high" : "medium", architecturalImpact: impact, necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } });
  let context = setDimensions(createProjectContext("Marketplace app"), [
    { id: "roles", label: "roles", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("users_roles_permissions", "major") },
    { id: "transaction", label: "transaction", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("primary_flow", "major") },
    { id: "listing_fields", label: "listing fields", importance: "medium", userJudgmentRequired: true, known: false, value: null, question: question("item_listing_features", "minor") },
    { id: "shipping", label: "shipping", importance: "medium", userJudgmentRequired: true, known: false, value: null, question: question("shipping_responsibility", "minor") },
  ]);
  const displayed = [];
  while (planNext(context)) { const next = planNext(context); displayed.push(next.question.decisionDomain); context = recordAnswer(context, next.id, "A"); }
  assert.deepEqual(displayed, ["users_roles_permissions", "primary_flow"]);
  assert.equal(readiness(context), 100);
  context = recordInference(context, { aiInferredRequirements: [{ key: "listing_defaults", value: "Use practical listing fields", reason: "Does not branch the transaction flow", decisionDomain: "item_listing_features", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "listing" } }], implementationProposals: [{ key: "shipping_defaults", title: "Shipping defaults", description: "Choose a practical default shipping responsibility", recommended: true, reason: "Not a core flow branch", alternatives: [] }], futureOptional: [], clarificationQuestions: [] });
  assert.equal(context.facts.some((fact) => fact.key === "listing_defaults" && fact.source === SOURCE.AI), true);
  assert.equal(context.implementationProposals.some((item) => item.key === "shipping_defaults"), true);
});

test("food photo analysis asks only flow and calorie-meaning decisions while inferring safe defaults", () => {
  const question = (domain) => ({ title: domain, intent: "Changes the core experience", options: ["A", "B"], recommended: "A", recommendationReason: "MVP", decisionDomain: domain, decisionBoundary: "core_value", informationGain: "high", architecturalImpact: "major", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } });
  let context = setDimensions(createProjectContext("Photo app that estimates dish names and calories"), [
    { id: "actors", label: "actors", importance: "medium", userJudgmentRequired: false, known: true, value: "Single-user MVP", question: null },
    { id: "multi_dish", label: "multi dish", importance: "medium", userJudgmentRequired: false, known: true, value: "Use one reasonable default handling", question: null },
    { id: "flow", label: "flow", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("user_flow_and_confirmation") },
    { id: "portion", label: "portion", importance: "high", userJudgmentRequired: true, known: false, value: null, question: question("portion_size_and_calorie_granularity") },
  ]);
  const displayed = [];
  while (planNext(context)) { const next = planNext(context); displayed.push(next.question.decisionDomain); context = recordAnswer(context, next.id, "A"); }
  assert.deepEqual(displayed, ["user_flow_and_confirmation", "portion_size_and_calorie_granularity"]);
  context = recordInference(context, { aiInferredRequirements: [
    { key: "single_user_default", value: "Use a naturally single-user MVP", reason: "No collaboration is indicated", decisionDomain: "actors_and_permissions", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "MVP default" } },
    { key: "multi_dish_default", value: "Use a reasonable default that preserves the confirmation flow", reason: "Does not branch the main flow", decisionDomain: "multi_dish_handling", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "MVP default" } },
  ], implementationProposals: [], futureOptional: [], clarificationQuestions: [] });
  assert.equal(readiness(context), 100);
  assert.equal(context.facts.filter((fact) => fact.source === SOURCE.AI).length, 2);
  assert.equal(context.implementationProposals.length, 0);
});

test("final canonical requirements merge semantically equivalent image-to-single-item requirements", () => {
  const context = {
    ...createProjectContext("写真から料理名とカロリーを推定するアプリ"),
    facts: [
      { key: "idea", value: "写真から料理名とカロリーを推定するアプリ", source: SOURCE.INITIAL },
      { key: "single_dish_primary_detection", value: "画像から主要な一品を検出する", reason: "主要フロー", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
      { key: "single_dish_extraction_rule", value: "主要な一品だけを抽出する", reason: "MVPを簡潔に保つ", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
      { key: "image_to_single_item_mapping", value: "入力画像を単一の料理エントリに対応付ける", reason: "記録フロー", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
  };
  const canonical = canonicalizeContext(context);
  assert.equal(canonical.aiInferredRequirements.length, 1);
  assert.equal(buildCanonicalRequirements(context).uniquelyDerivedAiRequirements.length, 1);
});

test("confirmed edit policy makes review mandatory while keeping the name change optional across final SPEC", () => {
  const context = {
    ...createProjectContext("料理写真アプリ"),
    facts: [
      { key: "idea", value: "料理写真アプリ", source: SOURCE.INITIAL },
      { key: "user_edit_policy", value: "保存前に編集画面を必ず経由する。料理名は変更可能だが、変更自体を必須としない。", source: SOURCE.USER },
    ],
  };
  const raw = { ...completeSpec, userFlow: "結果を表示して保存する", functionalRequirements: "料理名を変更必須にする", implementationRules: "編集画面を表示する", acceptanceCriteria: "保存できる" };
  assert.equal(validateLocally(context, raw).valid, false);
  const normalized = canonicalizeSpec(context, raw);
  for (const sectionName of ["userFlow", "functionalRequirements", "implementationRules", "acceptanceCriteria"]) assert.match(normalized[sectionName], /保存前に編集画面を必ず経由する。料理名は変更可能だが、変更自体は必須としない。/);
  assert.equal(validateLocally(context, normalized).valid, true, JSON.stringify(validateLocally(context, normalized).issues));
});

test("final validation rejects an unbalanced Data Model", () => {
  const invalid = { ...completeSpec, dataModel: "Meal { id, name, calories" };
  const issues = validateLocally(createProjectContext("食事記録アプリ"), invalid).issues;
  assert.ok(issues.some((issue) => issue.section === "Data Model" && /閉じられて/.test(issue.message)));
});

test("inventory SPEC preserves structural identifiers and logical cardinality while generalizing only arbitrary thresholds", () => {
  const context = {
    ...createProjectContext("写真で在庫を登録する在庫管理アプリ"),
    facts: [
      { key: "idea", value: "写真で在庫を登録する在庫管理アプリ", source: SOURCE.INITIAL },
      { key: "image_record_mapping", value: "1画像につき1レコードを作成する", source: SOURCE.AI, reason: "一意の登録フロー", uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
  };
  const raw = {
    ...completeSpec,
    functionalRequirements: "FR1: 1画像につき1レコードを作成する。",
    implementationRules: "IR1: 買い物リストに同一アイテムは1件のみ保持する。タイムアウトは30分とする。",
    acceptanceCriteria: "AC1: 同一アイテムが重複登録されない。",
    dataModel: "InventoryRecord { id: string, imageUri: string, quantity: integer }",
  };
  const normalized = canonicalizeSpec(context, raw);
  for (const expected of ["FR1", "IR1", "AC1", "1画像につき1レコード", "同一アイテムは1件のみ", "integer"]) assert.match(`${normalized.functionalRequirements}\n${normalized.implementationRules}\n${normalized.acceptanceCriteria}\n${normalized.dataModel}`, new RegExp(expected));
  assert.match(normalized.implementationRules, /タイムアウトは設定で定める時間とする/);
  assert.doesNotMatch(`${normalized.functionalRequirements}\n${normalized.implementationRules}\n${normalized.acceptanceCriteria}`, /(?:FR|IR|AC)適切な値|適切な値件/);
  assert.equal(validateLocally(context, normalized).valid, true, JSON.stringify(validateLocally(context, normalized).issues));
});

test("final validation detects a cut-off AI-inferred sentence before rendering Markdown", () => {
  const context = {
    ...createProjectContext("在庫管理アプリ"),
    facts: [
      { key: "idea", value: "在庫管理アプリ", source: SOURCE.INITIAL },
      { key: "inventory_rule", value: "在庫の登録と更新を行い、利用者が一覧から状態を確認できるようにする。記録の検索と確認を通じて利用者が日々の在庫状況を把握し、欠品を防ぐためのMVPの成功基", reason: "主要フローを成立させるために必要な記録と確認の仕組みを提供することで利用者の在庫管理を支援", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
  };
  const issues = validateLocally(context, completeSpec).issues;
  assert.ok(issues.some((issue) => issue.section === "AI-Inferred Requirements" && /途中で切れ/.test(issue.message)));
});

test("photo app consistency repair preserves on-device confirmation and removes cloud conflicts", () => {
  const context = {
    ...createProjectContext("Photo dish and calorie estimation app"),
    facts: [
      { key: "idea", value: "Photo dish and calorie estimation app", source: SOURCE.INITIAL },
      { key: "photo_processing_privacy_and_storage", value: "端末内で処理する", source: SOURCE.USER },
      { key: "cloud_recognition", value: "Call a cloud AI service", source: SOURCE.AI },
      { key: "dish_photo_analysis", value: "Analyze a dish photo for calorie estimation", source: SOURCE.AI },
      { key: "photo_dish_analysis", value: "Analyze a dish photo for calorie estimation", source: SOURCE.AI },
    ],
    inferredDecisions: { cloud_recognition: { key: "cloud_recognition", value: "Call a cloud AI service" } },
    implementationProposals: [{ key: "cloud_fallback", title: "Cloud fallback", description: "Use a remote API", recommended: true, reason: "accuracy", alternatives: [] }],
    futureOptional: [{ key: "cloud_backup", value: "Cloud backup", reason: "future" }],
  };
  const unsafe = { ...completeSpec, mvpScope: "Treat photos older than 30 minutes differently.", functionalRequirements: "Send photos to cloud AI for calorie estimation.", implementationRules: "Use remote API processing.", acceptanceCriteria: "Cloud processing returns dish names." };
  assert.equal(validateLocally(context, unsafe).valid, false);
  const repaired = repairConsistency(context, unsafe, validateLocally(context, unsafe).issues);
  assert.equal(repaired.context.facts.some((fact) => /cloud/i.test(fact.key)), false);
  assert.equal(repaired.context.implementationProposals.some((item) => /cloud|remote/i.test(`${item.key} ${item.description}`)), false);
  assert.equal(repaired.context.futureOptional.some((item) => /cloud/i.test(item.key)), false);
  assert.equal(repaired.context.facts.filter((fact) => fact.source === SOURCE.AI).length, 1);
  assert.equal(repaired.context.canonicalRequirements.uniquelyDerivedAiRequirements.some((item) => /cloud/i.test(`${item.key} ${item.value}`)), false);
  assert.equal(buildCanonicalRequirements(repaired.context).userConfirmedDecisions.some((item) => item.key === "photo_processing_privacy_and_storage"), true);
  assert.ok(repaired.repairDirectives.some((directive) => /concrete|specific|具体値/.test(directive)));
  assert.ok(repaired.repairDirectives.some((directive) => /on-device only/.test(directive)));
  const repairedSpec = { ...completeSpec, functionalRequirements: "Estimate dish names and calories on-device.", implementationRules: "Keep photo processing on-device.", acceptanceCriteria: "A photo produces an on-device estimate without exposing it to non-authorized services." };
  assert.equal(validateLocally(repaired.context, repairedSpec).valid, true);
});

test("final SPEC pipeline canonicalizes generated expansions before validation and records its state transition", async () => {
  const context = {
    ...createProjectContext("写真から料理名とカロリーを推定するアプリ"),
    facts: [
      { key: "idea", value: "写真から料理名とカロリーを推定するアプリ", source: SOURCE.INITIAL },
      { key: "photo_processing_privacy_and_storage", value: "端末内で処理してローカル保存する", source: SOURCE.USER },
      { key: "dish_estimation", value: "写真から料理名とカロリーを推定して編集できる", reason: "主要フロー", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
    implementationProposals: [], futureOptional: [],
  };
  const unsafeExpansion = {
    ...completeSpec,
    mvpScope: "写真を端末内で解析して料理名とカロリーを表示する。",
    functionalRequirements: "解析結果はリアルタイム同期し、ユーザーが編集できる。",
    implementationRules: "失敗時は3回まで再試行し、30秒後に再開する。",
    acceptanceCriteria: "ユーザーは推定結果を確認して保存できる。",
  };
  let generationCalls = 0;
  const result = await runSpecRepairPipeline({
    context,
    generateSpec: async () => { generationCalls += 1; return { spec: unsafeExpansion }; },
    validateRemote: async () => ({ issues: [] }),
  });
  assert.equal(generationCalls, 1, "修復済みSPECが妥当なら同じエラーで再生成しない");
  assert.equal(result.trace.length, 1);
  assert.equal(result.trace[0].action, "accepted_generated_spec");
  assert.match(result.spec.implementationRules, /設定で定める回数/);
  assert.match(result.spec.implementationRules, /設定で定める時間/);
  assert.doesNotMatch(result.spec.functionalRequirements, /同期|sync/i);
  assert.equal(validateLocally(result.context, result.spec).valid, true);
  assert.equal(result.context.canonicalRequirements.dataBoundary.mode, "local_only");
});

test("repairConsistency returns the repaired SPEC that the next validation consumes", () => {
  const context = {
    ...createProjectContext("ローカルで使う写真解析アプリ"),
    facts: [
      { key: "idea", value: "ローカルで使う写真解析アプリ", source: SOURCE.INITIAL },
      { key: "photo_processing_privacy_and_storage", value: "端末内で処理する", source: SOURCE.USER },
    ],
  };
  const unsafe = { ...completeSpec, implementationRules: "失敗時は3回まで再試行する。", functionalRequirements: "結果をリアルタイム同期する。" };
  const repaired = repairConsistency(context, unsafe, validateLocally(context, unsafe).issues);
  assert.match(repaired.spec.implementationRules, /設定で定める回数/);
  assert.doesNotMatch(repaired.spec.functionalRequirements, /同期|sync/i);
  assert.equal(validateLocally(repaired.context, repaired.spec).valid, true);
  assert.ok(repaired.context.canonicalRequirements.generationConstraints.some((constraint) => constraint.code === "no_unconfirmed_concrete_values"));
  assert.ok(repaired.context.canonicalRequirements.generationConstraints.some((constraint) => constraint.code === "local_data_is_not_network_sync"));
});

test("AI-inferred local wording does not create a local-only network constraint", () => {
  const context = {
    ...createProjectContext("写真から料理名とカロリーを推定するアプリ"),
    facts: [
      { key: "idea", value: "写真から料理名とカロリーを推定するアプリ", source: SOURCE.INITIAL },
      { key: "local_ui_reflection", value: "編集後はローカルユーザーデータに反映する", source: SOURCE.AI, reason: "実装補完", uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
  };
  const spec = { ...completeSpec, functionalRequirements: "同じ端末の画面に変更を反映する。" };
  assert.equal(buildCanonicalRequirements(context).dataBoundary.mode, "unspecified");
  assert.equal(validateLocally(context, spec).issues.some((issue) => /ネットワーク同期/.test(issue.message)), false);
});

test("repair-stop diagnostics project final errors into section, canonical source, and iteration state", () => {
  const context = {
    ...createProjectContext("ローカルで使う料理写真アプリ"),
    facts: [
      { key: "idea", value: "ローカルで使う料理写真アプリ", source: SOURCE.INITIAL },
      { key: "photo_processing_privacy_and_storage", value: "端末内で処理する", source: SOURCE.USER },
    ],
  };
  const unsafe = { ...completeSpec, functionalRequirements: "料理名をリアルタイム同期する。", implementationRules: "失敗時は3回まで再試行する。" };
  const issues = validateLocally(context, unsafe).issues;
  const canonical = buildCanonicalRequirements(context);
  const diagnostics = buildRepairDiagnostics({
    context,
    trace: [{ iteration: 1, canonicalBefore: canonical, generatedSpec: unsafe, validationErrors: issues, canonicalAfter: canonical, specAfter: unsafe, revalidationErrors: issues, action: "stopped_no_progress" }],
    stopMessage: "停止",
  });
  const numeric = diagnostics.errors.find((item) => item.code === "unconfirmed_concrete_value");
  const sync = diagnostics.errors.find((item) => item.code === "local_only_network_sync");
  assert.equal(numeric.section, "implementationRules");
  assert.equal(numeric.canonicalRequirementId, "spec_expansion");
  assert.equal(sync.section, "functionalRequirements");
  assert.equal(sync.canonicalRequirementId, "dataBoundary.local_only");
  assert.equal(sync.canonicalOrigin, "User Confirmed");
  assert.match(diagnostics.reason, /変化しなかった/);
  assert.equal(sync.iterations[0].status, "残存");
});

test("repair-stop diagnostics give an unrequested cloud sync error a stable code and excerpt", () => {
  const context = createProjectContext("ローカルで使う料理写真アプリ");
  const spec = { ...completeSpec, mvpScope: "クラウド同期をMVPの必須機能として提供する。" };
  const issues = validateLocally(context, spec).issues;
  const canonical = buildCanonicalRequirements(context);
  const diagnostics = buildRepairDiagnostics({ context, trace: [{ iteration: 1, canonicalBefore: canonical, generatedSpec: spec, validationErrors: issues, canonicalAfter: canonical, specAfter: spec, revalidationErrors: issues, action: "stopped_no_progress" }] });
  const cloudSync = diagnostics.errors.find((item) => item.code === "unrequested_cloud_sync");
  assert.equal(cloudSync.section, "mvpScope");
  assert.match(cloudSync.excerpt, /クラウド同期/);
  assert.equal(cloudSync.canonicalRequirementId, "spec_expansion");
});

test("inventory threshold state gap adds one primary-flow decision and blocks 100 percent until answered", () => {
  const stateQuestion = {
    title: "買い物リストで購入完了にしたとき、在庫数量はどうしますか？",
    intent: "購入完了後の在庫と自動追加の状態を一意に決めます。",
    options: ["購入数量を入力して在庫へ反映する", "購入完了だけ記録して後で手動更新する", "標準補充量を自動加算する"],
    recommended: "購入数量を入力して在庫へ反映する",
    recommendationReason: "購入後の在庫状態を明確に保てるためです。",
    decisionDomain: "purchase_completion_inventory_update",
    decisionBoundary: "primary_flow",
    informationGain: "high",
    architecturalImpact: "major",
    necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  };
  let context = {
    ...createProjectContext("在庫・買い物リスト管理アプリ"),
    facts: [
      { key: "idea", value: "在庫・買い物リスト管理アプリ", source: SOURCE.INITIAL },
      { key: "device_scope", value: "単一ユーザー・単一端末", source: SOURCE.USER },
      { key: "item_entry_method", value: "手動入力（名前・カテゴリ・数量・期限）", source: SOURCE.USER },
      { key: "consumption_tracking", value: "消費時に数量を手動で減らす", source: SOURCE.USER },
      { key: "threshold_policy", value: "在庫量 <= 閾値 で買い物リストに追加", source: SOURCE.USER },
    ],
  };
  context = recordInference(context, {
    aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [],
    stateTransitionGaps: [{ id: "purchase_completion_inventory_update", trigger: "購入完了", stateBefore: "低在庫かつ買い物リスト登録済み", stateAfter: "在庫反映待ち", persistedDataChange: "在庫更新方法が未決定", nextAutomaticRuleEvaluation: "数量が低いままだと再追加される", uniquelyResolvable: false, requiresProductDecision: true, question: stateQuestion }],
  });
  assert.equal(planNext(context)?.id, "purchase_completion_inventory_update");
  assert.equal(readiness(context), 0);
  assert.equal(hasUnresolvedStateTransitionGaps(context), true);
  context = recordAnswer(context, "purchase_completion_inventory_update", "購入数量を入力して在庫へ反映する", true);
  context = recordInference(context, {
    aiInferredRequirements: [{ key: "expiry_input_optional", value: "MVPでは期限は任意入力とする。", reason: "期限が不明な在庫も登録して主要フローを維持するためです。", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true } }],
    implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [],
  });
  assert.equal(planNext(context), null);
  assert.equal(readiness(context), 100);
  assert.equal(hasUnresolvedStateTransitionGaps(context), false);
});

test("inventory final SPEC preserves <=, records purchase data changes, and does not damage structural ids", () => {
  const context = {
    ...createProjectContext("在庫・買い物リスト管理アプリ"),
    facts: [
      { key: "idea", value: "在庫・買い物リスト管理アプリ", source: SOURCE.INITIAL },
      { key: "item_entry_method", value: "手動入力（名前・カテゴリ・数量・期限）", source: SOURCE.USER },
      { key: "threshold_policy", value: "quantity <= threshold で買い物リストに追加", source: SOURCE.USER },
      { key: "purchase_completion_inventory_update", value: "購入完了時に購入数量を入力して在庫数量へ反映する", source: SOURCE.USER },
      { key: "expiry_input_optional", value: "MVPでは期限は任意入力とする。", reason: "期限が不明な在庫も登録して主要フローを維持するためです。", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false },
    ],
  };
  const raw = {
    projectOverview: "在庫と買い物リストを管理するアプリ", coreUserValue: "不足品を見逃さずに購入できること", mvpScope: "quantity < threshold の品目を買い物リストへ追加する",
    outOfScope: "なし", userFlow: "数量を減らし、購入完了時に購入数量を入力して在庫数量を更新する", screens: "在庫一覧と買い物リスト",
    functionalRequirements: "FR1: quantity < threshold のとき品目を追加する", dataModel: "Item { name: string, quantity: integer, threshold: integer, expiry_date(optional): date | null }",
    stateTransitions: "LowStock -> AddedToList -> Purchased: 購入数量を反映して数量を更新し、次回の自動判定を更新後の数量で実行する", errorHandling: "入力不足を表示する",
    implementationRules: "IR1: quantity < threshold を評価する", acceptanceCriteria: "AC1: 購入完了後、更新済み数量で再評価される",
  };
  const normalized = canonicalizeSpec(context, raw);
  const output = `${buildMarkdown(context, normalized)}\n${normalized.functionalRequirements}\n${normalized.implementationRules}\n${normalized.acceptanceCriteria}`;
  assert.match(output, /FR1/); assert.match(output, /IR1/); assert.match(output, /AC1/);
  assert.match(output, /quantity <= threshold/);
  assert.doesNotMatch(output, /quantity < threshold/);
  assert.doesNotMatch(output, /適切な値/);
  assert.equal(validateLocally(context, normalized).valid, true);
});

test("inventory validation catches a completion loop before a state transition decision is resolved", () => {
  const context = {
    ...createProjectContext("Inventory app"),
    facts: [
      { key: "idea", value: "Inventory app", source: SOURCE.INITIAL },
      { key: "threshold_policy", value: "quantity <= threshold adds an item to the shopping list", source: SOURCE.USER },
    ],
  };
  const looped = { ...completeSpec, userFlow: "Mark the shopping-list item as purchase complete.", stateTransitions: "AddedToList -> Purchased", functionalRequirements: "FR1: quantity <= threshold adds an item." };
  const issues = validateLocally(context, looped).issues;
  assert.ok(issues.some((issue) => issue.section === "State Transitions"));
});

test("inventory exit canonicalization aligns active-list completion, derived flags, and an unset minimum quantity", () => {
  const context = {
    ...createProjectContext("Inventory and shopping-list app"),
    facts: [
      { key: "idea", value: "Inventory and shopping-list app", source: SOURCE.INITIAL },
      { key: "threshold_policy", value: "quantity <= threshold adds an item to the shopping list", source: SOURCE.USER },
      { key: "purchase_completion_inventory_update", value: "On purchase completion, enter the purchased quantity and update inventory quantity", source: SOURCE.USER },
    ],
    implementationProposals: [{ key: "derived_low_stock", title: "Derived status", description: "lowStock: bool", recommended: true, reason: "cache status", alternatives: [] }],
  };
  const inconsistent = {
    projectOverview: "Inventory app", coreUserValue: "Track stock and shopping", mvpScope: "Add low stock items", outOfScope: "none",
    userFlow: "Mark the shopping-list item purchase complete and retain a completed status.", screens: "Inventory and shopping list",
    functionalRequirements: "FR1: Mark a ShoppingListItem as completed.", dataModel: "Item { quantity: integer, min_quantity: integer = 0, lowStock: bool }, ShoppingListItem { item_id: string }",
    stateTransitions: "ShoppingListItem.status = completed", errorHandling: "Show input errors", implementationRules: "IR1: calculate low stock", acceptanceCriteria: "AC1: Completed items remain visible.",
  };
  const initialIssues = validateLocally(context, inconsistent).issues;
  assert.ok(initialIssues.some((issue) => issue.section === "Data Model"));
  assert.ok(initialIssues.some((issue) => issue.section === "Shopping list completion" || issue.section === "State Transitions"));
  assert.equal(canonicalizeContext(context).implementationProposals.length, 0);

  const finalSpec = canonicalizeSpec(context, {
    ...inconsistent,
    userFlow: "Enter consumption. When purchase is complete, enter purchased quantity, update Item.quantity, and delete the active ShoppingListItem.",
    functionalRequirements: "FR1: When quantity <= threshold, create an active ShoppingListItem. FR2: Purchase completion updates Item.quantity and deletes the active ShoppingListItem.",
    stateTransitions: "LowStock -> AddedToList -> Purchased: persist the entered purchase quantity in Item.quantity, delete ShoppingListItem, then evaluate quantity <= threshold using the updated quantity. lowStock is derived and not persisted.",
    acceptanceCriteria: "AC1: A completed purchase updates Item.quantity and removes the active ShoppingListItem. AC2: lowStock is calculated from quantity and min_quantity, not stored.",
  });
  assert.match(finalSpec.dataModel, /min_quantity: integer \| null \(unset: excluded from automatic low-stock evaluation\)/);
  assert.doesNotMatch(finalSpec.dataModel, /lowStock\s*:/i);
  assert.doesNotMatch(finalSpec.dataModel, /default\s*0|=\s*0/i);
  assert.match(finalSpec.stateTransitions, /delete ShoppingListItem/i);
  assert.match(finalSpec.acceptanceCriteria, /removes the active ShoppingListItem/i);
  assert.equal(validateLocally(context, finalSpec).valid, true, JSON.stringify(validateLocally(context, finalSpec).issues));
});

test("hamster maze keeps optional scoring and multi-step progression out of mandatory MVP sections", () => {
  let context = {
    ...createProjectContext("かわいいハムスターを操作または観察して、ケージから脱出させる迷路ゲーム"),
    facts: [
      { key: "idea", value: "かわいいハムスターを操作または観察して、ケージから脱出させる迷路ゲーム", source: SOURCE.INITIAL },
      { key: "platform", value: "モバイル（iOS/Android、タッチ操作）", source: SOURCE.USER },
      { key: "player_control_model", value: "経路指定（目的地を指示するとハムスターが経路に従う）", source: SOURCE.USER },
      { key: "win_condition", value: "出口まで到達で即クリア。タイムアタックは任意でスコア化してもよい。", source: SOURCE.USER },
    ],
  };
  const necessary = { confirmedDecisionRequired: true, coreUserValueRequired: true, primaryFlowRequired: true, reason: "主要フローに不可欠" };
  context = recordInference(context, {
    aiInferredRequirements: [
      { key: "single_player", value: "単一プレイヤーで迷路を開始し、出口へ到達できる。", reason: "確認済みの操作と勝利条件を成立させるためです。", decisionDomain: "actors", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: necessary, eligibility: { sourceKey: "player_control_model", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false } },
      { key: "time_attack", value: "タイムアタックを記録する。", reason: "任意のスコア化です。", decisionDomain: "scoring", uniquelyDerived: true, hasMultipleReasonableImplementations: false, necessity: necessary, eligibility: { sourceKey: "win_condition", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: false, introducesNewProductValue: true } },
      { key: "high_score", value: "ハイスコアを保存する。", reason: "タイムアタックからの派生です。", decisionDomain: "scoring", uniquelyDerived: false, hasMultipleReasonableImplementations: true, necessity: necessary, eligibility: { sourceKey: "win_condition", directDerivation: false, derivationDepth: 2, acceptanceCriteriaRequired: false, introducesNewProductValue: true } },
      { key: "stage_progress", value: "ステージ進行を保存して次ステージをアンロックする。", reason: "進行機能の派生です。", decisionDomain: "progression", uniquelyDerived: false, hasMultipleReasonableImplementations: true, necessity: necessary, eligibility: { sourceKey: "win_condition", directDerivation: false, derivationDepth: 2, acceptanceCriteriaRequired: false, introducesNewProductValue: true } },
    ],
    implementationProposals: [{ key: "a_star_pathfinding", title: "経路探索方式", description: "A*を使って目的地までの経路を探索する。", recommended: true, reason: "経路指定を実装できる推奨方式です。", alternatives: [] }],
    futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [],
  });

  assert.deepEqual(context.facts.filter((fact) => fact.source === SOURCE.USER).map((fact) => fact.key), ["platform", "player_control_model", "win_condition"]);
  assert.deepEqual(context.facts.filter((fact) => fact.source === SOURCE.AI).map((fact) => fact.key), ["single_player"]);
  assert.equal(context.futureOptional.some((item) => item.key === "time_attack"), true);
  assert.equal(context.implementationProposals.some((item) => item.key === "high_score") || context.futureOptional.some((item) => item.key === "high_score"), true);
  assert.equal(context.implementationProposals.some((item) => item.key === "stage_progress"), true);
  assert.equal(context.implementationProposals.some((item) => item.key === "a_star_pathfinding"), true);
  assert.deepEqual(buildCanonicalRequirements(context).uniquelyDerivedAiRequirements.map((item) => item.key), ["single_player"]);

  const overPromoted = {
    ...completeSpec,
    mvpScope: "タッチで目的地を指定してハムスターを動かし、出口到達で即クリアする。タイムアタックとハイスコア保存、ステージ進行を必須とする。",
    functionalRequirements: "ハイスコアを保存し、ステージをアンロックする。",
    dataModel: "MazeSession { id: string, destination: point }",
    stateTransitions: "目的地を指定し、ハムスターが経路を移動して出口到達でクリアする。",
    implementationRules: "A*はImplementation Proposalとして扱う。",
    acceptanceCriteria: "ハイスコア保存とステージアンロックを完了できる。",
  };
  assert.equal(validateLocally(context, overPromoted).valid, false);
  assert.ok(validateLocally(context, overPromoted).issues.some((issue) => /未確定|Future/.test(issue.message)));

  const mvpOnly = {
    ...completeSpec,
    mvpScope: "モバイル端末でタッチにより目的地を指定し、ハムスターが経路に従って移動し、出口到達で即クリアする。",
    functionalRequirements: "目的地の指定、経路に沿った移動、出口到達時のクリアを提供する。",
    dataModel: "MazeSession { id: string, destination: point }",
    stateTransitions: "開始中に目的地を指定し、移動中を経て出口到達時にクリアへ遷移する。",
    implementationRules: "経路探索方式はImplementation Proposalとして扱う。",
    acceptanceCriteria: "プレイヤーはタッチで目的地を指定し、ハムスターを出口へ到達させて即クリアできる。",
  };
  const markdown = buildMarkdown(context, mvpOnly);
  assert.equal(validateLocally(context, mvpOnly).valid, true, JSON.stringify(validateLocally(context, mvpOnly).issues));
  assert.match(markdown, /A\*/);
  assert.match(markdown, /タイムアタック/);
  assert.doesNotMatch(`${mvpOnly.mvpScope}\n${mvpOnly.functionalRequirements}\n${mvpOnly.acceptanceCriteria}`, /ハイスコア|アンロック|ステージ進行/);
});

test("reservation invariants apply to reservation flows only and do not consume unrelated decisions", () => {
  assert.equal(deriveCoreInvariants(createProjectContext("ハムスターが迷路から脱出するゲーム")).length, 0);
  assert.equal(deriveCoreInvariants(createProjectContext("冷蔵庫の食材と在庫を管理するアプリ")).length, 0);
  assert.equal(deriveCoreInvariants(createProjectContext("社内の会議室予約アプリ")).some((item) => item.id === "reservation_exclusivity"), true);
  const parking = setDimensions(createProjectContext("駐車場時間貸し予約アプリ"), [
    { id: "availability_conflict", label: "重複予約", importance: "high", userJudgmentRequired: true, known: false, value: null, question: { title: "重複予約を許可しますか？", intent: "予約枠の整合性", options: ["許可しない", "同一端末のみ禁止"], recommended: "許可しない", recommendationReason: "整合性", decisionDomain: "reservation_availability", decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } } },
    { id: "self_reservation", label: "自分の公開枠", importance: "high", userJudgmentRequired: true, known: false, value: null, question: { title: "自分の公開枠を予約しますか？", intent: "利用者体験", options: ["確認して予約する", "予約しない"], recommended: "予約しない", recommendationReason: "誤操作防止", decisionDomain: "self_reservation_experience", decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } } },
  ]);
  assert.equal(planNext(parking)?.id, "self_reservation");
});

test("Question Presentation Guard blocks parking implementation language without altering a game product question", () => {
  const technicalQuestion = { title: "DBロックで予約枠を排他制御しますか？", intent: "サーバー側トランザクションを決めます", options: ["transactionを使う", "lockを使う"], recommended: "transactionを使う", recommendationReason: "DB実装が簡単", decisionDomain: "reservation_lock_strategy", decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: false, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } };
  let parking = setDimensions(createProjectContext("自宅の駐車場を使っていない時間だけ他人に貸したい"), [{ id: "reservation_lock_strategy", label: "予約の実装", importance: "high", userJudgmentRequired: true, known: false, value: null, question: technicalQuestion }]);
  assert.equal(questionPresentationGuard(technicalQuestion, parking).safe, false);
  assert.equal(planNext(parking), null);
  parking = recordInference(parking, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [] });
  const recovered = planNext(parking);
  assert.ok(recovered);
  assert.equal(questionPresentationGuard(recovered.question, parking).safe, true);
  assert.doesNotMatch([recovered.question.title, recovered.question.intent, ...recovered.question.options].join("\n"), /\bDB\b|transaction|lock|排他制御/i);

  const hamsterQuestion = { title: "ハムスターはどう操作しますか？", intent: "中心となる操作体験を決めます。", options: ["目的地をタッチして指示する", "直接動かす"], recommended: "目的地をタッチして指示する", recommendationReason: "迷路を考える楽しさを残せるためです。", decisionDomain: "player_control_model", decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true } };
  const hamster = setDimensions(createProjectContext("かわいいハムスターを操作してケージから脱出させる迷路ゲーム"), [{ id: "player_control_model", label: "操作方法", importance: "high", userJudgmentRequired: true, known: false, value: null, question: hamsterQuestion }]);
  assert.equal(deriveCoreInvariants(hamster).length, 0);
  assert.equal(questionPresentationGuard(planNext(hamster).question, hamster).safe, true);
});

test("inventory mock generation produces coherent Data Model, State Transitions, and Acceptance Criteria", async () => {
  const context = {
    ...createProjectContext("Inventory and shopping-list app"),
    facts: [
      { key: "idea", value: "Inventory and shopping-list app", source: SOURCE.INITIAL },
      { key: "threshold_policy", value: "quantity <= threshold adds an item to the shopping list", source: SOURCE.USER },
      { key: "purchase_completion_inventory_update", value: "On purchase completion, enter the purchased quantity and update inventory quantity", source: SOURCE.USER },
    ],
    implementationProposals: [{ key: "derived_low_stock", title: "Derived status", description: "lowStock: bool", recommended: true, reason: "cache status", alternatives: [] }],
  };
  const result = await runSpecRepairPipeline({
    context,
    generateSpec: async () => ({ spec: {
      projectOverview: "Inventory app", coreUserValue: "Track stock and shopping", mvpScope: "quantity <= threshold creates an active shopping-list item", outOfScope: "none",
      userFlow: "When a purchase is complete, enter purchased quantity, update Item.quantity, and delete the active ShoppingListItem.", screens: "Inventory and shopping list",
      functionalRequirements: "FR1: quantity <= threshold creates an active ShoppingListItem. FR2: Purchase completion updates Item.quantity and deletes the active ShoppingListItem.",
      dataModel: "Item { quantity: integer, min_quantity: integer = 0, lowStock: bool }, ShoppingListItem { item_id: string }",
      stateTransitions: "LowStock -> AddedToList -> Purchased: persist the entered purchase quantity in Item.quantity, delete ShoppingListItem, then re-evaluate quantity <= threshold. lowStock is derived and not persisted.",
      errorHandling: "Show input errors", implementationRules: "IR1: calculate low stock from quantity and min_quantity", acceptanceCriteria: "AC1: A completed purchase updates Item.quantity and removes the active ShoppingListItem.",
    } }),
    validateRemote: async () => ({ issues: [] }),
  });
  assert.equal(result.validation.valid, true);
  assert.match(result.spec.dataModel, /min_quantity: integer \| null \(unset: excluded from automatic low-stock evaluation\)/);
  assert.doesNotMatch(result.spec.dataModel, /lowStock\s*:/i);
  assert.match(result.spec.stateTransitions, /delete ShoppingListItem/i);
  assert.match(result.spec.acceptanceCriteria, /removes the active ShoppingListItem/i);
});

test("salon reservation repair recognizes staff-scoped capacity and expands the missing canonical recheck", async () => {
  const context = {
    ...createProjectContext("美容院の予約ができるアプリを作りたい"),
    facts: [
      { key: "idea", value: "美容院の予約ができるアプリを作りたい", source: SOURCE.INITIAL },
      { key: "staff_schedule", value: "スタッフ単位でスケジュールを管理し、同じスタッフの同じ時間は1件のみ確定可能", source: SOURCE.USER, decisionDomain: "reservation_exclusivity" },
      { key: "confirmation_timing", value: "ユーザーが確定するボタンを押した時点で予約を確定する", source: SOURCE.USER, decisionDomain: "confirmation_timing" },
      { key: "staff_scoped_capacity_one_per_slot", value: "各スタッフの同一時間枠の確定予約数は最大1件", source: SOURCE.AI, uniquelyDerived: true, hasMultipleReasonableImplementations: false, decisionDomain: "reservation_exclusivity" },
    ],
  };
  const incomplete = {
    ...completeSpec,
    projectOverview: "美容院予約", coreUserValue: "利用者がスタッフの空き時間を予約できる。",
    mvpScope: "スタッフの空き時間を選び、確定するボタンで予約する。",
    functionalRequirements: "FR1: 各スタッフの同一時間枠の確定予約数は最大1件とする。",
    stateTransitions: "予約候補 -> 確定: 利用者が確定するボタンを押すと予約を保存する。",
    acceptanceCriteria: "AC1: 同じスタッフ・同じ時間枠には1件だけ予約を確定できる。",
  };
  const initial = validateLocally(context, incomplete).issues.filter((issue) => issue.severity === "error");
  assert.equal(initial.some((issue) => issue.ruleId === "reservation_conflict_consistency"), false, JSON.stringify(initial));
  assert.equal(initial.some((issue) => issue.ruleId === "reservation_conflict_recheck"), true, JSON.stringify(initial));
  const repaired = repairConsistency(context, incomplete, initial);
  assert.ok(repaired.repairActions.includes("canonical_reservation_conflict_recheck_expansion"));
  assert.match(repaired.spec.stateTransitions, /保存する直前.*競合を再確認/);
  assert.equal(validateLocally(repaired.context, repaired.spec).valid, true, JSON.stringify(validateLocally(repaired.context, repaired.spec).issues));
  assert.deepEqual(repaired.context.facts.filter((fact) => fact.source === SOURCE.USER).map((fact) => [fact.key, fact.value]), context.facts.filter((fact) => fact.source === SOURCE.USER).map((fact) => [fact.key, fact.value]));

  let calls = 0;
  const result = await runSpecRepairPipeline({ context, generateSpec: async () => { calls += 1; return { spec: incomplete }; }, validateRemote: async () => ({ issues: [] }) });
  assert.equal(calls, 1);
  assert.equal(result.validation.valid, true);
  assert.match(result.spec.stateTransitions, /競合を再確認/);
});

test("confirmed reservation timing conflicts remain blocked and user decisions are never auto-rewritten", () => {
  const context = {
    ...createProjectContext("予約アプリ"),
    facts: [
      { key: "instant_confirmation", value: "確定するボタンを押した時点で予約は即時確定する", source: SOURCE.USER },
      { key: "approval_confirmation", value: "店舗の承認が完了するまで予約は確定しない", source: SOURCE.USER },
    ],
  };
  const issues = validateLocally(context, completeSpec).issues;
  const conflict = issues.find((issue) => issue.ruleId === "confirmed_decision_conflict");
  assert.ok(conflict);
  assert.equal(conflict.requiresUserResolution, true);
  const repaired = repairConsistency(context, completeSpec, issues);
  assert.deepEqual(repaired.context.facts.filter((fact) => fact.source === SOURCE.USER), context.facts.filter((fact) => fact.source === SOURCE.USER));
});

test("structured reservation validation diagnostics retain rule, affected IDs, and repair outcome without text payloads", () => {
  const context = {
    ...createProjectContext("予約アプリ"),
    facts: [{ key: "staff_schedule", value: "スタッフごとに同じ時間は1件まで", source: SOURCE.USER }],
  };
  const issues = [{ ruleId: "reservation_conflict_recheck", ruleName: "予約確定直前の競合再確認", section: "Core Invariants", severity: "error", message: "予約確定時の競合再確認がSPEC必須要件に反映されていません。", offendingRequirementIds: ["reservation_conflict_recheck"] }];
  const entries = buildValidationLogEntries({ context, validationBeforeRepair: issues, validationAfterRepair: issues, repairAttempted: true, repairAction: "canonical_reservation_conflict_recheck_expansion" });
  assert.deepEqual(entries[0].offending_requirement_ids, ["reservation_conflict_recheck"]);
  assert.deepEqual(entries[0].offending_decision_ids, ["staff_schedule"]);
  assert.equal(entries[0].validation_rule_id, "reservation_conflict_recheck");
  assert.equal(entries[0].repair_attempted, true);
  assert.deepEqual(entries[0].validation_after_repair, ["reservation_conflict_recheck"]);
  assert.equal(JSON.stringify(entries).includes("スタッフごと"), false);
});

test("equipment management does not finish after a scope-only answer and rejects an ungrounded completion concept", async () => {
  const productQuestion = {
    title: "備品の利用範囲を選んでください", intent: "主な利用者の範囲を決めます。", options: ["個人または単一端末で管理する", "チームで共有して管理する"], recommended: "個人または単一端末で管理する", recommendationReason: "最小の利用範囲を明確にできるためです。",
    decisionDomain: "usage_scope", decisionBoundary: "roles_permissions", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  };
  let context = applyAnalysis(createProjectContext("会社の備品を管理するアプリを作りたい"), {
    projectType: "備品管理", platform: null, genre: null, purpose: "会社の備品を把握し管理する。", targetUsers: null,
    managedObject: "会社の備品", primaryAction: null, persistedOutcome: null, successCondition: null, knownFacts: [], uncertainties: ["主要な管理操作"],
  });
  context = setDimensions(context, [{ id: "usage_scope", label: "利用範囲", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion }]);
  context = recordAnswer(context, "usage_scope", "個人または単一端末で管理する", true);
  const afterScope = completionGate(context);
  assert.equal(afterScope.complete, false);
  assert.ok(afterScope.unresolvedCriticalProductDecisions.some((item) => item.decisionDomain === "primary_flow_definition"));

  context = recordInference(context, {
    aiInferredRequirements: [{
      key: "r_active_item_completion", value: "完了操作はアイテムをアクティブ一覧から削除して表現する。", reason: "単一端末の管理では簡潔だから。", provenanceReason: "初期入力にない完了概念を一般的なCRUDから追加した。", decisionDomain: "item_completion", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: false, reason: "不可欠ではない。" },
      eligibility: { sourceKey: "initial_input", sourceDecisionIds: [], sourceInitialInputSpan: "会社の備品", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: false, introducesNewProductValue: false },
    }], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [],
  });
  assert.equal(context.facts.some((fact) => fact.key === "r_active_item_completion" && fact.source === SOURCE.AI), false);
  assert.equal(context.implementationProposals.some((item) => item.key === "r_active_item_completion"), true);
  assert.equal(planNext(context)?.id, "primary_flow_definition");

  context = recordAnswer(context, "primary_flow_definition", "対象を登録・更新して一覧で管理する", true);
  context = recordInference(context, {
    aiInferredRequirements: [{
      key: "equipment_catalog", value: "備品の基本情報を登録・更新し、一覧で確認できる。", reason: "ユーザーが確定した主要操作を成立させるため。", provenanceReason: "primary_flow_definitionへの回答から直接導出した。", decisionDomain: "primary_flow_definition", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: true, coreUserValueRequired: true, primaryFlowRequired: true, reason: "主要フローに不可欠。" },
      eligibility: { sourceKey: "primary_flow_definition", sourceDecisionIds: ["primary_flow_definition"], sourceInitialInputSpan: null, directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false },
    }], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
  assert.equal(readiness(context), 100);
  const canonical = buildCanonicalRequirements(context);
  assert.deepEqual(canonical.uniquelyDerivedAiRequirements.map((item) => item.key), []);
  const spec = {
    ...completeSpec,
    projectOverview: "会社の備品管理アプリ", coreUserValue: "備品の基本情報を把握して管理できる。",
    mvpScope: "単一端末で備品の登録・更新・一覧確認を行う。", userFlow: "利用者は備品を登録または更新し、一覧で確認する。",
    functionalRequirements: "FR1: 備品の基本情報を登録・更新できる。FR2: 登録済み備品を一覧で確認できる。",
    dataModel: "Equipment { id: string, name: string, details: string }", stateTransitions: "入力中 -> 保存済み: 登録または更新を保存し、一覧へ反映する。",
    acceptanceCriteria: "AC1: 利用者は備品を登録・更新し、一覧で確認できる。",
  };
  const result = await runSpecRepairPipeline({ context, generateSpec: async () => ({ spec }), validateRemote: async () => ({ issues: [] }) });
  assert.equal(result.validation.valid, true, JSON.stringify(result.validation.issues));
  assert.doesNotMatch(`${result.spec.mvpScope}\n${result.spec.functionalRequirements}\n${result.spec.stateTransitions}\n${result.spec.acceptanceCriteria}`, /完了|アクティブ一覧|status/i);
  const leakedCompletion = { ...spec, functionalRequirements: `${spec.functionalRequirements}\nFR3: 完了操作では備品をアクティブ一覧から削除する。` };
  const leakedIssues = validateLocally(context, leakedCompletion).issues;
  assert.ok(leakedIssues.some((issue) => issue.ruleId === "ungrounded_product_concept"));
  const constrained = repairConsistency(context, leakedCompletion, leakedIssues);
  assert.ok(constrained.context.canonicalRequirements.generationConstraints.some((constraint) => constraint.code === "no_ungrounded_product_concepts"));
  let regenerationCalls = 0;
  const regenerated = await runSpecRepairPipeline({
    context,
    generateSpec: async () => ({ spec: regenerationCalls++ === 0 ? leakedCompletion : spec }),
    validateRemote: async () => ({ issues: [] }),
  });
  assert.equal(regenerationCalls, 2);
  assert.equal(regenerated.validation.valid, true);
  const trace = buildSessionTrace(result.context, { generatedSpec: result.spec, validationErrors: result.validation.issues });
  assert.equal(trace.completion_gate_result, true);
  assert.ok(trace.critical_decision_domains.includes("primary_flow_definition"));
  assert.deepEqual(trace.ai_inferred[0].source_decision_ids, ["primary_flow_definition"]);
});

test("family fridge sharing alone cannot settle the primary flow or authorize consume operations", async () => {
  const productQuestion = (domain, boundary, title, options) => ({
    title, intent: "MVPの主要な使い方を決めます。", options, recommended: options[0], recommendationReason: "中心となる体験を明確にできるためです。",
    decisionDomain: domain, decisionBoundary: boundary, informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  });
  let context = applyAnalysis(createProjectContext("家族の冷蔵庫にある食材を管理するアプリを作りたい"), {
    projectType: "家族向け食材管理", platform: null, genre: null, purpose: "家族が冷蔵庫内の食材を把握できる。", targetUsers: "家族", managedObject: "冷蔵庫内の食材",
    primaryAction: null, persistedOutcome: null, successCondition: null, knownFacts: [], uncertainties: ["主要操作", "登録内容"],
    criticalProductDecisions: [{ decisionDomain: "food_share_edit_permissions", reason: "共有範囲が未確定です。", resolvedByInitialInput: false }],
  });
  context = setDimensions(context, [{
    id: "food_share_edit_permissions", label: "共有範囲", importance: "high", userJudgmentRequired: true, known: false, value: null,
    question: productQuestion("food_share_edit_permissions", "roles_permissions", "食材データの共有範囲を選んでください", ["家族全員で同じ食材リストを共有する", "一人ずつ別の食材リストを使う"]),
  }]);
  context = recordAnswer(context, "food_share_edit_permissions", "家族全員で同じ食材リストを共有する");
  assert.equal(calculatedConversationProgress(context), 50);
  assert.equal(completionGate(context).complete, false);
  assert.ok(completionGate(context).unresolvedCriticalProductDecisions.some((item) => item.decisionDomain === "primary_flow_definition"));

  context = recordInference(context, {
    aiInferredRequirements: [{
      key: "single_shared_inventory", value: "家族全員が同じ食材リストで追加・編集・消費を操作できる。", reason: "共有リストとして扱うため。", provenanceReason: "共有範囲の回答から導出した。", decisionDomain: "food_share_edit_permissions", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: true, coreUserValueRequired: true, primaryFlowRequired: true, reason: "共有体験に必要。" },
      eligibility: { sourceKey: "food_share_edit_permissions", sourceDecisionIds: ["food_share_edit_permissions"], sourceInitialInputSpan: null, directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false },
    }],
    implementationProposals: [], futureOptional: [], stateTransitionGaps: [],
    criticalProductDecisions: [{ decisionDomain: "food_registration_method", reason: "何をどの操作で登録するかに複数の合理的な選択肢があります。" }],
    clarificationQuestions: [{
      id: "food_registration_method", label: "食材の登録方法", importance: "high",
      question: productQuestion("food_registration_method", "primary_flow", "食材はどのように登録しますか？", ["名前・数量・期限を手動入力して追加する", "写真から候補を出して確認後に追加する"]),
    }],
  });
  assert.equal(context.facts.some((fact) => fact.key === "single_shared_inventory" && fact.source === SOURCE.AI), false);
  assert.equal(context.implementationProposals.some((item) => item.key === "single_shared_inventory"), true);
  assert.equal(completionGate(context).complete, false);
  assert.equal(planNext(context)?.id, "food_registration_method");

  context = recordAnswer(context, "food_registration_method", "食材名・数量・期限を手動入力して追加し、後から更新する");
  context = recordInference(context, {
    aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [], criticalProductDecisions: [],
  });
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));
  assert.equal(calculatedConversationProgress(context), 100);

  const validSpec = {
    ...completeSpec,
    projectOverview: "家族で共有する冷蔵庫食材管理アプリ", coreUserValue: "家族が同じ食材情報を把握できる。",
    mvpScope: "家族全員が同じ一覧を参照し、食材名・数量・期限を手動入力して追加・更新する。",
    userFlow: "家族が食材名・数量・期限を入力して追加し、必要に応じて内容を更新する。",
    functionalRequirements: "FR1: 家族全員が同じ食材一覧を参照できる。\nFR2: 食材名・数量・期限を入力して追加・更新できる。",
    dataModel: "FoodItem { id: string, name: string, quantity: number, expiryDate: string }",
    stateTransitions: "追加操作: 未登録から登録済みへ移り、入力した食材情報を保存して一覧へ反映する。更新操作: 登録済み情報を更新後の値へ置き換える。",
    acceptanceCriteria: "AC1: 家族全員が追加・更新した同じ食材一覧を確認できる。",
  };
  assert.equal(validateLocally(context, validSpec).valid, true, JSON.stringify(validateLocally(context, validSpec).issues));
  const leakedConsume = { ...validSpec, functionalRequirements: `${validSpec.functionalRequirements}\nFR3: 食材を消費済みにできる。` };
  const leakedIssues = validateLocally(context, leakedConsume).issues;
  assert.ok(leakedIssues.some((issue) => issue.ruleId === "ungrounded_product_action" || issue.ruleId === "ungrounded_product_concept"));
  let calls = 0;
  const result = await runSpecRepairPipeline({
    context,
    generateSpec: async () => ({ spec: calls++ === 0 ? leakedConsume : validSpec }),
    validateRemote: async () => ({ valid: true, issues: [] }),
  });
  assert.equal(calls, 2);
  assert.equal(result.validation.valid, true);
  assert.doesNotMatch(result.spec.functionalRequirements, /消費/);
});

test("coverage audit rediscovers a critical domain intentionally omitted by initial analysis", () => {
  const productQuestion = (domain, title, options) => ({
    title, intent: "実装担当者が主要な製品挙動を推測しなくてよいように決めます。", options,
    recommended: options[0], recommendationReason: "MVPの主要フローを一意にできるためです。",
    decisionDomain: domain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  });
  let context = enableCriticalDecisionCoverageAudit(createProjectContext("家族で冷蔵庫の食材を登録して共有するアプリ"));
  context = applyAnalysis(context, {
    projectType: "家族向け食材管理", platform: null, genre: null, purpose: "家族が食材情報を共有する。", targetUsers: "家族", managedObject: "食材",
    primaryAction: "食材を登録して共有する", persistedOutcome: "共有食材情報", successCondition: "家族が同じ情報を確認できる", knownFacts: [], uncertainties: [],
    // The initial analysis intentionally misses food_information_scope.
    criticalProductDecisions: [{ decisionDomain: "family_sharing_scope", reason: "家族共有は初期入力で確定済みです。", resolvedByInitialInput: true }],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(completionGate(context).coverageAuditPending, true);

  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: false, coverageSummary: "食材として何を保持するかが未確定です。", auditedDecisionDomains: ["family_sharing_scope", "food_information_scope"],
    criticalProductDecisions: [{ decisionDomain: "food_information_scope", reason: "選択によって主要画面と不可欠なデータモデルが変わります。" }],
    clarificationQuestions: [{ id: "food_information_scope", label: "管理する食材情報", importance: "high", question: productQuestion("food_information_scope", "食材について、何を管理しますか？", ["名前と数量を管理する", "名前・数量・期限を管理する"]) }],
    aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, false);
  assert.equal(planNext(context)?.id, "food_information_scope");
  assert.deepEqual(context.criticalDecisionCoverageAudit.discoveredDecisionDomains, ["food_information_scope"]);
});

test("coverage audit is domain-generic and question count follows discovered unresolved decisions", () => {
  const productQuestion = (domain, title) => ({
    title, intent: "主要な製品挙動を決めます。", options: ["方式A", "方式B"], recommended: "方式A", recommendationReason: "最小の主要フローに適するためです。",
    decisionDomain: domain, decisionBoundary: "business_rule", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  });
  const cases = [
    { idea: "夏祭りのスタッフ割り当てを登録するアプリ", resolved: "assignment_unit", missing: "cross_stall_duplicate_policy" },
    { idea: "匿名で提案を投稿してチームで確認するアプリ", resolved: "proposal_submission", missing: "proposal_visibility" },
    { idea: "現場で設備点検結果を記録するアプリ", resolved: "inspection_recording", missing: "failed_inspection_outcome" },
  ];
  for (const scenario of cases) {
    let context = enableCriticalDecisionCoverageAudit(createProjectContext(scenario.idea));
    context = applyAnalysis(context, {
      projectType: "unknown", platform: null, genre: null, purpose: scenario.idea, targetUsers: "利用者", managedObject: "対象データ",
      primaryAction: "情報を登録する", persistedOutcome: "登録結果", successCondition: "登録結果を確認できる", knownFacts: [], uncertainties: [],
      criticalProductDecisions: [{ decisionDomain: scenario.resolved, reason: "初期入力で確定済みです。", resolvedByInitialInput: true }],
    });
    context = applyCriticalDecisionCoverageAudit(context, {
      coverageComplete: false, coverageSummary: "主要挙動に未確定事項があります。", auditedDecisionDomains: [scenario.resolved, scenario.missing],
      criticalProductDecisions: [{ decisionDomain: scenario.missing, reason: "合理的な回答によって製品挙動が分岐します。" }],
      clarificationQuestions: [{ id: scenario.missing, label: scenario.missing, importance: "high", question: productQuestion(scenario.missing, "この場合の利用者向けの動作を選んでください") }],
      aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
    });
    assert.equal(completionGate(context).complete, false, scenario.idea);
    assert.equal(planNext(context)?.id, scenario.missing, scenario.idea);
  }
});

test("coverage audit accepts safe unique inference but becomes stale after a new answer", () => {
  let context = enableCriticalDecisionCoverageAudit(createProjectContext("写真を選んで一覧へ登録するアプリ"));
  context = applyAnalysis(context, {
    projectType: "画像一覧", platform: null, genre: null, purpose: "写真を一覧へ登録する。", targetUsers: "単一利用者", managedObject: "写真",
    primaryAction: "写真を選んで登録する", persistedOutcome: "写真一覧", successCondition: "選んだ写真を一覧で確認できる", knownFacts: [], uncertainties: [],
    criticalProductDecisions: [{ decisionDomain: "photo_registration", reason: "初期入力で確定済みです。", resolvedByInitialInput: true }],
  });
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: true, coverageSummary: "重要なProduct Decisionは十分に確定しています。", auditedDecisionDomains: ["photo_registration"],
    criticalProductDecisions: [], clarificationQuestions: [], implementationProposals: [], stateTransitionGaps: [],
    aiInferredRequirements: [{
      key: "selected_photo_visible", value: "登録した写真を同じ一覧に表示する。", reason: "登録結果を確認するために不可欠です。", provenanceReason: "初期入力から直接一意に導出できます。", decisionDomain: "photo_registration", uniquelyDerived: true, hasMultipleReasonableImplementations: false,
      necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "主要フローの結果表示に不可欠です。" },
      eligibility: { sourceKey: "initial_input", sourceDecisionIds: [], sourceInitialInputSpan: "写真を選んで一覧へ登録する", directDerivation: true, derivationDepth: 1, acceptanceCriteriaRequired: true, introducesNewProductValue: false },
    }],
  });
  assert.equal(completionGate(context).complete, true, JSON.stringify(completionGate(context)));

  const extraQuestion = {
    title: "一覧を誰と共有しますか？", intent: "データ所有範囲を決めます。", options: ["自分だけ", "複数人で共有"], recommended: "自分だけ", recommendationReason: "最小構成です。",
    decisionDomain: "sharing_scope", decisionBoundary: "roles_permissions", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  };
  context = setDimensions(context, [...context.dimensions, { id: "sharing_scope", label: "共有範囲", importance: "high", userJudgmentRequired: true, known: false, value: null, question: extraQuestion }]);
  context = recordAnswer(context, "sharing_scope", "自分だけ");
  assert.equal(completionGate(context).complete, false);
  assert.equal(completionGate(context).coverageAuditPending, true);
});

test("unknown completion domain fallback preserves the original decision meaning", () => {
  const decisionDomain = "レシピマッチ基準（完全一致か部分一致/代替許容か）";
  const reason = "手持ち食材との一致条件によって、今日作れるレシピの範囲が変わります。";
  let context = applyAnalysis(createProjectContext("冷蔵庫の食材から今日作れるレシピを提案する"), {
    projectType: "レシピ提案", platform: null, genre: null,
    purpose: "今日作れる料理の選択を助ける。", targetUsers: "自宅の利用者", managedObject: "食材とレシピ",
    primaryAction: "食材を登録してレシピ候補を確認する", persistedOutcome: null,
    successCondition: "条件に合うレシピを選べる", knownFacts: [], uncertainties: [reason],
    criticalProductDecisions: [{ decisionDomain, reason, resolvedByInitialInput: false }],
  });
  context = ensureCompletionQuestion(context);
  const next = planNext(context);
  assert.equal(next?.id, decisionDomain);
  assert.equal(next?.question?.decisionDomain, decisionDomain);
  assert.match(next?.question?.title ?? "", /レシピマッチ基準/);
  assert.equal(next?.question?.intent, reason);
  assert.doesNotMatch(next?.question?.title ?? "", /利用者は、対象をどのように管理しますか/);
});

test("unknown completion fallback is domain-generic and does not collapse unrelated decisions into management", () => {
  for (const scenario of [
    { domain: "candidate_substitution_policy", reason: "不足条件を代替候補で補えるかによって提示結果が変わります。" },
    { domain: "ingredient_quantity_policy", reason: "食材の有無だけか数量まで判定するかが未確定です。" },
  ]) {
    let context = applyAnalysis(createProjectContext("入力から候補を提案するアプリ"), {
      projectType: "提案", platform: null, genre: null, purpose: "候補を提案する。", targetUsers: "利用者",
      managedObject: "入力と候補", primaryAction: "入力して候補を確認する", persistedOutcome: null,
      successCondition: "候補を選べる", knownFacts: [], uncertainties: [scenario.reason],
      criticalProductDecisions: [{ decisionDomain: scenario.domain, reason: scenario.reason, resolvedByInitialInput: false }],
    });
    context = ensureCompletionQuestion(context);
    const next = planNext(context);
    assert.equal(next?.question?.decisionDomain, scenario.domain);
    assert.match(next?.question?.title ?? "", new RegExp(scenario.domain.replace(/_/g, " ").split(" ")[0], "i"));
    assert.equal(next?.question?.intent, scenario.reason);
    assert.doesNotMatch(next?.question?.title ?? "", /対象をどのように管理/);
  }
});

test("AI analysis cannot invent a local-only boundary and a leaking proposal is removed from repair input", () => {
  const sharingQuestion = {
    title: "家族でどう共有しますか？", intent: "共有体験を決めます。", options: ["複数端末で同じ一覧を共有する", "一台だけで使う"], recommended: "複数端末で同じ一覧を共有する", recommendationReason: "家族で使いやすいためです。",
    decisionDomain: "sharing_scope", decisionBoundary: "roles_permissions", informationGain: "high", architecturalImpact: "major",
    necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
  };
  let context = applyAnalysis(createProjectContext("家族で食材を共有管理するアプリ"), {
    projectType: "食材管理", platform: null, genre: null, purpose: "家族で食材を管理する。", targetUsers: "家族", managedObject: "食材", primaryAction: null, persistedOutcome: null, successCondition: null,
    knownFacts: [{ key: "ai_assumed_storage", value: "端末内に保存する", reason: "AIが慣行から仮定した。" }], uncertainties: [], criticalProductDecisions: [],
  });
  context = setDimensions(context, [{ id: "sharing_scope", label: "共有", importance: "high", userJudgmentRequired: true, known: false, value: null, question: sharingQuestion }]);
  context = recordAnswer(context, "sharing_scope", "複数端末で同じ一覧を共有する");
  assert.equal(buildCanonicalRequirements(context).dataBoundary.mode, "unspecified");

  context = { ...context, implementationProposals: [{ key: "unconfirmed_sync_strategy", title: "同期方式", description: "更新競合を自動解決する同期方式を使う。", recommended: true, reason: "技術提案", alternatives: [] }] };
  const leakedSpec = { ...completeSpec, functionalRequirements: "必須: 更新競合を自動解決する同期方式を使う。" };
  const issues = validateLocally(context, leakedSpec).issues;
  const leak = issues.find((issue) => issue.offendingRequirementIds?.includes("unconfirmed_sync_strategy"));
  assert.ok(leak);
  const repaired = repairConsistency(context, leakedSpec, issues);
  assert.equal(repaired.context.implementationProposals.some((item) => item.key === "unconfirmed_sync_strategy"), false);
});
