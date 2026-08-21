import "dotenv/config";
import assert from "node:assert/strict";
import { requirementsAI } from "../server/ai.js";
import { applyAnalysis, createProjectContext, planNext, recordAnswer, setDimensions } from "../requirements-core.js";

const idea = "子供のお小遣い管理アプリ";
let context = createProjectContext(idea);
const initial = await requirementsAI.startProject(idea);
context = setDimensions(applyAnalysis(context, initial.analysis), initial.dimensions);
let question = planNext(context);
let answers = 0;
while (question && answers < 3) {
  context = recordAnswer(context, question.id, question.question.recommended, true);
  question = planNext(context);
  answers += 1;
}
assert.ok(answers > 0, "initial flow must provide at least one question");
const inference = await requirementsAI.inferMvp(context);
assert.ok(Array.isArray(inference.aiInferredRequirements));
assert.ok(Array.isArray(inference.clarificationQuestions));
assert.equal(new Set(context.answeredQuestionKeys).size, context.answeredQuestionKeys.length);
console.log(`Real API child-flow inference smoke: PASS (${answers} answered question(s), ${inference.aiInferredRequirements.length} inferred requirement(s))`);
