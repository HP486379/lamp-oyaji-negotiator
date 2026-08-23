/**
 * v5 PR0 executable architecture contracts.
 * This module is deliberately unused by the v4 runtime.  It fixes the
 * deterministic data contracts that later v5 state-machine PRs will consume.
 */
import { createHash } from "node:crypto";

export const Authority = Object.freeze(["user", "delegated_to_system", "system_inference"]);
export const Confirmation = Object.freeze(["explicitly_confirmed", "accepted_recommendation", "not_confirmed"]);
export const RequirementClassification = Object.freeze(["product_requirement", "presentation_preference", "implementation_constraint", "implementation_proposal"]);
export const Currentness = Object.freeze(["current", "superseded", "inactive", "stale"]);
export const TraitAssertionStatus = Object.freeze(["supported", "explicitly_rejected", "unknown", "not_evaluated", "not_applicable", "inactive_due_to_scope"]);
export const CapabilityRelevance = Object.freeze(["required_for_core_value", "required_for_primary_flow", "explicitly_requested", "supporting", "unknown"]);
export const GenericBehaviorFamily = Object.freeze(["input_consuming", "output_producing", "state_changing", "external_acting", "continuous_interaction", "decision_producing", "content_generating"]);
export const CoverageAuditState = Object.freeze(["not_run", "passed", "blocking_gap_found", "failed_retryable", "failed_terminal", "inconclusive_limit_reached", "stale"]);

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sortedIds = (values = []) => [...new Set(values)].sort();
const nullable = (value) => value == null ? null : value;
export function canonicalCapabilityKey(key) {
  return { capabilityTypeId: key.capabilityTypeId, parentCapabilityInstanceId: nullable(key.parentCapabilityInstanceId), managedObjectIds: sortedIds(key.managedObjectIds), actorIds: sortedIds(key.actorIds), phaseKindId: nullable(key.phaseKindId) };
}
export function canonicalDecisionKey(key, definition = null) {
  const canonical = { decisionTypeId: key.decisionTypeId, capabilityInstanceId: nullable(key.capabilityInstanceId), managedObjectIds: sortedIds(key.managedObjectIds), actorIds: sortedIds(key.actorIds), phaseKindId: nullable(key.phaseKindId) };
  if (!canonical.capabilityInstanceId && definition && definition.globalScopeAllowed !== true) throw new Error("decision scope requires a capability instance");
  return canonical;
}
export const capabilityInstanceId = (key) => `cap:${hash(canonicalCapabilityKey(key))}`;
export const decisionInstanceId = (key, definition) => `dec:${hash(canonicalDecisionKey(key, definition))}`;

export const REGISTRY_VERSION_SET = Object.freeze({
  decisionType: "v5-pr0.1", capabilityType: "v5-pr0.1", trait: "v5-pr0.1", coreUserValuePattern: "v5-pr0.1", primaryInteractionType: "v5-pr0.1", actorType: "v5-pr0.1", managedObjectType: "v5-pr0.1", slotTemplate: "v5-pr0.1", activationRule: "v5-pr0.1", classificationRule: "v5-pr0.1", criticalityRule: "v5-pr0.1", claimType: "v5-pr0.1", issueType: "v5-pr0.1", questionTemplate: "v5-pr0.1", entailmentRule: "v5-pr0.1" });
export const UNIVERSAL_SLOT_TEMPLATES = Object.freeze([
  "actor_participation", "primary_interaction", "required_input", "required_output", "success_observability", "state_continuity", "external_boundary", "failure_observability",
]);
export const EVIDENCE_RELATION_REGISTRY = Object.freeze([
  { relation: "explicitly_supports", sourceKind: "answer", targetKind: "requirement", maxDerivationDepth: 0, requiresParentEdge: false },
  { relation: "explicitly_rejects", sourceKind: "answer", targetKind: "requirement", maxDerivationDepth: 0, requiresParentEdge: false },
  { relation: "directly_entails", sourceKind: "answer", targetKind: "requirement", maxDerivationDepth: 1, requiresParentEdge: false },
]);
const universalSlotDefinitions = Object.freeze(UNIVERSAL_SLOT_TEMPLATES.map((slotTemplateId) => ({ slotTemplateId, slotClass: "universal", registryVersion: REGISTRY_VERSION_SET.slotTemplate })));
export const DEFAULT_SLOT_REGISTRY = Object.freeze({
  registryVersion: REGISTRY_VERSION_SET.slotTemplate,
  semanticRegistryVersion: REGISTRY_VERSION_SET.coreUserValuePattern,
  slotTemplates: universalSlotDefinitions,
  coreUserValuePatterns: [],
});

