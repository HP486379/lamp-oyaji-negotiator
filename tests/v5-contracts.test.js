import test from "node:test";
import assert from "node:assert/strict";
import { UNIVERSAL_SLOT_TEMPLATES, capabilityCoverageProof, canonicalCapabilityKey, createArchitectureAuthority, executeAuthorityCommand, finalCompletionProof, migrateV4Context, provisionalCompletionProof, requirementFingerprint, trustedAdapters } from "../src/requirements-v5/contracts.js";

const run = (authority, envelope) => executeAuthorityCommand(authority, envelope);
const R = trustedAdapters.ruleEngine;

function groundedAuthority() {
  const a = createArchitectureAuthority();
  run(a, trustedAdapters.initialInput({ revisionId: "cuv", value: "利用者が目的を達成できる" }));
  run(a, R.mapCoreUserValue({ patternIds: ["pr0_interactive_value"] }));
  run(a, trustedAdapters.userAnswer({ revisionId: "answer", decisionInstanceId: "dec:answer", value: "A", evidenceText: "A", scopeKey: "s" }));
  run(a, R.target({ id: "target", kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum" }));
  run(a, R.evidence({ edgeId: "edge", sourceRevisionId: "answer", targetId: "target", relation: "explicitly_states", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 0 }));
  return a;
}

function completeAuthority() {
  const a = groundedAuthority();
  for (const slotTemplateId of [...UNIVERSAL_SLOT_TEMPLATES, "pattern_primary_capability"]) {
    const targetId = `slot-target:${slotTemplateId}`;
    const edgeId = `slot-edge:${slotTemplateId}`;
    run(a, R.target({ id: targetId, kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum", slotTemplateId }));
    run(a, R.evidence({ edgeId, sourceRevisionId: "answer", targetId, relation: "explicitly_states", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 0 }));
    run(a, R.settleSlot({ slotTemplateId, evidenceEdgeId: edgeId }));
  }
  run(a, R.capability({ id: "cap", capabilityTypeId: "interaction", managedObjectIds: [], actorIds: [], scopeKey: "s", groundingTargetId: "target", blocking: true, provisional: false }));
  run(a, R.decision({ id: "decision", revisionId: "answer", groundingTargetId: "target" }));
  run(a, R.source({ id: "invariant", kind: "core_invariant", scopeKey: "s", groundingTargetId: "target", evidenceEdgeIds: ["edge"] }));
  run(a, R.source({ id: "flow", kind: "primary_flow", scopeKey: "s", groundingTargetId: "target", evidenceEdgeIds: ["edge"] }));
  for (const sourceId of ["cap", "decision", "invariant", "flow"]) run(a, R.claim({ claimId: `claim:${sourceId}`, claimTypeId: "required_product", sourceId, scopeKey: "s", evidenceEdgeId: "edge" }));
  run(a, R.graphFixpoint());
  const fp = requirementFingerprint({ authority: a });
  run(a, trustedAdapters.auditExecutor.completed({ auditId: "audit", executorId: "coverage-audit-v1", auditRuleId: "final-coverage-v1", executionId: "exec-1", executorVersion: "1", requirementFingerprint: fp, gapEvaluation: { complete: true, errorKinds: [], rejectedGapFingerprints: [] } }));
  return a;
}

test("Command Trust Boundary rejects plain commands and user-authority forgery", () => {
  const a = createArchitectureAuthority();
  assert.throws(() => run(a, { type: "add_revision", authority: "user" }), /untrusted/);
  assert.throws(() => run(a, R.mapCoreUserValue({ patternIds: ["pr0_interactive_value"] })), /invalid core user value mapping/);
  run(a, trustedAdapters.initialInput({ revisionId: "i", value: "x" }));
  assert.throws(() => run(a, trustedAdapters.userAnswer({ revisionId: "u", value: "x", evidenceText: "", scopeKey: "s" })), /invalid user source/);
});

test("Core User Value is a grounded completion root and caller cannot settle slots", () => {
  const a = createArchitectureAuthority();
  assert.equal(capabilityCoverageProof({ authority: a }).complete, false);
  assert.throws(() => run(a, { type: "settle_slot", status: "satisfied" }), /untrusted/);
  const b = groundedAuthority();
  assert.equal(capabilityCoverageProof({ authority: b }).complete, false);
  assert.throws(() => run(b, R.settleSlot({ slotTemplateId: "required_input", evidenceEdgeId: "edge" })), /does not match/);
  for (const slotTemplateId of [...UNIVERSAL_SLOT_TEMPLATES, "pattern_primary_capability"]) {
    const targetId = `slot-target:${slotTemplateId}`;
    const edgeId = `slot-edge:${slotTemplateId}`;
    run(b, R.target({ id: targetId, kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum", slotTemplateId }));
    run(b, R.evidence({ edgeId, sourceRevisionId: "answer", targetId, relation: "explicitly_states", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 0 }));
    run(b, R.settleSlot({ slotTemplateId, evidenceEdgeId: edgeId }));
  }
  assert.equal(capabilityCoverageProof({ authority: b }).complete, true);
});

test("one unrelated evidence edge cannot ground a claim", () => {
  const a = groundedAuthority();
  run(a, R.target({ id: "other", kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum" }));
  run(a, R.evidence({ edgeId: "other-edge", sourceRevisionId: "answer", targetId: "other", relation: "explicitly_states", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 0 }));
  run(a, R.capability({ id: "cap", capabilityTypeId: "x", managedObjectIds: [], actorIds: [], scopeKey: "s", groundingTargetId: "target", blocking: true, provisional: false }));
  assert.throws(() => run(a, R.claim({ claimId: "bad", claimTypeId: "required_product", sourceId: "cap", scopeKey: "s", evidenceEdgeId: "other-edge" })), /does not ground/);
});

test("caller cannot register a passed audit outcome", () => {
  const a = completeAuthority();
  assert.throws(() => run(a, { type: "add_audit", outcome: "passed" }), /untrusted/);
  assert.throws(() => run(a, trustedAdapters.auditExecutor.completed({ auditId: "bad", executorId: "coverage-audit-v1", auditRuleId: "final-coverage-v1", executionId: "bad", executorVersion: "1", requirementFingerprint: requirementFingerprint({ authority: a }), gapEvaluation: { complete: false, errorKinds: ["gap"] } })), /invalid completed audit/);
});

test("decision revision state machine prevents duplicate current revisions", () => {
  const a = groundedAuthority();
  assert.throws(() => run(a, trustedAdapters.userAnswer({ revisionId: "second", decisionInstanceId: "dec:answer", value: "B", evidenceText: "B", scopeKey: "s" })), /current revision already exists/);
});

test("a stale decision dependency cannot be reused for Final Completion", () => {
  const a = completeAuthority();
  const specElements = [{ id: "fr", kind: "functional_requirement", sourceClaimIds: ["claim:cap"] }, { id: "ac", kind: "acceptance_criteria", sourceClaimIds: ["claim:decision"] }, { id: "flow", kind: "primary_flow_step", sourceClaimIds: ["claim:flow"] }, { id: "err", kind: "error_handling_rule", sourceClaimIds: ["claim:invariant"] }];
  run(a, trustedAdapters.userAnswer({ revisionId: "answer-2", decisionInstanceId: "dec:answer", supersedesRevisionId: "answer", value: "B", evidenceText: "B", scopeKey: "s" }));
  assert.equal(finalCompletionProof({ authority: a, auditId: "audit", specElements }).complete, false);
});

test("Final Completion cannot bypass Provisional proof or graph fixpoint", () => {
  const a = completeAuthority();
  const specElements = [{ id: "fr", kind: "functional_requirement", sourceClaimIds: ["claim:cap"] }, { id: "ac", kind: "acceptance_criteria", sourceClaimIds: ["claim:decision"] }, { id: "flow", kind: "primary_flow_step", sourceClaimIds: ["claim:flow"] }, { id: "err", kind: "error_handling_rule", sourceClaimIds: ["claim:invariant"] }];
  assert.equal(provisionalCompletionProof({ authority: a }).complete, true);
  assert.equal(finalCompletionProof({ authority: a, auditId: "audit", specElements }).complete, true);
  const b = groundedAuthority();
  assert.equal(finalCompletionProof({ authority: b, auditId: "missing", specElements }).complete, false);
  run(a, R.conflict({ id: "conflict-1", sourceIds: ["decision"] }));
  assert.equal(finalCompletionProof({ authority: a, auditId: "audit", specElements }).complete, false);
  assert.throws(() => run(a, { type: "mark_graph_fixpoint" }), /untrusted/);
});

test("migration accepts only trusted adapter output, not caller supplied legacy facts", () => {
  const a = createArchitectureAuthority();
  assert.throws(() => run(a, { type: "register_legacy_snapshot", facts: [{ source: "user_confirmed" }] }), /untrusted/);
  const id = "snapshot-1";
  run(a, trustedAdapters.migrationAdapter.v4Export({ snapshotId: id, adapterId: "v4-authoritative-export-v1", adapterVersion: "1", sourceContextVersion: "v4", sourceFingerprint: "source-hash", compatibleRegistryVersions: ["v5-pr0.3"], exportProof: "verified-export" }));
  assert.equal(migrateV4Context({ authority: a, snapshotId: id }).projection.sourceSnapshotId, id);
});

test("canonical identity preserves null versus empty arrays", () => {
  assert.notDeepEqual(canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: null, actorIds: [] }), canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [] }));
});
