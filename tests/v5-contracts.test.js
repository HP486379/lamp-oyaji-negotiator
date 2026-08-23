import test from "node:test";
import assert from "node:assert/strict";
import {
  UNIVERSAL_SLOT_TEMPLATES, REGISTRY_VERSION_SET, appendDecisionRevision, appendTraitAssertion,
  auditTerminalState, capabilityCoverageProof, capabilityInstanceId, canonicalDecisionKey,
  claimCoverageProof, claimSetFingerprint, classifyRequirement, completionCandidateFingerprint,
  createDecisionLedger, createTraitLedger, decisionInstanceId, decisionProjection, genericEnvelope,
  generateCapabilitySlots, migrateV4Context, propagateStaleTransaction, requirementFingerprint,
  resolveCriticality, resolveDelegation, slotRegistryCoverageProof, validateArtifactDag, validateEvidenceEdge,
} from "../src/requirements-v5/contracts.js";

const revision = (id, instance, supersedesRevisionId = null) => ({ revisionId: id, decisionInstanceId: instance, value: "value", authority: "user", confirmation: "explicitly_confirmed", currentness: "current", evidenceEdgeIds: [], dependsOnRevisionIds: [], supersedesRevisionId, createdByTransactionId: "tx" });

test("v5 canonical identity is order-independent and excludes labels", () => {
  const capabilityA = capabilityInstanceId({ capabilityTypeId: "cap.interaction", parentCapabilityInstanceId: null, managedObjectIds: ["m2", "m1"], actorIds: ["a2", "a1"], phaseKindId: "phase.main", label: "A" });
  const capabilityB = capabilityInstanceId({ capabilityTypeId: "cap.interaction", parentCapabilityInstanceId: null, managedObjectIds: ["m1", "m2"], actorIds: ["a1", "a2"], phaseKindId: "phase.main", label: "B" });
  assert.equal(capabilityA, capabilityB);
  assert.notEqual(capabilityA, capabilityInstanceId({ capabilityTypeId: "cap.interaction", parentCapabilityInstanceId: null, managedObjectIds: ["m1", "m2"], actorIds: ["a1", "a2"], phaseKindId: "phase.other" }));
  const definition = { globalScopeAllowed: true }; const a = decisionInstanceId({ decisionTypeId: "decision.mode", capabilityInstanceId: null, managedObjectIds: ["m2", "m1"], actorIds: ["a2", "a1"], phaseKindId: null, classification: "product_requirement" }, definition);
  const b = decisionInstanceId({ decisionTypeId: "decision.mode", capabilityInstanceId: null, managedObjectIds: ["m1", "m2"], actorIds: ["a1", "a2"], phaseKindId: null, classification: "implementation_proposal" }, definition); assert.equal(a, b);
  assert.throws(() => canonicalDecisionKey({ decisionTypeId: "x", capabilityInstanceId: null, managedObjectIds: [], actorIds: [], phaseKindId: null }, { globalScopeAllowed: false }));
});

test("v5 revision ledgers keep exactly one current head and reject stale settlement or cycles", () => {
  const ledger = createDecisionLedger(); appendDecisionRevision(ledger, revision("r1", "d1")); appendDecisionRevision(ledger, revision("r2", "d1", "r1"), { expectedCurrentRevisionId: "r1" });
  assert.equal(ledger.revisions.get("r1").currentness, "superseded"); assert.equal(decisionProjection(ledger, "d1"), "settled"); ledger.revisions.set("r2", { ...ledger.revisions.get("r2"), currentness: "stale" }); assert.equal(decisionProjection(ledger, "d1"), "stale");
  assert.throws(() => appendDecisionRevision(ledger, revision("r2", "d1", "r2"), { expectedCurrentRevisionId: "r2" }));
  const traits = createTraitLedger(); appendTraitAssertion(traits, { revisionId: "t1", traitId: "trait.a", scopeKey: "s", status: "supported", relevance: "supporting", evidenceEdgeIds: [], currentness: "current", supersedesAssertionId: null }); appendTraitAssertion(traits, { revisionId: "t2", traitId: "trait.a", scopeKey: "s", status: "supported", relevance: "supporting", evidenceEdgeIds: [], currentness: "current", supersedesAssertionId: "t1" }); assert.equal(traits.heads.get("trait.a:s"), "t2");
});