export function createDecisionLedger() { return { revisions: new Map(), heads: new Map() }; }
export function appendDecisionRevision(ledger, revision, { expectedCurrentRevisionId = null } = {}) {
  const head = ledger.heads.get(revision.decisionInstanceId) ?? null;
  if (head !== expectedCurrentRevisionId) throw new Error("optimistic concurrency conflict");
  if (revision.currentness !== "current") throw new Error("new decision revision must be current");
  if (revision.supersedesRevisionId && revision.supersedesRevisionId !== head) throw new Error("supersedes must target current head");
  if (revision.supersedesRevisionId === revision.revisionId || ledger.revisions.has(revision.revisionId)) throw new Error("revision cycle or duplicate");
  const next = { ...revision, evidenceEdgeIds: sortedIds(revision.evidenceEdgeIds), dependsOnRevisionIds: sortedIds(revision.dependsOnRevisionIds) };
  if (head) ledger.revisions.set(head, { ...ledger.revisions.get(head), currentness: "superseded" });
  ledger.revisions.set(next.revisionId, next); ledger.heads.set(next.decisionInstanceId, next.revisionId); return next;
}
export function decisionProjection(ledger, instanceId, owningCapabilityActive = true) {
  const revision = ledger.revisions.get(ledger.heads.get(instanceId));
  if (!owningCapabilityActive) return "inactive";
  if (!revision) return "unresolved";
  if (revision.currentness === "stale" || revision.dependsOnRevisionIds.some((id) => ledger.revisions.get(id)?.currentness === "stale")) return "stale";
  return revision.authority === "delegated_to_system" ? "delegated" : "settled";
}
export function createTraitLedger() { return { revisions: new Map(), heads: new Map() }; }
export function appendTraitAssertion(ledger, assertion) {
  const scope = `${assertion.traitId}:${assertion.scopeKey}`; const head = ledger.heads.get(scope);
  if (assertion.currentness !== "current" || assertion.status === "superseded") throw new Error("trait assertion must be a current assertion");
  if (assertion.supersedesAssertionId && assertion.supersedesAssertionId !== head) throw new Error("trait supersedes must target current head");
  if (head) ledger.revisions.set(head, { ...ledger.revisions.get(head), currentness: "superseded", status: "superseded" });
  ledger.revisions.set(assertion.revisionId, { ...assertion, evidenceEdgeIds: sortedIds(assertion.evidenceEdgeIds) }); ledger.heads.set(scope, assertion.revisionId); return assertion;
}

export function validateEvidenceEdge(edge, {
  sourceRevision,
  sourceText = "",
  sourceKind,
  targetKind,
  sourceClassification,
  targetClassification,
  expectedTargetScopeKey,
  relationRegistry = EVIDENCE_RELATION_REGISTRY,
  parentEdgeIds = [],
  excludedEvidenceConflict = false,
  supersededEvidenceConflict = false,
  registeredEntailmentRules = [],
  explicitStructuredAnswer = false,
  registeredTransforms = [],
} = {}) {
  const reject = (reason) => ({ accepted: false, reviewRequired: true, reason });
  if (!sourceRevision || sourceRevision.currentness !== "current") return reject("stale_or_missing_source");
  if (typeof edge?.evidenceSpan !== "string" || edge.evidenceSpan !== String(sourceText)) return reject("evidence_span_not_exact");
  if (excludedEvidenceConflict || supersededEvidenceConflict) return reject("conflicting_evidence");
  const rule = relationRegistry.find((candidate) => candidate.relation === edge.relation && candidate.sourceKind === sourceKind && candidate.targetKind === targetKind);
  if (!rule) return reject("unregistered_relation_or_kind");
  if (edge.targetScopeKey !== expectedTargetScopeKey) return reject("target_scope_mismatch");
  if (rule.requiresParentEdge && (!edge.parentEdgeId || !parentEdgeIds.includes(edge.parentEdgeId))) return reject("missing_parent_edge");
  if (edge.parentEdgeId && !parentEdgeIds.includes(edge.parentEdgeId)) return reject("unknown_parent_edge");
  if (!Number.isInteger(edge.derivationDepth) || edge.derivationDepth < 0 || edge.derivationDepth > rule.maxDerivationDepth) return reject("derivation_depth_exceeded");
  if (rule.allowedSourceClassifications && !rule.allowedSourceClassifications.includes(sourceClassification)) return reject("source_classification_mismatch");
  if (rule.allowedTargetClassifications && !rule.allowedTargetClassifications.includes(targetClassification)) return reject("target_classification_mismatch");
  if (edge.relation !== "directly_entails") return { accepted: true, reviewRequired: false };
  const registeredEntailment = registeredEntailmentRules.some((candidate) => candidate.entailmentRuleId === edge.entailmentRuleId && candidate.sourceKind === sourceKind && candidate.targetKind === targetKind && candidate.maxDerivationDepth >= edge.derivationDepth);
  const registeredTransform = registeredTransforms.some((candidate) => candidate.transformId === edge.transformId && candidate.sourceKind === sourceKind && candidate.targetKind === targetKind && candidate.maxDerivationDepth >= edge.derivationDepth);
  return registeredEntailment || registeredTransform || explicitStructuredAnswer === true
    ? { accepted: true, reviewRequired: false }
    : reject("unregistered_entailment");
}

