import test from "node:test";
import assert from "node:assert/strict";
import * as contracts from "../src/requirements-v5/contracts.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const registry = () => ({
  versionSet: { ...contracts.REGISTRY_VERSION_SET },
  allowedEvidenceRelations: ["explicitly_states"],
  rules: [{ id: "rule:satisfy" }],
  slotTemplates: contracts.UNIVERSAL_SLOT_TEMPLATES.map((slotTemplateId) => ({ slotTemplateId, satisfactionRuleId: "rule:satisfy" })),
  coreUserValuePatterns: [{ id: "pattern:interactive", universalSlotTemplateIds: [...contracts.UNIVERSAL_SLOT_TEMPLATES], patternSlotTemplateIds: [] }],
  claimTypes: [{ id: "claim:requirement" }],
  auditExecutors: [{ id: "audit:fixture", version: "1" }],
});

/** This is deliberately a test-only contract fixture, not a semantic producer. */
const completeFixture = () => {
  const state = {
    registry: registry(), revisions: [], targets: [], evidenceEdges: [], actors: [], managedObjects: [], traits: [], capabilities: [], decisionRevisions: [], coreInvariants: [], primaryFlows: [], claims: [], issues: [], artifacts: [], graphFixpoint: { reached: true },
  };
  state.revisions.push({ id: "rev:cuv", instanceId: "cuv", text: "利用者が予定を管理できる", scopeKey: "core", currentness: "current" });
  state.targets.push({ id: "target:cuv", scopeKey: "core", classification: "core_user_value", currentness: "current" });
  state.evidenceEdges.push({ id: "edge:cuv", sourceRevisionId: "rev:cuv", targetId: "target:cuv", evidenceSpan: "利用者が予定を管理できる", relation: "explicitly_states", scopeKey: "core", classification: "core_user_value", derivationDepth: 0, currentness: "current" });
  state.coreUserValue = { revisionId: "rev:cuv", targetId: "target:cuv", evidenceId: "edge:cuv", value: "利用者が予定を管理できる", patternId: "pattern:interactive", scopeKey: "core" };
  for (const slotTemplateId of contracts.UNIVERSAL_SLOT_TEMPLATES) {
    const targetId = `target:${slotTemplateId}`; const revisionId = `rev:${slotTemplateId}`; const evidenceId = `edge:${slotTemplateId}`; const capabilityId = `cap:${slotTemplateId}`; const decisionId = `dec:${slotTemplateId}`;
    state.targets.push({ id: targetId, scopeKey: "global", classification: "product_requirement", currentness: "current" });
    state.revisions.push({ id: revisionId, instanceId: decisionId, text: `明示回答:${slotTemplateId}`, scopeKey: "global", currentness: "current" });
    state.evidenceEdges.push({ id: evidenceId, sourceRevisionId: revisionId, targetId, evidenceSpan: `明示回答:${slotTemplateId}`, relation: "explicitly_states", scopeKey: "global", classification: "product_requirement", derivationDepth: 0, currentness: "current" });
    state.capabilities.push({ id: capabilityId, key: slotTemplateId, targetId, evidenceId, scopeKey: "global", blocking: true, currentness: "current" });
    state.decisionRevisions.push({ id: decisionId, instanceId: decisionId, targetId, evidenceId, value: `${slotTemplateId}:value`, scopeKey: "global", status: "settled", blocking: true, currentness: "current" });
  }
  state.coreInvariants.push({ id: "invariant:1", targetId: "target:cuv", evidenceId: "edge:cuv", scopeKey: "core", currentness: "current" });
  state.primaryFlows.push({ id: "flow:1", targetId: "target:cuv", evidenceId: "edge:cuv", scopeKey: "core", currentness: "current" });
  const sourceClaims = [
    ...state.capabilities.map((item) => ({ source: item, kind: "capability" })),
    ...state.decisionRevisions.map((item) => ({ source: item, kind: "decision" })),
    ...state.coreInvariants.map((item) => ({ source: item, kind: "core_invariant" })),
    ...state.primaryFlows.map((item) => ({ source: item, kind: "primary_flow" })),
  ];
  for (const { source } of sourceClaims) state.claims.push({ id: `claim:${source.id}`, sourceId: source.id, typeId: "claim:requirement", targetId: source.targetId, evidenceId: source.evidenceId, scopeKey: source.scopeKey, currentness: "current" });
  const capabilityCoverageProof = { requirementFingerprint: contracts.requirementFingerprint(state), slotEvaluations: contracts.UNIVERSAL_SLOT_TEMPLATES.map((slotTemplateId) => ({ slotTemplateId, status: "satisfied", evidenceId: `edge:${slotTemplateId}`, targetId: `target:${slotTemplateId}`, scopeKey: "global" })) };
  const provisionalProof = { proofId: "provisional:fixture", requirementFingerprint: contracts.requirementFingerprint(state), capabilityCoverageProof };
  const claimCoverageProof = { claimSetFingerprint: contracts.claimSetFingerprint(state) };
  const auditProof = { auditId: "audit:fixture", executorId: "audit:fixture", executorVersion: "1", executionId: "run:fixture", completed: true, outcome: "passed", requirementFingerprint: contracts.requirementFingerprint(state), provisionalProofId: provisionalProof.proofId, blockingGapIds: [] };
  const spec = { elements: sourceClaims.map(({ source }, index) => ({ id: `spec:${index}`, kind: "functional_requirement", sourceClaimIds: [`claim:${source.id}`] })) };
  const finalProof = { auditId: auditProof.auditId, provisionalProofId: provisionalProof.proofId, completionCandidateFingerprint: contracts.completionCandidateFingerprint(state, auditProof.auditId) };
  return { state, capabilityCoverageProof, provisionalProof, claimCoverageProof, auditProof, spec, finalProof };
};

