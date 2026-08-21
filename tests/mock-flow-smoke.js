import assert from "node:assert/strict";
import { applyAnalysis, buildMarkdown, createProjectContext, planNext, recordAnswer, recordInference, setDimensions, validateLocally } from "../requirements-core.js";

const specFor = (idea) => ({ projectOverview: idea, coreUserValue: "利用者が主要な目的を安全に達成できる", mvpScope: "確認済みの主要フローを提供する", outOfScope: "将来の拡張", userFlow: "開始、入力、結果確認", screens: "開始画面と主要画面", functionalRequirements: "主要な操作を提供する", dataModel: "最小限のデータ", stateTransitions: "開始から完了", errorHandling: "失敗時は再試行を案内", implementationRules: "確認済み事項を変更しない", acceptanceCriteria: "主要フローを完了できる" });

// Generic mock integration: context -> answer -> inference -> canonical SPEC.
let context = createProjectContext("Jポップのイントロクイズが簡単にできるゲームを作りたい");
context = applyAnalysis(context, { purpose: context.idea, knownFacts: [] });
context = setDimensions(context, [{ id: "platform", label: "提供先", importance: "high", userJudgmentRequired: true, known: false, value: null, question: { title: "提供先は？", intent: "配布方法を決める", options: ["Web", "モバイル"], recommended: "Web", recommendationReason: "すぐ遊べる", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesUserRequest: false, introducesNewFeature: false } } }]);
context = recordAnswer(context, planNext(context).id, "Web", true);
context = recordInference(context, { aiInferredRequirements: [{ key: "session_length", value: "5問", reason: "短時間で遊べる", necessity: { confirmedDecisionRequired: false, coreUserValueRequired: true, primaryFlowRequired: true, reason: "主要フロー" } }], implementationProposals: [], futureOptional: [], clarificationQuestions: [] });
assert.ok(validateLocally(context, specFor(context.idea)).valid);

// Regression integration: never re-ask external transfer; advanced gamification
// produces a clarification question and remains unmodified until user answers.
let child = createProjectContext("子供のお小遣い管理アプリ");
child = applyAnalysis(child, { purpose: child.idea, knownFacts: [] });
child = setDimensions(child, [
  { id: "education", label: "教育・楽しさ", importance: "high", userJudgmentRequired: true, known: false, value: null, question: { title: "楽しみながら学ぶ仕組みは？", intent: "教育体験を決める", options: ["高度なゲーミフィケーション", "シンプル"], recommended: "高度なゲーミフィケーション", recommendationReason: "学習意欲を高める", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: false, clarifiesUserRequest: true, introducesNewFeature: false } } },
  { id: "external_transfer", label: "外部送金", importance: "medium", userJudgmentRequired: true, known: false, value: null, question: { title: "外部送金や銀行連携を含めますか？", intent: "新機能", options: ["含めない", "含める"], recommended: "含めない", recommendationReason: "MVP外", necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesUserRequest: false, introducesNewFeature: true } } },
]);
child = recordAnswer(child, "education", "高度なゲーミフィケーション");
child = recordAnswer(child, "external_transfer", "含めない");
child = recordInference(child, { aiInferredRequirements: [], implementationProposals: [], futureOptional: [], clarificationQuestions: [{ id: "gamification_scope", label: "ゲーム化の詳細", importance: "high", question: { title: "高度なゲーミフィケーションには何を含めますか？", intent: "要求を縮小せず詳細化する", options: ["レベル／経験値", "バッジ／実績", "連続記録", "ミッション／クエスト", "仮想報酬", "複数を組み合わせる"], recommended: "複数を組み合わせる", recommendationReason: "高度な要望を具体化する", necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: false, clarifiesUserRequest: true, introducesNewFeature: false } } }] });
assert.equal(planNext(child).id, "gamification_scope");
assert.equal(child.facts.filter((fact) => fact.key === "external_transfer" && fact.source === "user_confirmed").length, 1);
child = recordAnswer(child, "gamification_scope", "レベル／経験値、ミッション／クエスト、仮想報酬");
assert.equal(planNext(child), null);
const markdown = buildMarkdown(child, { ...specFor(child.idea), mvpScope: "レベル、経験値、ミッション、仮想報酬を含むゲーム化で学習できる" });
assert.match(markdown, /高度なゲーミフィケーション/);
assert.doesNotMatch(markdown, /最小限のゲーミフィケーション|バッジだけ/);
console.log("Mocked AI v4.1 end-to-end smoke test: PASS");
