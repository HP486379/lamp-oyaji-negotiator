import "dotenv/config";
import assert from "node:assert/strict";
import { requirementsAI } from "../server/ai.js";
import { applyAnalysis, createProjectContext, planNext, recordAnswer, recordInference, setDimensions, validateLocally } from "../requirements-core.js";

const idea = "Jポップのイントロクイズが簡単にできるゲームを作りたい";
const hasJapanese = (value) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value));
const forbidden = /ハムスター|脱出ゲーム|ケージ|木のスプーン|小さなカギ|給水ボトル/;

let context = createProjectContext(idea);
const initial = await requirementsAI.startProject(idea);
context = setDimensions(applyAnalysis(context, initial.analysis), initial.dimensions);
let question = planNext(context);
assert.ok(question?.question, "the initial response must yield a user question");
for (const value of [question.question.title, question.question.intent, question.question.recommended, question.question.recommendationReason, ...question.question.options]) assert.ok(hasJapanese(value), "initial question content must be Japanese");
let answers = 0;
while (question && answers < 4) {
  context = recordAnswer(context, question.id, question.question.recommended, true);
  question = planNext(context);
  answers += 1;
}
context = recordInference(context, await requirementsAI.inferMvp(context));
const spec = (await requirementsAI.generateSpec(context)).spec;
const validation = await requirementsAI.validateSpec(context, spec);
assert.ok(validation.valid && validateLocally(context, spec).valid, "generated specification must validate");
for (const [section, value] of Object.entries(spec)) assert.ok(hasJapanese(value), `SPEC section must be Japanese: ${section}`);
const serialized = JSON.stringify({ initial, context, spec });
assert.doesNotMatch(serialized, forbidden);
console.log(`Real API Japanese E2E: PASS (${answers} answered question(s), SPEC generated)`);
