import "dotenv/config";
import assert from "node:assert/strict";
import { requirementsAI } from "../server/ai.js";
import {
  SOURCE,
  applyAnalysis,
  createProjectContext,
  prepareCanonicalContext,
  runSpecRepairPipeline,
} from "../requirements-core.js";

const idea = "ユーザーが手持ちの食材を登録すると、その日のうちに作れる料理（レシピ）を提案して料理選びを助け、買い物の手間や食材の廃棄を減らす。";

let context = applyAnalysis(createProjectContext(idea), {
  projectType: "レシピ提案アプリ",
  platform: null,
  genre: "料理支援",
  purpose: "手持ち食材だけでその日のうちに作れる料理を提案し、料理選びと買い物・廃棄の削減を助ける。",
  targetUsers: "手持ち食材から料理を選びたい人",
  managedObject: "手持ち食材と内蔵レシピ",
  primaryAction: "食材を登録し、全必要食材が揃うレシピを確認する",
  persistedOutcome: "端末内に手持ち食材を保存する",
  successCondition: "登録食材だけで作れるレシピが表示される",
  knownFacts: [],
  uncertainties: [],
  criticalProductDecisions: [],
});

context = {
  ...context,
  facts: [
    ...context.facts,
    { key: "recipe_data_source", decisionDomain: "recipe_data_source", value: "小規模な内蔵レシピコレクション（代表的な家庭料理 数十〜数百）", source: SOURCE.USER, reason: "ユーザー確定" },
    { key: "matching_rule_strictness", decisionDomain: "matching_rule_strictness", value: "完全一致（レシピの全必要食材が登録されている場合のみ提案）", source: SOURCE.USER, reason: "ユーザー確定" },
    { key: "account_and_sync", decisionDomain: "account_and_sync", value: "ローカル端末のみ（アカウント不要、端末単独利用）", source: SOURCE.USER, reason: "ユーザー確定" },
  ],
  answeredDecisionDomains: ["recipe_data_source", "matching_rule_strictness", "account_and_sync"],
};

const diagnostics = [];
try {
  const result = await runSpecRepairPipeline({
    context: prepareCanonicalContext(context),
    generateSpec: (canonicalContext) => requirementsAI.generateSpec(canonicalContext),
    validateRemote: (canonicalContext, spec) => requirementsAI.validateSpec(canonicalContext, spec),
    onDiagnostic: (entries) => diagnostics.push(...entries),
  });
  assert.equal(result.validation.valid, true);
  assert.equal(result.context.canonicalRequirements.dataBoundary.mode, "local_only");
  assert.deepEqual(result.context.canonicalRequirements.userConfirmedDecisions.map((item) => item.key), ["recipe_data_source", "matching_rule_strictness", "account_and_sync"]);
  if (process.env.PRINT_SPEC === "true") console.log(JSON.stringify(result.spec, null, 2));
  console.log(`Real API recipe SPEC repair: PASS (${result.trace.length} generation iteration(s))`);
} catch (error) {
  console.error(JSON.stringify({ status: "failure", message: error.message, validationRules: diagnostics.map((item) => item.validation_rule_id) }, null, 2));
  process.exitCode = 1;
}