function inspectSlotRegistry(registry, requestedPatternIds = [], semanticRegistryVersion) {
  const errors = [];
  if (!registry || registry.registryVersion !== REGISTRY_VERSION_SET.slotTemplate || registry.semanticRegistryVersion !== REGISTRY_VERSION_SET.coreUserValuePattern || semanticRegistryVersion !== registry.semanticRegistryVersion) errors.push("registry_version_mismatch");
  const templates = registry?.slotTemplates ?? [];
  const templateById = new Map(templates.map((template) => [template.slotTemplateId, template]));
  const missingUniversal = UNIVERSAL_SLOT_TEMPLATES.filter((id) => {
    const template = templateById.get(id);
    return !template || template.slotClass !== "universal" || template.registryVersion !== registry?.registryVersion;
  });
  if (missingUniversal.length) errors.push("missing_universal_templates");
  const patterns = registry?.coreUserValuePatterns ?? [];
  const patternById = new Map(patterns.map((pattern) => [pattern.coreUserValuePatternId, pattern]));
  const unknownPatternIds = requestedPatternIds.filter((id) => !patternById.has(id));
  if (unknownPatternIds.length) errors.push("unknown_requested_pattern");
  const uncoveredPatternIds = patterns.filter((pattern) => pattern.registryVersion !== registry?.semanticRegistryVersion || !(pattern.requiredSlotTemplateIds ?? []).every((id) => {
    const template = templateById.get(id);
    return template && template.slotClass === "core_value_pattern" && template.registryVersion === registry?.registryVersion;
  })).map((pattern) => pattern.coreUserValuePatternId);
  if (uncoveredPatternIds.length) errors.push("uncovered_registered_pattern");
  return { errors, templates, patternById, missingUniversal, unknownPatternIds, uncoveredPatternIds };
}
export function generateCapabilitySlots({ coreUserValuePatternIds = [], patternMappings = [], slotRegistry = DEFAULT_SLOT_REGISTRY, semanticRegistryVersion = REGISTRY_VERSION_SET.coreUserValuePattern, aiCandidates = [] } = {}) {
  const inspection = inspectSlotRegistry(slotRegistry, coreUserValuePatternIds, semanticRegistryVersion);
  const requestedPatterns = coreUserValuePatternIds.map((id) => inspection.patternById.get(id)).filter(Boolean);
  const ids = [...new Set([...UNIVERSAL_SLOT_TEMPLATES, ...requestedPatterns.flatMap((pattern) => pattern.requiredSlotTemplateIds ?? [])])];
  return ids.map((slotTemplateId) => ({ slotInstanceId: `slot:${slotTemplateId}`, slotTemplateId, scopeKey: "global", status: "unknown", capabilityInstanceIds: [], evidenceEdgeIds: [], proofRuleId: "pr0-slot-default" , aiCandidateCount: aiCandidates.length, coreUserValuePatternIds: sortedIds(coreUserValuePatternIds), patternMappings }));
}
export function slotRegistryCoverageProof({ slotRegistry = DEFAULT_SLOT_REGISTRY, coreUserValuePatternIds = [], semanticRegistryVersion = REGISTRY_VERSION_SET.coreUserValuePattern } = {}) {
  const inspection = inspectSlotRegistry(slotRegistry, coreUserValuePatternIds, semanticRegistryVersion);
  return { coreUserValuePatternIds: sortedIds(coreUserValuePatternIds), universalSlotTemplateIds: sortedIds((slotRegistry?.slotTemplates ?? []).filter((template) => template.slotClass === "universal").map((template) => template.slotTemplateId)), coveredPatternIds: sortedIds((slotRegistry?.coreUserValuePatterns ?? []).filter((pattern) => !inspection.uncoveredPatternIds.includes(pattern.coreUserValuePatternId)).map((pattern) => pattern.coreUserValuePatternId)), uncoveredPatternIds: sortedIds([...inspection.unknownPatternIds, ...inspection.uncoveredPatternIds]), registryVersion: slotRegistry?.registryVersion ?? null, semanticRegistryVersion: slotRegistry?.semanticRegistryVersion ?? null, errors: inspection.errors, complete: inspection.errors.length === 0 };
}
export function capabilityCoverageProof({ requirementFingerprint, slotRegistry, coreUserValuePatternIds = [], semanticRegistryVersion = REGISTRY_VERSION_SET.coreUserValuePattern, patternState, slots = [], provisionalCapabilities = [] }) {
  const registryCoverage = slotRegistryCoverageProof({ slotRegistry, coreUserValuePatternIds, semanticRegistryVersion });
  const unknownBlockingSlotIds = slots.filter((slot) => slot.status === "unknown" || (slot.conditional === true && slot.status === "not_applicable" && !slot.notApplicableRuleId)).map((slot) => slot.slotInstanceId);
  const provisionalBlockingCapabilityIds = provisionalCapabilities.filter((item) => item.blocking).map((item) => item.id);
  return { requirementFingerprint, registryVersion: REGISTRY_VERSION_SET.slotTemplate, slotGeneratorVersion: "v5-pr0.1", slotRegistryCoverageProofId: hash(registryCoverage), slotInstanceIds: slots.map((slot) => slot.slotInstanceId), unknownBlockingSlotIds, provisionalBlockingCapabilityIds, complete: registryCoverage.complete && ["mapped", "user_confirmed"].includes(patternState) && !unknownBlockingSlotIds.length && !provisionalBlockingCapabilityIds.length };
}
export function genericEnvelope({ behaviorFamily, baselineEvaluated, blockingDecisionMapped, unresolvedGapBlocking }) {
  return { behaviorFamily, completionContribution: false, mayPromoteToCapability: GenericBehaviorFamily.includes(behaviorFamily) && baselineEvaluated && blockingDecisionMapped && !unresolvedGapBlocking, unresolvedGapBlocking: Boolean(unresolvedGapBlocking) };
}

