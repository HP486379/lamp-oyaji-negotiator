import test from "node:test";
import assert from "node:assert/strict";
import { OUTPUT_TOKEN_LIMITS, structuredOutputMissingError } from "../server/ai.js";

test("project analysis reserves enough output tokens for complete core-capability structured output", () => {
  assert.equal(OUTPUT_TOKEN_LIMITS.project_analysis, 5000);
  assert.ok(OUTPUT_TOKEN_LIMITS.project_analysis >= 5000);
});

test("incomplete project analysis caused by max_output_tokens retains a diagnosable structured-output error", () => {
  const error = structuredOutputMissingError({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "message", content: [{ type: "output_text" }] }],
    output_text: "{\"projectType\":\"途中\"",
    output_parsed: null,
  });
  assert.equal(error?.name, "StructuredOutputMissingError");
  assert.equal(error?.code, "max_output_tokens");
  assert.equal(error?.diagnostic.status, "incomplete");
  assert.equal(error?.diagnostic.incomplete_reason, "max_output_tokens");
  assert.equal(error?.diagnostic.output_text_length > 0, true);
});
