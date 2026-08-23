import test from "node:test";
import assert from "node:assert/strict";
import {
  REGISTRY_VERSION_SET,
  UNIVERSAL_SLOT_TEMPLATES,
  capabilityInstanceId,
  canonicalCapabilityKey,
  claimCoverageProof,
  claimSetFingerprint,
  createArchitectureAuthority,
  currentMigrationProjection,
  decisionInstanceId,
  executeAuthorityCommand,
  finalCompletionProof,
  migrateV4Context,
  propagateStaleTransaction,
  requirementFingerprint,
  resolveCriticality,
  slotRegistryCoverageProof,
  validateEvidenceEdge,
  validateSpecClaimConformance,
} from "../src/requirements-v5/contracts.js";

const setupGroundedAuthority = () => {
  const a = createArchitectureAuthority({ registries: { fake: true } });
  executeAuthorityCommand(a, { type: "set_core_user_value", revisionId: "cuv1", value: "interactive value" });
  executeAuthorityCommand(a, { type: "map_core_user_value", status: "mapped", patternIds: ["pr0_interactive_value"] });
  executeAuthorityCommand(a, { type: "add_revision", revisionId: "parent", value: "root", authority: "user", confirmation: "explicitly_confirmed", classification: "product_requirement", kind: "answer", scopeKey: "s", evidenceText: "root", valueSchemaId: "enum" });
  executeAuthorityCommand(a, { type: "add_target", id: "parent-target", kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum" });
  executeAuthorityCommand(a, { type: "add_evidence", edgeId: "parent-e", sourceRevisionId: "parent", targetId: "parent-target", relation: "explicitly_states", targetScopeKey: "s", evidenceSpan: "root", derivationDepth: 0 });
  executeAuthorityCommand(a, { type: "add_revision", revisionId: "r1", value: "A", authority: "user", confirmation: "explicitly_confirmed", classification: "product_requirement", kind: "answer", scopeKey: "s", evidenceText: "A", valueSchemaId: "enum", criticalityRuleId: "core-impact", effects: { coreCapability: true }, settlement: "settled" });
  executeAuthorityCommand(a, { type: "add_target", id: "t1", kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum" });
  executeAuthorityCommand(a, { type: "add_evidence", edgeId: "e1", sourceRevisionId: "r1", targetId: "t1", relation: "directly_entails", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 1, parentEdgeId: "parent-e", entailmentRuleId: "pr0_enum_identity", transformId: "identity" });
  return a;
};

const settleAllSlots = (a) => {
  for (const slotTemplateId of [...UNIVERSAL_SLOT_TEMPLATES, "pattern_primary_capability"]) executeAuthorityCommand(a, { type: "settle_slot", slotTemplateId, status: "satisfied", evidenceEdgeId: "e1" });
};

const setupCompletable = () => {
  const a = setupGroundedAuthority();
  settleAllSlots(a);
  executeAuthorityCommand(a, { type: "add_capability", id: "cap1", capabilityTypeId: "generic", managedObjectIds: [], actorIds: [], scopeKey: "s", blocking: true, provisional: false });
  executeAuthorityCommand(a, { type: "add_decision", id: "d1", revisionId: "r1" });
  executeAuthorityCommand(a, { type: "add_core_invariant", id: "inv1", scopeKey: "s", evidenceEdgeIds: ["e1"] });
  executeAuthorityCommand(a, { type: "add_primary_flow", id: "flow1", scopeKey: "s", evidenceEdgeIds: ["e1"] });
  for (const sourceId of ["cap1", "d1", "inv1", "flow1"]) executeAuthorityCommand(a, { type: "add_claim", claimId: `claim-${sourceId}`, claimTypeId: "required_product", sourceId, scopeKey: "s", evidenceEdgeId: "e1" });
  const fp = requirementFingerprint({ authority: a });
  executeAuthorityCommand(a, { type: "add_audit", auditId: "audit1", executorId: "coverage-audit-v1", auditRuleId: "final-coverage-v1", requirementFingerprint: fp, executed: true, completed: true, outcome: "passed", attempts: 1, maxAttempts: 1 });
  return a;
};

test("authority is opaque and ignores caller-supplied registries/ledgers", () => {
  const a = createArchitectureAuthority({ registries: { criticalityRules: [{ ruleId: "evil" }] }, claims: [{ claimId: "evil" }], audits: [{ auditId: "evil", outcome: "passed" }] });
  assert.equal(Object.isFrozen(a), true);
  assert.equal(a.registries, undefined);
  assert.throws(() => executeAuthorityCommand(a, { type: "map_core_user_value", status: "mapped", patternIds: ["evil"] }));
});

test("canonical identity distinguishes null and empty arrays", () => {
  const a = canonicalCapabilityKey({ capabilityTypeId: "c", managedObjectIds: null, actorIds: [], parentCapabilityInstanceId: null, phaseKindId: null });
  const b = canonicalCapabilityKey({ capabilityTypeId: "c", managedObjectIds: [], actorIds: [], parentCapabilityInstanceId: null, phaseKindId: null });
  assert.notDeepEqual(a, b);
  assert.notEqual(capabilityInstanceId({ capabilityTypeId: "c", managedObjectIds: null, actorIds: [], parentCapabilityInstanceId: null, phaseKindId: null }), capabilityInstanceId({ capabilityTypeId: "c", managedObjectIds: [], actorIds: [], parentCapabilityInstanceId: null, phaseKindId: null }));
  assert.notEqual(decisionInstanceId({ decisionTypeId: "d", capabilityInstanceId: "c", managedObjectIds: null, actorIds: [], phaseKindId: null }, { globalScopeAllowed: true }), decisionInstanceId({ decisionTypeId: "d", capabilityInstanceId: "c", managedObjectIds: [], actorIds: [], phaseKindId: null }, { globalScopeAllowed: true }));
});

test("evidence is validated at registration and parent/transform/schema cannot be forged", () => {
  const a = createArchitectureAuthority();
  executeAuthorityCommand(a, { type: "add_revision", revisionId: "r", value: "A", authority: "user", confirmation: "explicitly_confirmed", classification: "product_requirement", kind: "answer", scopeKey: "s", evidenceText: "A", valueSchemaId: "enum" });
  executeAuthorityCommand(a, { type: "add_target", id: "t", kind: "requirement", classification: "product_requirement", scopeKey: "s", valueSchemaId: "enum" });
  assert.throws(() => executeAuthorityCommand(a, { type: "add_evidence", edgeId: "e", sourceRevisionId: "r", targetId: "t", relation: "directly_entails", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 1, entailmentRuleId: "pr0_enum_identity", transformId: "identity" }), /parent_required/);
  assert.throws(() => executeAuthorityCommand(a, { type: "add_evidence", edgeId: "e2", sourceRevisionId: "r", targetId: "t", relation: "fake", targetScopeKey: "s", evidenceSpan: "A", derivationDepth: 0 }), /unregistered_relation/);
});

test("slots cannot be forged satisfied and slot registry closes mother set", () => {
  const a = setupGroundedAuthority();
  assert.equal(slotRegistryCoverageProof({ authority: a }).complete, true);
  assert.throws(() => executeAuthorityCommand(a, { type: "settle_slot", slotTemplateId: "required_input", status: "satisfied" }), /requires evidence/);
  assert.throws(() => executeAuthorityCommand(a, { type: "settle_slot", slotTemplateId: "fake", status: "explicitly_not_required", ruleId: "explicit_not_required" }), /unknown slot/);
});

test("claim coverage is ledger-derived and missing blocking source fails closed", () => {
  const a = setupGroundedAuthority(); settleAllSlots(a);
  executeAuthorityCommand(a, { type: "add_capability", id: "cap1", capabilityTypeId: "generic", managedObjectIds: [], actorIds: [], scopeKey: "s", blocking: true, provisional: false });
  assert.equal(claimCoverageProof({ authority: a }).complete, false);
  executeAuthorityCommand(a, { type: "add_claim", claimId: "claim-cap1", claimTypeId: "required_product", sourceId: "cap1", scopeKey: "s", evidenceEdgeId: "e1" });
  assert.equal(claimCoverageProof({ authority: a }).complete, true);
  assert.throws(() => executeAuthorityCommand(a, { type: "add_claim", claimId: "evil", claimTypeId: "fake", sourceId: "cap1", scopeKey: "s", evidenceEdgeId: "e1" }));
});

test("criticality uses immutable builtin declarative rule", () => {
  const a = setupGroundedAuthority(); executeAuthorityCommand(a, { type: "add_decision", id: "d1", revisionId: "r1" });
  assert.equal(resolveCriticality({ authority: a, decisionInstanceId: "d1" }).blocking, true);
  assert.equal(resolveCriticality({ authority: a, decisionInstanceId: "missing" }).blocking, false);
});

test("fingerprint is semantic and omits caller metadata while retaining scope/value", () => {
  const a = setupGroundedAuthority(); const fp1 = requirementFingerprint({ authority: a });
  const fp2 = requirementFingerprint({ authority: a, timestamp: "evil" });
  assert.equal(fp1, fp2);
  executeAuthorityCommand(a, { type: "add_actor", id: "actor1", actorTypeId: "user", scopeKey: "scope-a" });
  assert.notEqual(requirementFingerprint({ authority: a }), fp1);
  assert.ok(claimSetFingerprint({ authority: a }));
});

test("audit cannot be forged and final completion is a single fail-closed proof", () => {
  const a = setupCompletable();
  const specElements = [
    { id: "fr", kind: "functional_requirement", sourceClaimIds: ["claim-cap1"] },
    { id: "ac", kind: "acceptance_criteria", sourceClaimIds: ["claim-d1"] },
    { id: "flow", kind: "primary_flow_step", sourceClaimIds: ["claim-flow1"] },
    { id: "err", kind: "error_handling_rule", sourceClaimIds: ["claim-inv1"] },
  ];
  const proof = finalCompletionProof({ authority: a, auditId: "audit1", specElements });
  assert.equal(proof.complete, true);
  assert.equal(validateSpecClaimConformance({ authority: a, specElements }).complete, true);
  assert.equal(finalCompletionProof({ authority: a, auditId: "missing", specElements }).complete, false);
  assert.equal(finalCompletionProof({ authority: a, auditId: "audit1", specElements: [{ id: "fr", kind: "functional_requirement", sourceClaimIds: [] }] }).complete, false);
  assert.throws(() => executeAuthorityCommand(a, { type: "add_audit", auditId: "evil", executorId: "fake", auditRuleId: "final-coverage-v1", requirementFingerprint: requirementFingerprint({ authority: a }), executed: true, completed: true, outcome: "passed" }));
});

test("migration requires registered authoritative adapter and keeps one current projection", () => {
  const a = createArchitectureAuthority();
  assert.throws(() => executeAuthorityCommand(a, { type: "register_legacy_snapshot", adapterId: "fake", sourceContextVersion: "v4", facts: [] }));
  const snapshotId = executeAuthorityCommand(a, { type: "register_legacy_snapshot", adapterId: "v4-authoritative-export-v1", sourceContextVersion: "v4", facts: [{ key: "u", source: "user_confirmed", revisionId: "u", value: "x" }] });
  const one = migrateV4Context({ authority: a, snapshotId });
  const two = migrateV4Context({ authority: a, snapshotId });
  assert.equal(two.created, false);
  assert.equal(currentMigrationProjection({ authority: a, sourceFactFingerprint: one.record.sourceFactFingerprint }).userConfirmedRevisions[0].revisionId, "u");
  assert.deepEqual(one.record.registryVersionSet, REGISTRY_VERSION_SET);
});

test("stale propagation is atomic", () => {
  const a = createArchitectureAuthority();
  executeAuthorityCommand(a, { type: "add_artifact", id: "r", kind: "revision" });
  executeAuthorityCommand(a, { type: "add_artifact", id: "c", kind: "claim" });
  executeAuthorityCommand(a, { type: "add_dependency", fromArtifactKind: "revision", fromArtifactId: "r", toArtifactKind: "claim", toArtifactId: "c", dependencyKind: "grounding" });
  assert.throws(() => propagateStaleTransaction({ authority: a, changedArtifactId: "revision:r", reevaluate: () => false }));
  assert.deepEqual(propagateStaleTransaction({ authority: a, changedArtifactId: "revision:r" }), ["claim:c", "revision:r"]);
});