export function classifyRequirement({ impacts = {}, aiCandidate = null }) {
  const axes = ["productVisibleState", "actorOperation", "requiredOutput", "dataBoundary", "primaryFlow", "externalConsequence"];
  const matched = axes.filter((axis) => impacts[axis] === true);
  if (matched.length) return { classification: "product_requirement", resolverRuleId: `classification:${matched[0]}`, provisional: false };
  return { classification: aiCandidate ? "implementation_proposal" : "implementation_constraint", resolverRuleId: "classification:non_product", provisional: Boolean(aiCandidate) };
}
export function resolveCriticality({ decisionInstanceId, registeredRuleId = null, effects = {}, requirementFingerprint }) {
  const blocking = Boolean(registeredRuleId) && Boolean(effects.coreCapability || effects.primaryFlow || effects.externalConsequence || effects.dataBoundary || effects.conflict);
  return { decisionInstanceId, blocking, affectedCoreCapabilityIds: sortedIds(effects.affectedCoreCapabilityIds), affectedPrimaryFlowIds: sortedIds(effects.affectedPrimaryFlowIds), externalConsequenceAffected: Boolean(effects.externalConsequence), dataBoundaryAffected: Boolean(effects.dataBoundary), resolverRuleId: registeredRuleId ?? "criticality:ai_candidate_non_authoritative", requirementFingerprint };
}
export function resolveDelegation({ candidates = [], valueSchemaValid, inScope, coreInvariantSafe, noBlockingConflict, introducesCapability, expandsExternalConsequence, expandsDataBoundary }) {
  const safe = valueSchemaValid && inScope && coreInvariantSafe && noBlockingConflict && !introducesCapability && !expandsExternalConsequence && !expandsDataBoundary;
  return safe && candidates.length === 1 ? { settled: true, value: candidates[0], reason: "unique_safe_default" } : { settled: false, value: null, reason: !safe ? "boundary_violation" : candidates.length === 0 ? "no_safe_default" : "ambiguous_safe_default" };
}