test("slots are fail-closed independently of AI candidates and patterns", () => {
  const slots = generateCapabilitySlots({ aiCandidates: [] }); assert.equal(slots.length, UNIVERSAL_SLOT_TEMPLATES.length); assert.ok(slots.every((slot) => slot.status === "unknown"));
  const incompleteRegistry = slotRegistryCoverageProof({ registeredUniversalSlotTemplateIds: UNIVERSAL_SLOT_TEMPLATES.slice(1), coreUserValuePatternIds: ["p"], coveredPatternIds: ["p"] }); assert.equal(incompleteRegistry.complete, false);
  const registry = slotRegistryCoverageProof({ registeredUniversalSlotTemplateIds: UNIVERSAL_SLOT_TEMPLATES, coreUserValuePatternIds: ["p"], coveredPatternIds: [] }); assert.equal(registry.complete, false);
  const proof = capabilityCoverageProof({ requirementFingerprint: "fp", registryCoverage: { ...registry, complete: true }, patternState: "ambiguous", slots, provisionalCapabilities: [] }); assert.equal(proof.complete, false);
  const conditional = capabilityCoverageProof({ requirementFingerprint: "fp", registryCoverage: { complete: true }, patternState: "mapped", slots: [{ ...slots[0], conditional: true, status: "not_applicable" }], provisionalCapabilities: [] }); assert.equal(conditional.complete, false);
});

test("evidence accepts only current exact and registered entailment", () => {
  const sourceRevision = { currentness: "current" }; const edge = { relation: "directly_entails", evidenceSpan: "選択肢A", derivationDepth: 1, entailmentRuleId: "e1" };
  assert.equal(validateEvidenceEdge(edge, { sourceRevision, sourceText: "選択肢A", registeredEntailmentRuleIds: ["e1"] }).accepted, true);
  assert.equal(validateEvidenceEdge({ ...edge, entailmentRuleId: "free" }, { sourceRevision, sourceText: "選択肢A" }).reviewRequired, true);
  assert.equal(validateEvidenceEdge(edge, { sourceRevision, sourceText: "別の文", registeredEntailmentRuleIds: ["e1"] }).accepted, false);
  assert.equal(validateEvidenceEdge(edge, { sourceRevision: { currentness: "stale" }, sourceText: "選択肢A", registeredEntailmentRuleIds: ["e1"] }).accepted, false);
});

test("generic envelopes, classification, criticality, and delegation retain deterministic authority", () => {
  assert.equal(genericEnvelope({ behaviorFamily: "input_consuming", baselineEvaluated: false, blockingDecisionMapped: true, unresolvedGapBlocking: false }).completionContribution, false);
  assert.equal(genericEnvelope({ behaviorFamily: null, baselineEvaluated: true, blockingDecisionMapped: true, unresolvedGapBlocking: false }).mayPromoteToCapability, false);
  assert.equal(classifyRequirement({ impacts: {}, aiCandidate: "product" }).classification, "implementation_proposal"); assert.equal(classifyRequirement({ impacts: { primaryFlow: true } }).classification, "product_requirement");
  assert.equal(resolveCriticality({ decisionInstanceId: "d", effects: { primaryFlow: true }, requirementFingerprint: "fp" }).blocking, false); assert.equal(resolveCriticality({ decisionInstanceId: "d", registeredRuleId: "critical.flow", effects: { primaryFlow: true }, requirementFingerprint: "fp" }).blocking, true);
  assert.equal(resolveDelegation({ candidates: [], valueSchemaValid: true, inScope: true, coreInvariantSafe: true, noBlockingConflict: true, introducesCapability: false, expandsExternalConsequence: false, expandsDataBoundary: false }).settled, false);
  assert.equal(resolveDelegation({ candidates: ["a", "b"], valueSchemaValid: true, inScope: true, coreInvariantSafe: true, noBlockingConflict: true, introducesCapability: false, expandsExternalConsequence: false, expandsDataBoundary: false }).settled, false);
  assert.equal(resolveDelegation({ candidates: ["a"], valueSchemaValid: true, inScope: true, coreInvariantSafe: true, noBlockingConflict: true, introducesCapability: false, expandsExternalConsequence: false, expandsDataBoundary: true }).settled, false);
});

