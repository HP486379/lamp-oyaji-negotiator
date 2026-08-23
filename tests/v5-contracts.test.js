import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SLOT_REGISTRY, UNIVERSAL_SLOT_TEMPLATES, REGISTRY_VERSION_SET, appendDecisionRevision, appendTraitAssertion,
  auditTerminalState, capabilityCoverageProof, capabilityInstanceId, canonicalDecisionKey,
  claimCoverageProof, claimSetFingerprint, classifyRequirement, completionCandidateFingerprint,
  createDecisionLedger, createTraitLedger, decisionInstanceId, decisionProjection, genericEnvelope,
  generateCapabilitySlots, migrateV4Context, propagateStaleTransaction, requirementFingerprint,
  resolveCriticality, resolveDelegation, slotRegistryCoverageProof, validateArtifactDag, validateEvidenceEdge,
} from "../src/requirements-v5/contracts.js";

const revision = (id, instance, supersedesRevisionId = null) => ({ revisionId: id, decisionInstanceId: instance, value: "value", authority: "user", confirmation: "explicitly_confirmed", currentness: "current", evidenceEdgeIds: [], dependsOnRevisionIds: [], supersedesRevisionId, createdByTransactionId: "tx" });
const slotRegistry = () => ({
  registryVersion: REGISTRY_VERSION_SET.slotTemplate,
  semanticRegistryVersion: REGISTRY_VERSION_SET.coreUserValuePattern,
  slotTemplates: [
    ...UNIVERSAL_SLOT_TEMPLATES.map((slotTemplateId) => ({ slotTemplateId, slotClass: "universal", registryVersion: REGISTRY_VERSION_SET.slotTemplate })),
    { slotTemplateId: "recipe_source", slotClass: "core_value_pattern", registryVersion: REGISTRY_VERSION_SET.slotTemplate },
  ],
  coreUserValuePatterns: [{ coreUserValuePatternId: "pattern.recipe", requiredSlotTemplateIds: ["recipe_source"], registryVersion: REGISTRY_VERSION_SET.coreUserValuePattern }],
});

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
  const slots = generateCapabilitySlots({ slotRegistry: DEFAULT_SLOT_REGISTRY, aiCandidates: [] }); assert.equal(slots.length, UNIVERSAL_SLOT_TEMPLATES.length); assert.ok(slots.every((slot) => slot.status === "unknown"));
  const completeRegistry = slotRegistryCoverageProof({ slotRegistry: slotRegistry(), coreUserValuePatternIds: ["pattern.recipe"] }); assert.equal(completeRegistry.complete, true);
  assert.equal(slotRegistryCoverageProof({ slotRegistry: slotRegistry(), coreUserValuePatternIds: ["unknown.pattern"] }).complete, false);
  assert.equal(slotRegistryCoverageProof({ slotRegistry: { ...slotRegistry(), slotTemplates: slotRegistry().slotTemplates.filter((template) => template.slotTemplateId !== "recipe_source") }, coreUserValuePatternIds: ["pattern.recipe"] }).complete, false);
  assert.equal(slotRegistryCoverageProof({ slotRegistry: slotRegistry(), coreUserValuePatternIds: ["pattern.recipe"], semanticRegistryVersion: "stale" }).complete, false);
  const proof = capabilityCoverageProof({ requirementFingerprint: "fp", slotRegistry: { ...slotRegistry(), slotTemplates: [] }, coreUserValuePatternIds: ["pattern.recipe"], registryCoverage: { complete: true }, patternState: "mapped", slots: [], provisionalCapabilities: [] }); assert.equal(proof.complete, false);
  const conditional = capabilityCoverageProof({ requirementFingerprint: "fp", slotRegistry: slotRegistry(), coreUserValuePatternIds: ["pattern.recipe"], patternState: "mapped", slots: [{ ...slots[0], conditional: true, status: "not_applicable" }], provisionalCapabilities: [] }); assert.equal(conditional.complete, false);
});