export function requirementFingerprint(state) {
  return hash({ coreUserValue: state.coreUserValue, actors: sortedIds(state.actors), managedObjects: sortedIds(state.managedObjects), activeCapabilities: sortedIds(state.activeCapabilities), traitHeads: sortedIds(state.traitHeads), decisionRevisions: state.decisionRevisions ?? [], openBlockingIssues: sortedIds(state.openBlockingIssues), registryVersions: state.registryVersions });
}
export const claimSetFingerprint = ({ requirementFingerprint: fp, claims = [], claimTypeRegistryVersion }) => hash({ requirementFingerprint: fp, claimIds: sortedIds(claims.map((claim) => claim.claimId ?? claim)), claimTypeRegistryVersion });
export const completionCandidateFingerprint = ({ requirementFingerprint: fp, claimSetFingerprint: claimFp, finalCoverageAuditId }) => hash({ requirementFingerprint: fp, claimSetFingerprint: claimFp, finalCoverageAuditId });

export function validateArtifactDag(edges) {
  const nodes = new Set(edges.flatMap((edge) => [`${edge.fromArtifactKind}:${edge.fromArtifactId}`, `${edge.toArtifactKind}:${edge.toArtifactId}`])); const adjacency = new Map([...nodes].map((node) => [node, []]));
  for (const edge of edges) adjacency.get(`${edge.fromArtifactKind}:${edge.fromArtifactId}`).push(`${edge.toArtifactKind}:${edge.toArtifactId}`);
  const visiting = new Set(), visited = new Set(); const visit = (node) => { if (visiting.has(node)) throw new Error("artifact dependency cycle"); if (visited.has(node)) return; visiting.add(node); for (const next of adjacency.get(node)) visit(next); visiting.delete(node); visited.add(node); };
  for (const node of nodes) visit(node); return true;
}
export function propagateStaleTransaction({ edges, changedArtifactId, fail = false }) {
  validateArtifactDag(edges); if (fail) throw new Error("stale propagation transaction failed");
  // Edges point from an input artifact to the artifact derived from it. A
  // source revision therefore invalidates its reachable downstream artifacts.
  const downstream = new Map(); for (const edge of edges) { const from = `${edge.fromArtifactKind}:${edge.fromArtifactId}`, to = `${edge.toArtifactKind}:${edge.toArtifactId}`; downstream.set(from, [...(downstream.get(from) ?? []), to]); }
  const stale = new Set([changedArtifactId]); const queue = [changedArtifactId]; while (queue.length) for (const next of downstream.get(queue.shift()) ?? []) if (!stale.has(next)) { stale.add(next); queue.push(next); } return [...stale].sort();
}