test("phase-separated fingerprints and dependency DAG remain fail-closed", () => {
  const base = { coreUserValue: "v", actors: ["a"], managedObjects: ["m"], activeCapabilities: ["c"], traitHeads: ["t"], decisionRevisions: [{ id: "r1", value: "x" }], openBlockingIssues: [], registryVersions: REGISTRY_VERSION_SET }; const fp = requirementFingerprint(base); const claimFp = claimSetFingerprint({ requirementFingerprint: fp, claims: [], claimTypeRegistryVersion: "v1" });
  assert.equal(requirementFingerprint({ ...base, generatedSpec: "ignored", audit: "ignored" }), fp); assert.notEqual(claimSetFingerprint({ requirementFingerprint: fp, claims: ["claim1"], claimTypeRegistryVersion: "v1" }), claimFp); assert.notEqual(requirementFingerprint({ ...base, decisionRevisions: [{ id: "r2", value: "y" }] }), fp); assert.ok(completionCandidateFingerprint({ requirementFingerprint: fp, claimSetFingerprint: claimFp, finalCoverageAuditId: "a" }));
  const edges = [{ fromArtifactKind: "revision", fromArtifactId: "r1", toArtifactKind: "claim", toArtifactId: "c1", dependencyKind: "grounding" }, { fromArtifactKind: "claim", fromArtifactId: "c1", toArtifactKind: "proof", toArtifactId: "p1", dependencyKind: "coverage" }]; assert.equal(validateArtifactDag(edges), true); assert.deepEqual(propagateStaleTransaction({ edges, changedArtifactId: "revision:r1" }), ["claim:c1", "proof:p1", "revision:r1"]); assert.throws(() => validateArtifactDag([...edges, { fromArtifactKind: "proof", fromArtifactId: "p1", toArtifactKind: "revision", toArtifactId: "r1", dependencyKind: "semantic" }])); assert.throws(() => propagateStaleTransaction({ edges, changedArtifactId: "revision:r1", fail: true }));
});

test("claim coverage, audit terminal state, and migration are fail-closed and idempotent", () => {
  const proof = claimCoverageProof({ claimSetFingerprint: "c", sources: [{ kind: "capability", id: "cap", currentness: "current" }, { kind: "primary_flow", id: "flow", currentness: "current" }], claims: [{ claimId: "claim-cap", sourceIds: ["cap"], currentness: "current" }] }); assert.equal(proof.complete, false); assert.deepEqual(proof.uncoveredBlockingSourceIds, ["flow"]);
  assert.equal(claimCoverageProof({ claimSetFingerprint: "c", sources: [{ kind: "decision", id: "d", currentness: "current" }], claims: [{ claimId: "stale", sourceIds: ["d"], currentness: "stale" }] }).complete, false);
  assert.equal(auditTerminalState({ attempts: 2, maxAttempts: 2, errorKind: "timeout" }).state, "inconclusive_limit_reached"); assert.notEqual(auditTerminalState({ attempts: 1, maxAttempts: 2, errorKind: "malformed" }).state, "passed");
  const source = { version: "v4", facts: [{ key: "u", source: "user_confirmed", revisionId: "user-r" }], generatedSpec: "legacy" }; const first = migrateV4Context({ source, registryVersionSet: REGISTRY_VERSION_SET }); const second = migrateV4Context({ source, registryVersionSet: REGISTRY_VERSION_SET, migrations: [first.record] }); assert.equal(second.created, false); assert.deepEqual(second.projection.userConfirmedRevisionIds, ["user-r"]); assert.notEqual(migrateV4Context({ source, registryVersionSet: { ...REGISTRY_VERSION_SET, trait: "next" } }).record.migrationId, first.record.migrationId);
});
