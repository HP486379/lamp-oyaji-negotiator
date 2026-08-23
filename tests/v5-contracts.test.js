import test from "node:test";
import assert from "node:assert/strict";
import * as contracts from "../src/requirements-v5/contracts.js";

const begin = (authority, id = "initial", text = "利用者が目的を達成できるアプリ") => contracts.submitRawInitialInput({ authority, event: { eventId: id, text, authority: "user", classification: "product_requirement" } });
const answerAll = (authority) => {
  for (const [index, question] of contracts.listPendingQuestions({ authority }).entries()) contracts.submitRawUserAnswer({ authority, event: { eventId: `answer-${index}`, questionId: question.questionId, text: `利用者が${question.slotTemplateId}を選ぶ`, relation: "directly_entails", status: "satisfied" } });
};
const complete = () => {
  const authority = contracts.createArchitectureAuthority({ registries: { caller: "ignored" } });
  begin(authority); answerAll(authority); contracts.requestAuditExecution({ authority, auditId: "audit" });
  return authority;
};

test("public API exports raw-event requests, not adapters or authority commands", () => {
  assert.equal("trustedAdapters" in contracts, false);
  assert.equal("executeAuthorityCommand" in contracts, false);
  const authority = contracts.createArchitectureAuthority({ registries: { auditExecutor: "evil" } });
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(authority.registries, undefined);
  assert.throws(() => contracts.submitRawUserAnswer({ authority, event: { eventId: "x", questionId: "fake", text: "x", authority: "user" } }), /unknown issued question/);
});

test("raw event provenance is immutable and modified replays are rejected", () => {
  const authority = contracts.createArchitectureAuthority();
  begin(authority, "same", "original");
  assert.equal(begin(authority, "same", "original").replay, true);
  assert.throws(() => begin(authority, "same", "modified"), /replay was modified/);
});

test("caller supplied authority, classification, relation, and slot status are not semantic inputs", () => {
  const authority = contracts.createArchitectureAuthority(); begin(authority);
  const [question] = contracts.listPendingQuestions({ authority });
  contracts.submitRawUserAnswer({ authority, event: { eventId: "a", questionId: question.questionId, text: "回答", authority: "user", classification: "implementation_proposal", relation: "fake", accepted: true, status: "satisfied" } });
  assert.equal(contracts.capabilityCoverageProof({ authority }).complete, false);
  assert.throws(() => contracts.submitRawUserAnswer({ authority, event: { eventId: "b", questionId: "question:invented", text: "回答", status: "satisfied" } }), /unknown issued question/);
});

test("a slot is settled only by an answer to its internally issued question", () => {
  const authority = contracts.createArchitectureAuthority(); begin(authority);
  const questions = contracts.listPendingQuestions({ authority });
  contracts.submitRawUserAnswer({ authority, event: { eventId: "only-one", questionId: questions[0].questionId, text: "回答" } });
  const proof = contracts.capabilityCoverageProof({ authority });
  assert.ok(proof.unknownBlockingSlotIds.length > 0);
  assert.equal(proof.complete, false);
});

test("claim grounding is internally derived from source target and current evidence", () => {
  const authority = contracts.createArchitectureAuthority(); begin(authority); answerAll(authority);
  const proof = contracts.claimCoverageProof({ authority });
  assert.equal(proof.complete, true);
  assert.equal(proof.uncoveredBlockingSourceIds.length, 0);
});

test("caller cannot create passed audit results or Final Completion by supplying gate values", () => {
  const authority = contracts.createArchitectureAuthority(); begin(authority);
  const audit = contracts.requestAuditExecution({ authority, auditId: "audit", passed: true, outcome: "passed", gapEvaluation: { complete: true } });
  assert.equal(audit.passed, false);
  assert.equal(contracts.finalCompletionProof({ authority, auditId: "audit", provisional: { complete: true }, specElements: [{ sourceClaimIds: ["fake"] }] }).complete, false);
});

test("all semantic state is derived from raw events through current internal revisions", () => {
  const authority = complete();
  assert.equal(contracts.provisionalCompletionProof({ authority }).complete, true);
  assert.equal(contracts.finalCompletionProof({ authority, auditId: "audit" }).complete, true);
});

test("old audit cannot be reused after a semantic state change", () => {
  const authority = contracts.createArchitectureAuthority(); begin(authority);
  const questions = contracts.listPendingQuestions({ authority });
  contracts.submitRawUserAnswer({ authority, event: { eventId: "first", questionId: questions[0].questionId, text: "first" } });
  contracts.requestAuditExecution({ authority, auditId: "audit" });
  contracts.submitRawUserAnswer({ authority, event: { eventId: "second", questionId: questions[1].questionId, text: "second" } });
  assert.equal(contracts.auditTerminalState({ authority, auditId: "audit" }).state, "stale");
  assert.equal(contracts.finalCompletionProof({ authority, auditId: "audit" }).complete, false);
});

test("registry replacement and migration facts have no public authority path", () => {
  const authority = contracts.createArchitectureAuthority({ registries: { slotRegistry: { slots: [] } } }); begin(authority);
  assert.equal(contracts.listPendingQuestions({ authority }).length, contracts.UNIVERSAL_SLOT_TEMPLATES.length + 1);
  assert.deepEqual(contracts.requestMigration({ authority, request: { sourceId: "fake", facts: [{ authority: "user" }], exportProof: "forged", sourceFingerprint: "fake" } }), { accepted: false, reason: "no_internal_authenticated_legacy_source" });
  assert.equal(contracts.currentMigrationProjection({ authority, sourceFactFingerprint: "fake" }), null);
});

test("canonical identity preserves null versus empty arrays and excludes display metadata", () => {
  const a = contracts.canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: null, actorIds: [] });
  const b = contracts.canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [] });
  assert.notDeepEqual(a, b);
  assert.equal(contracts.capabilityInstanceId({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [], displayLabel: "A" }), contracts.capabilityInstanceId({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [], displayLabel: "B" }));
});
