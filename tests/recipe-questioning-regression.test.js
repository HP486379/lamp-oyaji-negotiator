import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnalysis,
  applyCriticalDecisionCoverageAudit,
  calculatedConversationProgress,
  completionGate,
  createProjectContext,
  criticalDecisionRequiresQuestion,
  enableCriticalDecisionCoverageAudit,
  ensureCompletionQuestion,
  planNext,
  recordAnswer,
  runSpecRepairPipeline,
  setDimensions,
} from "../requirements-core.js";

const recipeIdea = "ユーザーが手持ちの食材を登録すると、その日のうちに作れる料理（レシピ）を提案して料理選びを助け、買い物の手間や食材の廃棄を減らす。";

const noImpact = () => ({
  changesCoreOutputOrEligibility: false,
  changesDataOwnershipOrAccess: false,
  changesExternalDependencyOrContentBoundary: false,
  changesActorPermissionsOrPrimaryFlow: false,
  changesIrreversibleState: false,
});

function critical(decisionDomain, impactKey, reason) {
  return {
    decisionDomain,
    reason,
    resolvedByInitialInput: false,
    necessity: {
      // Regression shape: an earlier model called a conventional choice safe.
      // The structured product-impact audit must still preserve the material
      // Product Decision instead of allowing a zero-question completion.
      safeMvpDefaultAvailable: true,
      materiallyChangesProduct: false,
      derivableFromConfirmedDecision: false,
      requiresUserDecision: false,
      productImpact: { ...noImpact(), [impactKey]: true },
      derivationDepth: 1,
      rationale: reason,
    },
  };
}

function question(id, title, options) {
  return {
    id,
    label: title,
    importance: "high",
    userJudgmentRequired: true,
    known: false,
    value: null,
    question: {
      title,
      intent: "選択によってMVPの利用体験と仕様境界が変わるため確認します。",
      options,
      recommended: options[0],
      recommendationReason: "最小構成で中心価値を検証しやすいためです。",
      decisionDomain: id,
      decisionBoundary: "primary_flow",
      informationGain: "high",
      architecturalImpact: "major",
      necessity: {
        requiredForCoreValue: true,
        requiredForPrimaryFlow: true,
        clarifiesExplicitUserRequest: true,
        changesProductBehavior: true,
        introducesNewFeature: false,
        implementationDetailOnly: false,
        derivedOnlyFromAIInference: false,
        decisionClass: "product",
        requiresUserDecision: true,
      },
    },
  };
}

const analysis = {
  projectType: "レシピ提案アプリ",
  platform: null,
  genre: "料理支援",
  purpose: "手持ち食材から作れる料理を提案して献立決定を助ける。",
  targetUsers: "手持ち食材から料理を選びたい人",
  managedObject: "手持ち食材とレシピ",
  primaryAction: "食材を登録して作れる料理を確認する",
  persistedOutcome: "登録した食材を保持する",
  successCondition: "条件に合う料理候補を確認できる",
  knownFacts: [],
  uncertainties: [],
  criticalProductDecisions: [
    critical("recipe_data_source", "changesExternalDependencyOrContentBoundary", "レシピの供給元で掲載範囲と外部依存が変わります。"),
    critical("matching_rule_strictness", "changesCoreOutputOrEligibility", "候補に含める料理が変わります。"),
    critical("account_and_sync", "changesDataOwnershipOrAccess", "データを使える端末と共有範囲が変わります。"),
  ],
};

const dimensions = [
  question("recipe_data_source", "レシピはどの範囲から提案しますか？", ["小規模な内蔵レシピ", "外部のレシピサービスを利用する"]),
  question("matching_rule_strictness", "手持ち食材とレシピをどの基準で照合しますか？", ["必要食材がすべて揃う料理だけ", "一部不足していても候補に含める", "代替食材も候補に含める"]),
  question("account_and_sync", "登録した食材はどこで使えるようにしますか？", ["この端末だけで使う", "アカウントで複数端末から使う"]),
];

const validSpec = {
  projectOverview: "手持ち食材を登録し、条件に合う内蔵レシピを提案する端末単独利用アプリ。",
  coreUserValue: "その日の手持ち食材だけで作れる料理を迷わず選べる。",
  mvpScope: "食材登録、小規模な内蔵レシピ、全必要食材が揃う料理だけの提案、端末単独利用。",
  outOfScope: "アカウント、クラウド同期、通知、外部レシピサービス。",
  userFlow: "食材を登録し、全必要食材が揃った料理の一覧から詳細を確認する。",
  screens: "食材登録、料理提案一覧、料理詳細。",
  functionalRequirements: "FR-1 食材名を登録する。\nFR-2 全必要食材が揃う内蔵レシピだけを表示する。",
  dataModel: "Ingredient { name: string }\nRecipe { name: string, requiredIngredients: string[] }",
  stateTransitions: "食材登録前 → 食材登録済み。保存内容は食材名。登録後に完全一致条件で候補を再評価する。",
  errorHandling: "食材名が空なら登録せず入力を促す。一致候補がなければその旨を表示する。",
  implementationRules: "同一端末のデータだけを使い、必要食材集合が登録食材集合に含まれる場合だけ候補とする。",
  acceptanceCriteria: "AC-1 全必要食材を登録した料理だけが表示される。\nAC-2 アカウントなしで端末単独利用できる。",
};