test("raw events are retained but can never produce production semantic facts or Completion in PR0", () => {
  const authority = contracts.createArchitectureAuthority();
  const inputs = ["xx", "aa", "0", "false", "single_actor", "local", "silent", ""];
  for (const [index, text] of inputs.entries()) assert.equal(contracts.submitRawUserAnswer({ authority, event: { eventId: `raw-${index}`, text, questionId: "forged", authority: "user", status: "satisfied", relation: "explicitly_states" } }).status, "blocked_missing_authority");
  assert.equal(contracts.listPendingQuestions({ authority }).length, 0);
  assert.equal(contracts.finalCompletionProof({ authority, auditId: "forged" }).eligible, false);
  assert.equal(contracts.finalCompletionProof({ authority, auditId: "forged" }).status, "blocked_missing_authority");
});

test("raw-event replay detects mutation but raw provenance is not semantic authority", () => {
  const authority = contracts.createArchitectureAuthority();
  assert.equal(contracts.submitRawInitialInput({ authority, event: { eventId: "same", text: "x" } }).replay, false);
  assert.equal(contracts.submitRawInitialInput({ authority, event: { eventId: "same", text: "x" } }).replay, true);
  assert.throws(() => contracts.submitRawInitialInput({ authority, event: { eventId: "same", text: "changed" } }), /replay was modified/);
});

test("synthetic complete proof fixture is eligible only through every verifier gate", () => {
  const fixture = completeFixture();
  assert.equal(contracts.validateRegistryContext(fixture.state.registry).eligible, true);
  assert.equal(contracts.validateEvidenceEdges({ registry: fixture.state.registry, revisions: fixture.state.revisions, targets: fixture.state.targets, evidenceEdges: fixture.state.evidenceEdges }).eligible, true);
  assert.equal(contracts.validateCapabilityCoverageProof({ state: fixture.state, proof: fixture.capabilityCoverageProof }).eligible, true);
  assert.equal(contracts.validateClaimCoverageProof({ state: fixture.state, proof: fixture.claimCoverageProof }).eligible, true);
  assert.equal(contracts.validateFinalCompletionProof(fixture).eligible, true);
});

test("registry and coverage verifier fail closed for absent universes, patterns, rules, or executors", () => {
  const fixture = completeFixture();
  for (const mutate of [
    (value) => { delete value.state.registry; },
    (value) => { value.state.registry.slotTemplates = []; },
    (value) => { value.state.registry.rules = []; },
    (value) => { value.state.registry.auditExecutors = []; },
    (value) => { value.state.registry.coreUserValuePatterns = []; },
  ]) { const value = clone(fixture); mutate(value); assert.equal(contracts.validateFinalCompletionProof(value).eligible, false); }
});

test("evidence verifier rejects stale sources, invalid relations, missing parents, classification, scope, and span mismatches", () => {
  const fixture = completeFixture();
  const cases = [
    (value) => { value.state.evidenceEdges[0].relation = "invented"; },
    (value) => { value.state.evidenceEdges[0].evidenceSpan = "partial"; },
    (value) => { value.state.evidenceEdges[0].scopeKey = "wrong"; },
    (value) => { value.state.evidenceEdges[0].classification = "wrong"; },
    (value) => { value.state.evidenceEdges[0].derivationDepth = 1; },
    (value) => { value.state.revisions[0].currentness = "stale"; },
  ];
  for (const mutate of cases) { const value = clone(fixture); mutate(value); assert.equal(contracts.validateFinalCompletionProof(value).eligible, false); }
});

