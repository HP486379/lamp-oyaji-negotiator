import test from "node:test";
import assert from "node:assert/strict";
import { OUTPUT_TOKEN_LIMITS, structuredOutputMissingError } from "../server/ai.js";

test("mvp inference has a bounded budget sized for its compact structured result", () => {
  assert.equal(OUTPUT_TOKEN_LIMITS.mvp_inference, 6000);
  assert.equal(OUTPUT_TOKEN_LIMITS.mvp_inference > OUTPUT_TOKEN_LIMITS.project_analysis, true);
});

test("max_output_tokens incomplete inference remains diagnosable instead of being mistaken for a parse failure", () => {
  const error = structuredOutputMissingError({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "message", content: [{ type: "output_text" }] }],
    output_text: "{\"aiInferredRequirements\":[",
    output_parsed: null,
  });
  assert.equal(error?.name, "StructuredOutputMissingError");
  assert.equal(error?.code, "max_output_tokens");
  assert.equal(error?.diagnostic.incomplete_reason, "max_output_tokens");
});