test("evidence validation rejects relation, scope, parent, and classification bypasses", () => {
  const sourceRevision = { currentness: "current" };
  const relationRegistry = [{ relation: "directly_entails", sourceKind: "answer", targetKind: "requirement", maxDerivationDepth: 1, requiresParentEdge: true, allowedSourceClassifications: ["product_requirement"], allowedTargetClassifications: ["product_requirement"] }];
  const edge = { relation: "directly_entails", sourceKind: "answer", targetKind: "requirement", evidenceSpan: "選択肢A", targetScopeKey: "cap:recipe", parentEdgeId: "edge:parent", derivationDepth: 1, entailmentRuleId: "e1" };
  const context = { sourceRevision, sourceText: "選択肢A", sourceKind: "answer", targetKind: "requirement", sourceClassification: "product_requirement", targetClassification: "product_requirement", expectedTargetScopeKey: "cap:recipe", relationRegistry, parentEdgeIds: ["edge:parent"], registeredEntailmentRules: [{ entailmentRuleId: "e1", sourceKind: "answer", targetKind: "requirement", maxDerivationDepth: 1 }] };
  assert.equal(validateEvidenceEdge(edge, context).accepted, true);
  assert.equal(validateEvidenceEdge({ ...edge, relation: "ai_says_so" }, context).accepted, false);
  assert.equal(validateEvidenceEdge({ ...edge, targetScopeKey: "cap:other" }, context).accepted, false);
  assert.equal(validateEvidenceEdge({ ...edge, parentEdgeId: "missing" }, context).accepted, false);
  assert.equal(validateEvidenceEdge({ ...edge, evidenceSpan: "選択肢" }, context).accepted, false);
  assert.equal(validateEvidenceEdge(edge, { ...context, targetClassification: "implementation_proposal" }).accepted, false);
  assert.equal(validateEvidenceEdge(edge, { ...context, excludedEvidenceConflict: true }).accepted, false);
  assert.equal(validateEvidenceEdge({ ...edge, entailmentRuleId: "free" }, context).accepted, false);
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

test("claim coverage and audit terminal state are fail-closed", () => {
  const claimTypeRegistry = [{ claimTypeId: "required_claim", required: true, sourceKinds: ["capability", "decision", "core_invariant", "primary_flow"] }];
  const sources = [
    { kind: "capability", id: "cap", scopeKey: "s", currentness: "current", blocking: true },
    { kind: "decision", id: "decision", scopeKey: "s", currentness: "current", classification: "product_requirement", settlement: "settled" },
    { kind: "core_invariant", id: "invariant", scopeKey: "s", currentness: "current" },
    { kind: "primary_flow", id: "flow", scopeKey: "s", currentness: "current" },
  ];
  const claims = sources.map((source) => ({ claimId: `claim-${source.id}`, claimTypeId: "required_claim", sourceIds: [source.id], scopeKey: "s", currentness: "current", evidenceEdgeIds: [`e-${source.id}`] }));
  const evidence = claims.flatMap((claim) => claim.evidenceEdgeIds);
  assert.equal(claimCoverageProof({ claimSetFingerprint: "c", sources, claims, claimTypeRegistry, currentEvidenceEdgeIds: evidence }).complete, true);
  const bypass = claimCoverageProof({ claimSetFingerprint: "c", sources: [{ ...sources[0], noClaimRuleId: "registered_non_required_rule" }], claims: [], claimTypeRegistry, noClaimRuleRegistry: [{ ruleId: "registered_non_required_rule", allowsNoClaim: true, sourceKinds: ["capability"] }], currentEvidenceEdgeIds: [] }); assert.equal(bypass.complete, false);
  assert.equal(claimCoverageProof({ claimSetFingerprint: "c", sources: [sources[0]], claims: [{ ...claims[0], scopeKey: "wrong" }], claimTypeRegistry, currentEvidenceEdgeIds: evidence }).complete, false);
  assert.equal(claimCoverageProof({ claimSetFingerprint: "c", sources: [sources[0]], claims: [{ ...claims[0], evidenceEdgeIds: [] }], claimTypeRegistry, currentEvidenceEdgeIds: [] }).complete, false);
  assert.equal(auditTerminalState({ attempts: 2, maxAttempts: 2, errorKind: "timeout" }).state, "inconclusive_limit_reached"); assert.notEqual(auditTerminalState({ attempts: 1, maxAttempts: 2, errorKind: "malformed" }).state, "passed");
  assert.notEqual(auditTerminalState({ attempts: 1, maxAttempts: 2, errorKind: "refusal" }).state, "passed"); assert.notEqual(auditTerminalState({ attempts: 1, maxAttempts: 2, errorKind: "unknown_failure" }).state, "passed");
  assert.notEqual(auditTerminalState({ attempts: 1, maxAttempts: 2, proposedGapFingerprint: "same-gap", rejectedGapFingerprints: ["same-gap"] }).state, "passed");
  const source = { version: "v4", facts: [{ key: "u", source: "user_confirmed", revisionId: "user-r" }], generatedSpec: "legacy" }; const first = migrateV4Context({ source, registryVersionSet: REGISTRY_VERSION_SET }); const second = migrateV4Context({ source, registryVersionSet: REGISTRY_VERSION_SET, migrations: [first.record] }); assert.equal(second.created, false); assert.deepEqual(second.projection.userConfirmedRevisionIds, ["user-r"]); assert.notEqual(migrateV4Context({ source, registryVersionSet: { ...REGISTRY_VERSION_SET, trait: "next" } }).record.migrationId, first.record.migrationId);
});
