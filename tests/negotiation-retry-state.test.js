import test from "node:test";
import assert from "node:assert/strict";
import { processingFailureState, retryableOperation } from "../src/negotiation-retry-state.js";

test("a failed post-answer inference preserves the negotiation and retries only inference", () => {
  const context = {
    idea: "子どものお小遣いを管理するアプリを作りたい",
    facts: [
      { key: "idea", value: "子どものお小遣いを管理するアプリを作りたい", source: "initial_input" },
      { key: "actor_model", value: "保護者が管理する", source: "user_confirmed" },
      { key: "balance_integrity", value: "残高は取引から算出する", source: "ai_inferred" },
    ],
    answers: { actor_model: "保護者が管理する" },
    answeredQuestionKeys: ["actor_model"],
    answeredDecisionDomains: ["actor_model"],
    criticalDecisionCoverageAudit: { complete: false, discoveredDecisionDomains: ["allowance_entry_flow"] },
  };
  const current = { phase: "thinking", context, question: { id: "actor_model" }, busy: true, error: "", displayProgress: 50 };
  const operation = retryableOperation("inference", context, { detailMode: false });
  const failed = processingFailureState(current, new Error("OpenAI APIがタイムアウトしました。"), operation);

  assert.equal(failed.phase, "thinking");
  assert.equal(failed.context, context);
  assert.equal(failed.question, null);
  assert.equal(failed.displayProgress, 50);
  assert.equal(failed.failedOperation.type, "inference");
  assert.equal(failed.failedOperation.context.answers.actor_model, "保護者が管理する");
  assert.deepEqual(failed.context.answeredQuestionKeys, ["actor_model"]);
  assert.equal(failed.context.criticalDecisionCoverageAudit.complete, false);
});

test("coverage audit failure retains its exact resume phase", () => {
  const context = { idea: "test", facts: [], answeredQuestionKeys: ["q1", "q2"], criticalDecisionCoverageAudit: null };
  const failed = processingFailureState(
    { phase: "thinking", context, question: null, busy: true, error: "", displayProgress: 80 },
    new Error("一時的な通信エラー"),
    retryableOperation("coverage_audit", context, { detailMode: true }),
  );
  assert.deepEqual(failed.failedOperation, { type: "coverage_audit", context, detailMode: true });
  assert.deepEqual(failed.context.answeredQuestionKeys, ["q1", "q2"]);
  assert.equal(failed.phase, "thinking");
});