test("proof chain fails closed for missing claims, unresolved decisions, conflicts, feasibility, non-fixpoint, stale artifacts, audit, and stale fingerprints", () => {
  const fixture = completeFixture();
  const cases = [
    (value) => { value.state.claims.pop(); },
    (value) => { value.state.decisionRevisions[0].status = "proposed"; },
    (value) => { value.state.issues.push({ id: "conflict", kind: "conflict", blocking: true, currentness: "current" }); },
    (value) => { value.state.issues.push({ id: "feasibility", kind: "feasibility", blocking: true, currentness: "current" }); },
    (value) => { value.state.graphFixpoint.reached = false; },
    (value) => { value.state.artifacts.push({ id: "stale", blocking: true, currentness: "stale" }); },
    (value) => { value.auditProof.completed = false; },
    (value) => { value.auditProof.requirementFingerprint = "old"; },
    (value) => { value.provisionalProof.requirementFingerprint = "old"; },
  ];
  for (const mutate of cases) { const value = clone(fixture); mutate(value); assert.equal(contracts.validateFinalCompletionProof(value).eligible, false); }
});

test("required SPEC elements must carry known Claim IDs", () => {
  const fixture = completeFixture();
  fixture.spec.elements[0].sourceClaimIds = [];
  assert.equal(contracts.validateFinalCompletionProof(fixture).eligible, false);
  const unknown = completeFixture(); unknown.spec.elements[0].sourceClaimIds = ["claim:forged"];
  assert.equal(contracts.validateFinalCompletionProof(unknown).eligible, false);
});

test("canonical identity distinguishes null from empty, ignores display metadata, and fingerprints semantic changes only", () => {
  assert.notDeepEqual(contracts.canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: null, actorIds: [] }), contracts.canonicalCapabilityKey({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [] }));
  assert.equal(contracts.capabilityInstanceId({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [], displayLabel: "A" }), contracts.capabilityInstanceId({ capabilityTypeId: "x", managedObjectIds: [], actorIds: [], displayLabel: "B" }));
  const fixture = completeFixture(); const initial = contracts.requirementFingerprint(fixture.state); fixture.state.timestamp = Date.now(); assert.equal(contracts.requirementFingerprint(fixture.state), initial); fixture.state.decisionRevisions[0].value = "changed"; assert.notEqual(contracts.requirementFingerprint(fixture.state), initial);
});

test("revision/DAG transaction kernel rejects multiple heads and cycles, rolls back failures, and detects optimistic concurrency", () => {
  const kernel = contracts.createTransactionKernel(); const transaction = contracts.beginTransaction(kernel);
  contracts.proposeRevision(transaction, { id: "r1", instanceId: "d1", currentness: "current" }); contracts.proposeRevision(transaction, { id: "r2", instanceId: "d1", currentness: "current" });
  const rejected = contracts.commitTransaction(transaction); assert.equal(rejected.committed, false); assert.equal(contracts.transactionSnapshot(kernel).revisions.length, 0);
  const cycleKernel = contracts.createTransactionKernel(); const cycle = contracts.beginTransaction(cycleKernel); contracts.proposeRevision(cycle, { id: "r1", instanceId: "d1", currentness: "current" }); contracts.proposeDependency(cycle, { fromId: "r1", toId: "r2" }); contracts.proposeDependency(cycle, { fromId: "r2", toId: "r1" }); assert.equal(contracts.commitTransaction(cycle).committed, false);
  const concurrent = contracts.createTransactionKernel(); const first = contracts.beginTransaction(concurrent); const second = contracts.beginTransaction(concurrent); contracts.proposeRevision(first, { id: "r1", instanceId: "d1", currentness: "current" }); assert.equal(contracts.commitTransaction(first).committed, true); contracts.proposeRevision(second, { id: "r2", instanceId: "d2", currentness: "current" }); assert.equal(contracts.commitTransaction(second).committed, false);
});

test("migration verifier enforces identity, version, idempotency, and current projection", () => {
  const registryContext = registry(); const record = { sourceContextVersion: "v4", targetContextVersion: "v5", sourceFactFingerprint: "source", registryVersionSet: { ...contracts.REGISTRY_VERSION_SET }, migrationStatus: "verified", migrationWarnings: [] }; record.migrationId = contracts.migrationRecordId(record);
  assert.equal(contracts.validateMigrationRecord({ record, registry: registryContext, currentProjection: { migrationId: record.migrationId } }).eligible, true);
  assert.equal(contracts.validateMigrationRecord({ record, registry: registryContext, existingRecords: [{ ...record, migrationId: "other" }] }).eligible, false);
  assert.equal(contracts.validateMigrationRecord({ record: { ...record, migrationId: "forged" }, registry: registryContext }).eligible, false);
});