test("material product-impact axes prevent recipe flow from completing with zero answers", async () => {
  for (const decision of analysis.criticalProductDecisions) assert.equal(criticalDecisionRequiresQuestion(decision), true);
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(recipeIdea));
  context = applyAnalysis(context, analysis);
  // A Structured Output may accidentally repeat the class label as the
  // decisionDomain. The dimension id remains the stable semantic domain.
  context = setDimensions(context, dimensions.map((dimension) => ({
    ...dimension,
    question: { ...dimension.question, decisionDomain: "product" },
  })));
  assert.equal(completionGate(context).complete, false);
  assert.equal(calculatedConversationProgress(context), 0);

  const asked = [];
  while (planNext(context)) {
    const next = planNext(context);
    asked.push(next.question.decisionDomain);
    context = recordAnswer(context, next.id, next.question.recommended, true);
  }
  assert.deepEqual(asked, ["recipe_data_source", "matching_rule_strictness", "account_and_sync"]);
  assert.equal(completionGate(context).complete, false, "coverage audit must still run before completion");

  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: true,
    coverageSummary: "重要な未確定事項はありません。",
    auditedDecisionDomains: asked,
    criticalProductDecisions: [], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(completionGate(context).complete, true);
  assert.equal(calculatedConversationProgress(context), 100);

  const result = await runSpecRepairPipeline({
    context,
    generateSpec: async () => ({ spec: validSpec }),
    validateRemote: async () => ({ valid: true, issues: [] }),
  });
  assert.equal(result.validation.valid, true);
  assert.deepEqual(result.context.facts.filter((fact) => fact.source === "user_confirmed").map((fact) => fact.decisionDomain), asked);
});

test("nonmaterial technical defaults remain nonblocking", () => {
  let context = enableCriticalDecisionCoverageAudit(createProjectContext("個人が読んだ本の題名と感想を手入力し、この端末の一覧で確認するアプリ"));
  context = applyAnalysis(context, {
    projectType: "読書記録", platform: null, genre: null, purpose: "読書記録を確認する。", targetUsers: "個人",
    managedObject: "本の題名と感想", primaryAction: "題名と感想を手入力して一覧で確認する", persistedOutcome: "この端末に読書記録を保持する", successCondition: "入力した記録を一覧で確認できる",
    knownFacts: [], uncertainties: [], criticalProductDecisions: [{
      decisionDomain: "storage_engine", reason: "内部保存方式", resolvedByInitialInput: false,
      necessity: { safeMvpDefaultAvailable: true, materiallyChangesProduct: false, derivableFromConfirmedDecision: true, requiresUserDecision: false, productImpact: noImpact(), derivationDepth: 1, rationale: "利用体験を変えない内部方式です。" },
    }],
  });
  context = setDimensions(context, []);
  context = applyCriticalDecisionCoverageAudit(context, {
    coverageComplete: true, coverageSummary: "主要フローは一意です。", auditedDecisionDomains: ["storage_engine"],
    criticalProductDecisions: [], clarificationQuestions: [], aiInferredRequirements: [], implementationProposals: [], stateTransitionGaps: [],
  });
  assert.equal(planNext(context), null);
  assert.equal(completionGate(context).complete, true);
});

test("coverage gate recovers a missing core-output rule while suppressing unrequested field detail", () => {
  const omittedMatchingAnalysis = {
    ...analysis,
    criticalProductDecisions: [
      critical("content_source", "changesExternalDependencyOrContentBoundary", "必須コンテンツの範囲が変わります。"),
      critical("data_ownership", "changesDataOwnershipOrAccess", "データを利用できる範囲が変わります。"),
      critical("ingredient_input_method", "changesActorPermissionsOrPrimaryFlow", "認識やスキャン等の入力方法です。"),
      critical("input_attributes", "changesCoreOutputOrEligibility", "数量や期限等の追加属性です。"),
    ],
  };
  const providerDimensions = [
    question("content_source", "候補データはどこから用意しますか？", ["内蔵データ", "外部サービスのデータ"]),
    question("data_ownership", "登録データはどこで使いますか？", ["この端末だけ", "アカウントで複数端末"]),
    question("ingredient_input_method", "どの登録方法を使いますか？", ["手入力", "画像認識", "バーコードスキャン"]),
    question("input_attributes", "どの項目を必須にしますか？", ["名前のみ", "名前・数量・期限"]),
  ];
  let context = enableCriticalDecisionCoverageAudit(createProjectContext(recipeIdea));
  context = setDimensions(applyAnalysis(context, omittedMatchingAnalysis), providerDimensions);
  assert.equal(planNext(context)?.id, "content_source");
  context = recordAnswer(context, "content_source", "内蔵データ", true);
  assert.equal(planNext(context)?.id, "data_ownership");
  context = recordAnswer(context, "data_ownership", "この端末だけ", true);
  assert.equal(planNext(context)?.id, "ingredient_input_method");
  context = recordAnswer(context, "ingredient_input_method", "手入力", true);
  context = ensureCompletionQuestion(context);
  assert.equal(planNext(context)?.question.decisionDomain, "core_output_eligibility");
  assert.equal(completionGate(context).complete, false);
});
