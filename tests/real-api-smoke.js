import "dotenv/config";
import assert from "node:assert/strict";
import { requirementsAI } from "../server/ai.js";

const idea = "Jポップのイントロクイズが簡単にできるゲームを作りたい";
const initial = await requirementsAI.startProject(idea);
assert.equal(typeof initial.analysis.projectType, "string");
assert.equal(typeof initial.analysis.purpose, "string");
assert.ok(Array.isArray(initial.analysis.knownFacts));
assert.ok(initial.dimensions.some((dimension) => dimension.question));
const serialized = JSON.stringify(initial);
assert.ok(!/ハムスター|脱出ゲーム|ケージ|木のスプーン|小さなカギ|給水ボトル/.test(serialized));
console.log(`Real API Japanese initial-question smoke test: PASS (${initial.analysis.projectType})`);
