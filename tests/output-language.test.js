import assert from "node:assert/strict";
import test from "node:test";
import { detectOutputLanguage } from "../server/ai.js";

test("selects Japanese only for an idea containing Japanese text", () => {
  assert.equal(detectOutputLanguage({ idea: "Jポップのイントロクイズを作りたい" }), "Japanese");
  assert.equal(detectOutputLanguage({ context: { idea: "Create a music quiz game" } }), "English");
});