export function claimCoverageProof({ claimSetFingerprint: fp, sources = [], claims = [], claimTypeRegistry = [], noClaimRuleRegistry = [], currentEvidenceEdgeIds = [] }) {
  const evidenceIds = new Set(currentEvidenceEdgeIds);
  const supportedKinds = new Set(["capability", "decision", "core_invariant", "primary_flow"]);
  const sourceRequiresClaim = (source) => source.currentness === "current" && ((source.kind === "capability" && source.blocking === true) || (source.kind === "decision" && source.classification === "product_requirement" && ["settled", "delegated"].includes(source.settlement)) || source.kind === "core_invariant" || source.kind === "primary_flow");
  const entries = sources.map((source) => {
    const requiresClaim = supportedKinds.has(source.kind) && sourceRequiresClaim(source);
    const noClaimRule = noClaimRuleRegistry.find((rule) => rule.ruleId === source.noClaimRuleId && rule.allowsNoClaim === true && rule.sourceKinds?.includes(source.kind));
    const matchingClaims = claims.filter((claim) => claim.sourceIds?.includes(source.id) && claim.currentness === "current" && claim.scopeKey === source.scopeKey && claimTypeRegistry.some((type) => type.claimTypeId === claim.claimTypeId && type.required === true && type.sourceKinds?.includes(source.kind)) && Array.isArray(claim.evidenceEdgeIds) && claim.evidenceEdgeIds.length > 0 && claim.evidenceEdgeIds.every((id) => evidenceIds.has(id)));
    return { sourceKind: source.kind, sourceId: source.id, representedByClaimIds: matchingClaims.map((claim) => claim.claimId), explicitlyNoClaimReason: noClaimRule?.ruleId ?? null, stale: source.currentness !== "current", requiresClaim };
  });
  const uncoveredBlockingSourceIds = entries.filter((entry) => entry.requiresClaim && !entry.representedByClaimIds.length).map((entry) => entry.sourceId);
  const invalidNoClaimReasonIds = sources.filter((source) => source.noClaimRuleId && !noClaimRuleRegistry.some((rule) => rule.ruleId === source.noClaimRuleId && rule.allowsNoClaim === true && rule.sourceKinds?.includes(source.kind))).map((source) => source.id);
  const invalidClaimIds = claims.filter((claim) => claim.currentness !== "current" || !Array.isArray(claim.evidenceEdgeIds) || !claim.evidenceEdgeIds.length || !claim.evidenceEdgeIds.every((id) => evidenceIds.has(id)) || !claimTypeRegistry.some((type) => type.claimTypeId === claim.claimTypeId && type.required === true)).map((claim) => claim.claimId);
  return { claimSetFingerprint: fp, entries, uncoveredBlockingSourceIds, invalidNoClaimReasonIds, invalidClaimIds, complete: !uncoveredBlockingSourceIds.length && !invalidNoClaimReasonIds.length && !invalidClaimIds.length };
}
export function auditTerminalState({ attempts, maxAttempts, errorKind = null, rejectedGapFingerprints = [], proposedGapFingerprint = null, blockingGapFound = false }) {
  const normalizedRejected = sortedIds(rejectedGapFingerprints);
  const retryableErrorKinds = new Set(["timeout", "malformed", "refusal", "transport", "server_error"]);
  if (!Number.isInteger(attempts) || !Number.isInteger(maxAttempts) || attempts < 0 || maxAttempts < 1) return { state: "failed_terminal", rejectedGapFingerprints: normalizedRejected, reason: "invalid_audit_attempts" };
  if (errorKind !== null) return { state: attempts >= maxAttempts ? "inconclusive_limit_reached" : retryableErrorKinds.has(errorKind) ? "failed_retryable" : "failed_terminal", rejectedGapFingerprints: normalizedRejected, reason: errorKind };
  if (proposedGapFingerprint && normalizedRejected.includes(proposedGapFingerprint)) return { state: "failed_terminal", rejectedGapFingerprints: normalizedRejected, reason: "repeated_rejected_gap" };
  if (blockingGapFound) return { state: "blocking_gap_found", rejectedGapFingerprints: normalizedRejected, reason: "blocking_gap_found" };
  return { state: "passed", rejectedGapFingerprints: normalizedRejected };
}
export function migrateV4Context({ source, registryVersionSet, migrations = [] }) {
  const sourceFactFingerprint = hash(source.facts ?? []); const key = hash({ sourceFactFingerprint, target: "v5", registryVersionSet }); const existing = migrations.find((item) => item.migrationId === key);
  if (existing) return { record: existing, projection: existing.projection, created: false };
  const projection = { userConfirmedRevisionIds: sortedIds((source.facts ?? []).filter((fact) => fact.source === "user_confirmed").map((fact) => fact.revisionId ?? fact.key)), legacyGeneratedArtifacts: (source.generatedSpec ? [source.generatedSpec] : []) };
  const record = { migrationId: key, sourceContextVersion: source.version ?? "v4", targetContextVersion: "v5", sourceFactFingerprint, registryVersionSet, migrationStatus: "completed", migrationWarnings: [], projection }; return { record, projection, created: true };
}
