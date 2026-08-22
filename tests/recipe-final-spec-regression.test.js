import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE,
  applyAnalysis,
  buildCanonicalRequirements,
  canonicalizeSpec,
  createProjectContext,
  runSpecRepairPipeline,
  validateLocally,
} from "../requirements-core.js";

const idea = "ユーザーが手持ちの食材を登録すると、その日のうちに作れる料理（レシピ）を提案して料理選びを助け、買い物の手間や食材の廃棄を減らす。";

function recipeContext() {
  const analyzed = applyAnalysis(createProjectContext(idea), {
    projectType: "レシピ提案アプリ",
    platform: null,
    genre: "料理支援",
    purpose: "手持ち食材だけでその日のうちに作れる料理を提案し、料理選びと買い物・廃棄の削減を助ける。",
    targetUsers: "手持ち食材から料理を選びたい人",
    managedObject: "手持ち食材と内蔵レシピ",
    primaryAction: "食材を登録し、全必要食材が揃うレシピを確認する",
    persistedOutcome: "端末内に手持ち食材を保存する",
    successCondition: "登録食材だけで作れるレシピが表示される",
    knownFacts: [], uncertainties: [], criticalProductDecisions: [],
  });
  return {
    ...analyzed,
    facts: [
      ...analyzed.facts,
      { key: "recipe_data_source", decisionDomain: "recipe_data_source", value: "小規模な内蔵レシピコレクション（代表的な家庭料理 数十〜数百）", source: SOURCE.USER, reason: "ユーザー確定" },
      { key: "matching_rule_strictness", decisionDomain: "matching_rule_strictness", value: "完全一致（レシピの全必要食材が登録されている場合のみ提案）", source: SOURCE.USER, reason: "ユーザー確定" },
      { key: "account_and_sync", decisionDomain: "account_and_sync", value: "ローカル端末のみ（アカウント不要、端末単独利用）", source: SOURCE.USER, reason: "ユーザー確定" },
    ],
    answeredDecisionDomains: ["recipe_data_source", "matching_rule_strictness", "account_and_sync"],
  };
}

const validSpec = {
  projectOverview: "手持ち食材から、その日のうちに作れる家庭料理を端末内で提案する。",
  coreUserValue: "料理選びを助け、買い物の手間と食材廃棄を減らす。",
  mvpScope: "必須：食材名の登録、数十〜数百の内蔵レシピ、全必要食材が揃ったレシピだけを表示する完全一致検索、端末単独利用。除外：アカウント、クラウド同期、通知、共有。",
  outOfScope: "アカウント、クラウド同期、通知、共有はMVPに含めない。",
  userFlow: "食材名を登録すると完全一致検索を行い、一致したレシピを一覧表示して詳細を確認する。",
  screens: "食材登録画面、レシピ提案一覧、レシピ詳細。",
  functionalRequirements: "FR-1 食材名を端末内へ登録する。\nFR-2 全必要食材が登録済みのレシピだけを内蔵コレクションから表示する。",
  dataModel: "Ingredient { id: string, name: string }\nRecipe { id: string, title: string, requiredIngredients: string[], steps: string[] }",
  stateTransitions: "食材登録を確定すると端末内の食材集合を更新し、その更新後の集合で完全一致検索を再評価する。検索結果は表示用の派生データであり永続化しない。",
  errorHandling: "食材名が空なら登録せず入力を促す。一致するレシピがなければ、その旨を表示する。",
  implementationRules: "端末内データだけを使う。レシピの全必要食材が登録食材集合に含まれる場合だけ一致とする。",
  acceptanceCriteria: "AC-1 全必要食材を登録すると該当レシピが表示される。\nAC-2 必要食材が一つでもなければ該当レシピは表示されない。\nAC-3 アカウントなしで端末単独利用できる。",
};

test("recipe decisions establish a local-only boundary without changing their classification", () => {
  const canonical = buildCanonicalRequirements(recipeContext());
  assert.equal(canonical.dataBoundary.mode, "local_only");
  assert.deepEqual(canonical.userConfirmedDecisions.map((item) => item.key), ["recipe_data_source", "matching_rule_strictness", "account_and_sync"]);
  assert.equal(canonical.uniquelyDerivedAiRequirements.length, 0);
});

test("explicit exclusions are not mistaken for mandatory notification or cloud-sync features", () => {
  const validation = validateLocally(recipeContext(), validSpec);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  const normalized = canonicalizeSpec(recipeContext(), {
    ...validSpec,
    projectOverview: "アカウントやクラウド同期が不要である。",
    outOfScope: "クラウド同期はMVP範囲外。",
    implementationRules: "外部同期やバックアップはMVP範囲外。",
  });
  assert.equal(normalized.projectOverview, "アカウントやクラウド同期が不要である。");
  assert.equal(normalized.outOfScope, "クラウド同期はMVP範囲外。");
  assert.equal(normalized.implementationRules, "外部同期やバックアップはMVP範囲外。");

  const invalid = { ...validSpec, implementationRules: `${validSpec.implementationRules}\n複数端末間でクラウド同期する。` };
  const invalidIssues = validateLocally(recipeContext(), invalid).issues;
  assert.ok(invalidIssues.some((issue) => /ネットワーク同期/.test(issue.message)));
});

test("recipe SPEC repair removes a real ungrounded action then accepts exclusion-only wording", async () => {
  const firstSpec = {
    ...validSpec,
    mvpScope: "食材を登録・編集・削除し、完全一致する内蔵レシピを端末内で表示する。",
    functionalRequirements: `${validSpec.functionalRequirements}\nFR-3 登録食材を削除できる。`,
  };
  let calls = 0;
  const result = await runSpecRepairPipeline({
    context: recipeContext(),
    generateSpec: async () => ({ spec: calls++ === 0 ? firstSpec : validSpec }),
    validateRemote: async () => ({ valid: true, issues: [] }),
  });

  assert.equal(result.validation.valid, true);
  assert.equal(calls, 2);
  assert.equal(result.trace[0].validationErrors[0].ruleId, "ungrounded_product_concept");
  assert.match(result.trace[0].validationErrors[0].message, /削除/);
  assert.equal(result.trace[1].action, "accepted_generated_spec");
});
