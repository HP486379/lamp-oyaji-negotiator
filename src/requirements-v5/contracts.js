/**
 * v5 PR0 executable architecture contracts.
 *
 * Runtime callers never own authoritative registries or ledgers.  The public
 * authority is an opaque, frozen handle whose mutable state lives in this
 * module's WeakMap and can change only through validated commands.
 */
import { createHash } from "node:crypto";

export const REGISTRY_VERSION_SET = Object.freeze({
  decisionType: "v5-pr0.3",
  capabilityType: "v5-pr0.3",
  trait: "v5-pr0.3",
  coreUserValuePattern: "v5-pr0.3",
  primaryInteractionType: "v5-pr0.3",
  actorType: "v5-pr0.3",
  managedObjectType: "v5-pr0.3",
  slotTemplate: "v5-pr0.3",
  activationRule: "v5-pr0.3",
  classificationRule: "v5-pr0.3",
  criticalityRule: "v5-pr0.3",
  claimType: "v5-pr0.3",
  issueType: "v5-pr0.3",
  questionTemplate: "v5-pr0.3",
  entailmentRule: "v5-pr0.3",
  auditRule: "v5-pr0.3",
  migrationAdapter: "v5-pr0.3",
});

export const Authority = Object.freeze(["user", "delegated_to_system", "system_inference"]);
export const Confirmation = Object.freeze(["explicitly_confirmed", "accepted_recommendation", "not_confirmed"]);
export const RequirementClassification = Object.freeze(["product_requirement", "presentation_preference", "implementation_constraint", "implementation_proposal"]);
export const Currentness = Object.freeze(["current", "superseded", "inactive", "stale"]);
export const TraitAssertionStatus = Object.freeze(["supported", "explicitly_rejected", "unknown", "not_evaluated", "not_applicable", "inactive_due_to_scope", "superseded"]);
export const GenericBehaviorFamily = Object.freeze(["input_consuming", "output_producing", "state_changing", "external_acting", "continuous_interaction", "decision_producing", "content_generating"]);
export const CoverageAuditState = Object.freeze(["not_run", "passed", "blocking_gap_found", "failed_retryable", "failed_terminal", "inconclusive_limit_reached", "stale"]);
export const UNIVERSAL_SLOT_TEMPLATES = Object.freeze(["actor_participation", "primary_interaction", "required_input", "required_output", "success_observability", "state_continuity", "external_boundary", "failure_observability"]);
export const REQUIRED_SPEC_ELEMENT_KINDS = Object.freeze(["functional_requirement", "data_model_field", "state_transition", "error_handling_rule", "acceptance_criteria", "primary_flow_step", "required_product_paragraph"]);

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const hash = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const uniqueSorted = (values = []) => [...new Set(values ?? [])].sort();
const collection = (value) => value === null ? { presence: "null", values: null } : Array.isArray(value) ? { presence: "array", values: uniqueSorted(value) } : { presence: "missing", values: null };
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export function canonicalCapabilityKey(key) {
  return {
    capabilityTypeId: key.capabilityTypeId,
    parentCapabilityInstanceId: key.parentCapabilityInstanceId ?? null,
    managedObjectIds: collection(key.managedObjectIds),
    actorIds: collection(key.actorIds),
    phaseKindId: key.phaseKindId ?? null,
  };
}
export function canonicalDecisionKey(key, definition = null) {
  const canonical = {
    decisionTypeId: key.decisionTypeId,
    capabilityInstanceId: key.capabilityInstanceId ?? null,
    managedObjectIds: collection(key.managedObjectIds),
    actorIds: collection(key.actorIds),
    phaseKindId: key.phaseKindId ?? null,
  };
  if (!canonical.capabilityInstanceId && definition?.globalScopeAllowed !== true) throw new Error("decision scope requires a capability instance");
  return canonical;
}
export const capabilityInstanceId = (key) => `cap:${hash(canonicalCapabilityKey(key))}`;
export const decisionInstanceId = (key, definition) => `dec:${hash(canonicalDecisionKey(key, definition))}`;

const UNIVERSAL_SLOT_DEFS = UNIVERSAL_SLOT_TEMPLATES.map((slotTemplateId) => ({ slotTemplateId, slotClass: "universal", registryVersion: REGISTRY_VERSION_SET.slotTemplate }));
const BUILTIN_PATTERN = Object.freeze({
  coreUserValuePatternId: "pr0_interactive_value",
  registryVersion: REGISTRY_VERSION_SET.coreUserValuePattern,
  requiredSlotTemplateIds: ["pattern_primary_capability"],
});
const BUILTIN_SLOT_REGISTRY = deepFreeze({
  registryVersion: REGISTRY_VERSION_SET.slotTemplate,
  semanticRegistryVersion: REGISTRY_VERSION_SET.coreUserValuePattern,
  slotTemplates: [...UNIVERSAL_SLOT_DEFS, { slotTemplateId: "pattern_primary_capability", slotClass: "core_value_pattern", registryVersion: REGISTRY_VERSION_SET.slotTemplate }],
  coreUserValuePatterns: [BUILTIN_PATTERN],
});
export const DEFAULT_SLOT_REGISTRY = BUILTIN_SLOT_REGISTRY;

const BUILTIN_REGISTRIES = deepFreeze({
  registryVersionSet: REGISTRY_VERSION_SET,
  slotRegistry: BUILTIN_SLOT_REGISTRY,
  relationRules: [
    { relation: "explicitly_states", sourceKind: "answer", targetKind: "requirement", parentRequired: false, maxDerivationDepth: 0, allowedSourceClassifications: ["product_requirement"], allowedTargetClassifications: ["product_requirement", "implementation_constraint"] },
    { relation: "directly_entails", sourceKind: "answer", targetKind: "requirement", parentRequired: true, maxDerivationDepth: 1, allowedSourceClassifications: ["product_requirement"], allowedTargetClassifications: ["product_requirement"] },
  ],
  entailmentRules: [
    { entailmentRuleId: "pr0_enum_identity", sourceKind: "answer", targetKind: "requirement", sourceValueSchemaId: "enum", targetValueSchemaId: "enum", transformId: "identity", maxDerivationDepth: 1 },
  ],
  transforms: [
    { transformId: "identity", sourceKind: "answer", targetKind: "requirement", sourceValueSchemaId: "enum", targetValueSchemaId: "enum", pure: true },
  ],
  structuredSchemas: [
    { schemaId: "enum", type: "string", targetKinds: ["requirement"] },
  ],
  slotSettlementRules: [
    { ruleId: "explicit_not_required", allowedStatuses: ["explicitly_not_required", "not_applicable"] },
  ],
  claimTypes: [
    { claimTypeId: "required_product", required: true, sourceKinds: ["capability", "decision", "core_invariant", "primary_flow"] },
  ],
  criticalityRules: [
    { ruleId: "core-impact", blockingWhenAny: ["coreCapability", "primaryFlow", "externalConsequence", "dataBoundary", "conflict"] },
  ],
  auditExecutors: [{ executorId: "coverage-audit-v1" }],
  auditRules: [{ auditRuleId: "final-coverage-v1" }],
  migrationAdapters: [{ adapterId: "v4-authoritative-export-v1", sourceContextVersion: "v4" }],
});

const PRIVATE = new WeakMap();
const assertAuthority = (authority) => {
  const state = PRIVATE.get(authority);
  if (!state) throw new Error("invalid architecture authority handle");
  return state;
};
const newState = () => ({
  registries: BUILTIN_REGISTRIES,
  revisions: new Map(),
  targets: new Map(),
  evidenceEdges: new Map(),
  capabilities: new Map(),
  decisions: new Map(),
  traits: new Map(),
  coreInvariants: new Map(),
  primaryFlows: new Map(),
  slots: new Map(),
  claims: new Map(),
  audits: new Map(),
  artifacts: new Map(),
  dependencyEdges: [],
  migrations: new Map(),
  legacySnapshots: new Map(),
  coreUserValueMapping: null,
  coreUserValue: null,
  actors: new Map(),
  managedObjects: new Map(),
  openBlockingIssues: new Map(),
});

export function createArchitectureAuthority() {
  const authority = Object.freeze({ kind: "v5-architecture-authority", version: "pr0.3" });
  PRIVATE.set(authority, newState());
  return authority;
}

const structuredValueValid = (schema, value) => schema?.type === "string" ? typeof value === "string" : false;
const evidenceValidation = (state, edge) => {
  const source = state.revisions.get(edge.sourceRevisionId);
  const target = state.targets.get(edge.targetId);
  if (!source || source.currentness !== "current" || !target || target.currentness !== "current") return { accepted: false, reason: "invalid_endpoint" };
  if (edge.evidenceSpan !== source.evidenceText) return { accepted: false, reason: "invalid_span" };
  const rule = state.registries.relationRules.find((item) => item.relation === edge.relation && item.sourceKind === source.kind && item.targetKind === target.kind);
  if (!rule) return { accepted: false, reason: "unregistered_relation" };
  if (!rule.allowedSourceClassifications.includes(source.classification) || !rule.allowedTargetClassifications.includes(target.classification)) return { accepted: false, reason: "classification_mismatch" };
  if (edge.targetScopeKey !== target.scopeKey || source.scopeKey !== target.scopeKey) return { accepted: false, reason: "scope_mismatch" };
  if (!Number.isInteger(edge.derivationDepth) || edge.derivationDepth < 0 || edge.derivationDepth > rule.maxDerivationDepth) return { accepted: false, reason: "invalid_depth" };
  if (rule.parentRequired && !edge.parentEdgeId) return { accepted: false, reason: "parent_required" };
  if (edge.parentEdgeId) {
    const parent = state.evidenceEdges.get(edge.parentEdgeId);
    if (!parent || parent.currentness !== "current") return { accepted: false, reason: "invalid_parent" };
  }
  if ([...state.evidenceEdges.values()].some((candidate) => candidate.currentness === "current" && candidate.excludesEdgeId === edge.edgeId)) return { accepted: false, reason: "excluded" };
  if (edge.relation === "directly_entails") {
    const entailment = state.registries.entailmentRules.find((item) => item.entailmentRuleId === edge.entailmentRuleId && item.sourceKind === source.kind && item.targetKind === target.kind && item.sourceValueSchemaId === source.valueSchemaId && item.targetValueSchemaId === target.valueSchemaId && item.transformId === edge.transformId && item.maxDerivationDepth >= edge.derivationDepth);
    const transform = state.registries.transforms.find((item) => item.transformId === edge.transformId && item.pure === true && item.sourceKind === source.kind && item.targetKind === target.kind && item.sourceValueSchemaId === source.valueSchemaId && item.targetValueSchemaId === target.valueSchemaId);
    const schema = state.registries.structuredSchemas.find((item) => item.schemaId === source.valueSchemaId && item.targetKinds.includes(target.kind));
    if (!entailment || !transform || !structuredValueValid(schema, source.value)) return { accepted: false, reason: "unregistered_entailment_contract" };
  }
  return { accepted: true };
};

const expectedSlotIds = (state) => {
  const mapping = state.coreUserValueMapping;
  if (!mapping || !["mapped", "user_confirmed"].includes(mapping.status) || !mapping.patternIds.length) return null;
  const patterns = new Map(state.registries.slotRegistry.coreUserValuePatterns.map((item) => [item.coreUserValuePatternId, item]));
  const templateIds = new Set(UNIVERSAL_SLOT_TEMPLATES);
  for (const patternId of mapping.patternIds) {
    const pattern = patterns.get(patternId);
    if (!pattern) return null;
    for (const slotId of pattern.requiredSlotTemplateIds) templateIds.add(slotId);
  }
  return [...templateIds].sort();
};

export function executeAuthorityCommand(authority, command) {
  const state = assertAuthority(authority);
  if (!command || typeof command !== "object" || typeof command.type !== "string") throw new Error("invalid authority command");
  switch (command.type) {
    case "set_core_user_value": {
      if (!command.revisionId || typeof command.value !== "string") throw new Error("invalid core user value");
      state.coreUserValue = { revisionId: command.revisionId, value: command.value, currentness: "current" };
      return;
    }
    case "map_core_user_value": {
      const patternIds = uniqueSorted(command.patternIds);
      const known = new Set(state.registries.slotRegistry.coreUserValuePatterns.map((item) => item.coreUserValuePatternId));
      if (!patternIds.length || patternIds.some((id) => !known.has(id)) || !["mapped", "user_confirmed"].includes(command.status)) throw new Error("invalid core user value mapping");
      state.coreUserValueMapping = { status: command.status, patternIds };
      return;
    }
    case "add_actor": {
      if (!command.id || !command.actorTypeId) throw new Error("invalid actor");
      state.actors.set(command.id, { id: command.id, actorTypeId: command.actorTypeId, scopeKey: command.scopeKey ?? null, currentness: "current" });
      return;
    }
    case "add_managed_object": {
      if (!command.id || !command.objectTypeId) throw new Error("invalid managed object");
      state.managedObjects.set(command.id, { id: command.id, objectTypeId: command.objectTypeId, parentId: command.parentId ?? null, currentness: "current" });
      return;
    }
    case "add_revision": {
      if (!command.revisionId || state.revisions.has(command.revisionId) || !Authority.includes(command.authority) || !RequirementClassification.includes(command.classification)) throw new Error("invalid revision");
      state.revisions.set(command.revisionId, { revisionId: command.revisionId, decisionInstanceId: command.decisionInstanceId ?? null, value: command.value, authority: command.authority, confirmation: command.confirmation ?? "not_confirmed", currentness: "current", evidenceEdgeIds: uniqueSorted(command.evidenceEdgeIds), dependsOnRevisionIds: uniqueSorted(command.dependsOnRevisionIds), supersedesRevisionId: command.supersedesRevisionId ?? null, kind: command.kind ?? "answer", classification: command.classification, scopeKey: command.scopeKey ?? null, evidenceText: command.evidenceText ?? "", valueSchemaId: command.valueSchemaId ?? null, criticalityRuleId: command.criticalityRuleId ?? null, effects: { ...(command.effects ?? {}) }, settlement: command.settlement ?? null });
      return;
    }
    case "add_target": {
      if (!command.id || !command.kind || !RequirementClassification.includes(command.classification)) throw new Error("invalid target");
      state.targets.set(command.id, { id: command.id, kind: command.kind, classification: command.classification, scopeKey: command.scopeKey ?? null, valueSchemaId: command.valueSchemaId ?? null, currentness: "current" });
      return;
    }
    case "add_evidence": {
      if (!command.edgeId || state.evidenceEdges.has(command.edgeId)) throw new Error("invalid evidence edge");
      const edge = { edgeId: command.edgeId, sourceRevisionId: command.sourceRevisionId, targetId: command.targetId, relation: command.relation, targetScopeKey: command.targetScopeKey ?? null, evidenceSpan: command.evidenceSpan, derivationDepth: command.derivationDepth, parentEdgeId: command.parentEdgeId ?? null, entailmentRuleId: command.entailmentRuleId ?? null, transformId: command.transformId ?? null, excludesEdgeId: command.excludesEdgeId ?? null, currentness: "current" };
      const result = evidenceValidation(state, edge);
      if (!result.accepted) throw new Error(`invalid evidence: ${result.reason}`);
      state.evidenceEdges.set(edge.edgeId, edge);
      return;
    }
    case "add_capability": {
      if (!command.id || !command.capabilityTypeId) throw new Error("invalid capability");
      state.capabilities.set(command.id, { id: command.id, capabilityTypeId: command.capabilityTypeId, parentCapabilityInstanceId: command.parentCapabilityInstanceId ?? null, managedObjectIds: uniqueSorted(command.managedObjectIds), actorIds: uniqueSorted(command.actorIds), phaseKindId: command.phaseKindId ?? null, scopeKey: command.scopeKey ?? null, currentness: "current", blocking: command.blocking === true, provisional: command.provisional === true });
      return;
    }
    case "add_decision": {
      const revision = state.revisions.get(command.revisionId);
      if (!revision || revision.currentness !== "current" || revision.classification !== "product_requirement") throw new Error("invalid decision source revision");
      state.decisions.set(command.id, { id: command.id, revisionId: revision.revisionId, scopeKey: revision.scopeKey, settlement: revision.settlement, currentness: "current" });
      return;
    }
    case "add_trait": {
      if (!command.id || !TraitAssertionStatus.includes(command.status)) throw new Error("invalid trait");
      state.traits.set(command.id, { id: command.id, traitId: command.traitId, scopeKey: command.scopeKey ?? null, status: command.status, value: command.value, currentness: "current", evidenceEdgeIds: uniqueSorted(command.evidenceEdgeIds) });
      return;
    }
    case "add_core_invariant":
    case "add_primary_flow": {
      if (!command.id || !command.scopeKey) throw new Error("invalid required source");
      const target = command.type === "add_core_invariant" ? state.coreInvariants : state.primaryFlows;
      target.set(command.id, { id: command.id, scopeKey: command.scopeKey, currentness: "current", evidenceEdgeIds: uniqueSorted(command.evidenceEdgeIds) });
      return;
    }
    case "settle_slot": {
      const expected = expectedSlotIds(state);
      if (!expected?.includes(command.slotTemplateId)) throw new Error("unknown slot");
      const slotId = `slot:${command.slotTemplateId}`;
      if (command.status === "satisfied") {
        if (!command.evidenceEdgeId) throw new Error("satisfied slot requires evidence");
        const edge = state.evidenceEdges.get(command.evidenceEdgeId);
        if (!edge || !evidenceValidation(state, edge).accepted) throw new Error("invalid slot evidence");
      } else if (["explicitly_not_required", "not_applicable"].includes(command.status)) {
        const rule = state.registries.slotSettlementRules.find((item) => item.ruleId === command.ruleId && item.allowedStatuses.includes(command.status));
        if (!rule) throw new Error("slot settlement rule required");
      } else throw new Error("invalid slot settlement");
      state.slots.set(slotId, { slotInstanceId: slotId, slotTemplateId: command.slotTemplateId, status: command.status, evidenceEdgeId: command.evidenceEdgeId ?? null, ruleId: command.ruleId ?? null, currentness: "current" });
      return;
    }
    case "add_claim": {
      const type = state.registries.claimTypes.find((item) => item.claimTypeId === command.claimTypeId && item.required === true);
      if (!type || !command.claimId || !command.sourceId || !command.evidenceEdgeId) throw new Error("invalid claim");
      const source = findRequiredSource(state, command.sourceId);
      if (!source || !type.sourceKinds.includes(source.kind) || source.scopeKey !== command.scopeKey) throw new Error("claim source mismatch");
      const edge = state.evidenceEdges.get(command.evidenceEdgeId);
      if (!edge || !evidenceValidation(state, edge).accepted) throw new Error("claim requires current grounded evidence");
      state.claims.set(command.claimId, { claimId: command.claimId, claimTypeId: command.claimTypeId, sourceIds: [command.sourceId], scopeKey: command.scopeKey, currentness: "current", evidenceEdgeIds: [command.evidenceEdgeId] });
      return;
    }
    case "add_audit": {
      const currentFp = requirementFingerprint({ authority });
      const executor = state.registries.auditExecutors.some((item) => item.executorId === command.executorId);
      const rule = state.registries.auditRules.some((item) => item.auditRuleId === command.auditRuleId);
      if (!executor || !rule || command.requirementFingerprint !== currentFp || command.executed !== true || command.completed !== true || command.outcome !== "passed" || command.errorKind || command.proposedGapFingerprint) throw new Error("invalid successful audit record");
      state.audits.set(command.auditId, { auditId: command.auditId, executorId: command.executorId, auditRuleId: command.auditRuleId, requirementFingerprint: currentFp, attempts: command.attempts ?? 1, maxAttempts: command.maxAttempts ?? 1, executed: true, completed: true, outcome: "passed", currentness: "current", rejectedGapFingerprints: uniqueSorted(command.rejectedGapFingerprints) });
      return;
    }
    case "add_artifact": {
      if (!command.id || !command.kind) throw new Error("invalid artifact");
      state.artifacts.set(`${command.kind}:${command.id}`, { id: command.id, kind: command.kind, currentness: "current" });
      return;
    }
    case "add_dependency": {
      const edge = { fromArtifactKind: command.fromArtifactKind, fromArtifactId: command.fromArtifactId, toArtifactKind: command.toArtifactKind, toArtifactId: command.toArtifactId, dependencyKind: command.dependencyKind };
      validateArtifactDag([...state.dependencyEdges, edge]);
      state.dependencyEdges.push(edge);
      return;
    }
    case "register_legacy_snapshot": {
      const adapter = state.registries.migrationAdapters.find((item) => item.adapterId === command.adapterId && item.sourceContextVersion === command.sourceContextVersion);
      if (!adapter || !Array.isArray(command.facts)) throw new Error("untrusted legacy snapshot");
      const snapshotId = hash({ adapterId: command.adapterId, sourceContextVersion: command.sourceContextVersion, facts: command.facts });
      state.legacySnapshots.set(snapshotId, { snapshotId, adapterId: command.adapterId, sourceContextVersion: command.sourceContextVersion, facts: structuredClone(command.facts) });
      return snapshotId;
    }
    default:
      throw new Error(`unknown authority command: ${command.type}`);
  }
}

export function validateEvidenceEdge({ authority, edgeId }) {
  const state = assertAuthority(authority);
  const edge = state.evidenceEdges.get(edgeId);
  return edge ? { ...evidenceValidation(state, edge), edgeId } : { accepted: false, reviewRequired: true, reason: "missing_edge" };
}

export function generateCapabilitySlots({ authority }) {
  const state = assertAuthority(authority);
  return (expectedSlotIds(state) ?? []).map((slotTemplateId) => ({ slotInstanceId: `slot:${slotTemplateId}`, slotTemplateId, scopeKey: "global", status: "unknown" }));
}
export function slotRegistryCoverageProof({ authority }) {
  const state = assertAuthority(authority);
  const registry = state.registries.slotRegistry;
  const templates = new Map(registry.slotTemplates.map((item) => [item.slotTemplateId, item]));
  const errors = [];
  if (registry.registryVersion !== REGISTRY_VERSION_SET.slotTemplate || registry.semanticRegistryVersion !== REGISTRY_VERSION_SET.coreUserValuePattern) errors.push("registry_version_mismatch");
  if (UNIVERSAL_SLOT_TEMPLATES.some((id) => templates.get(id)?.slotClass !== "universal")) errors.push("missing_universal");
  for (const pattern of registry.coreUserValuePatterns) if (!pattern.requiredSlotTemplateIds.length || pattern.requiredSlotTemplateIds.some((id) => templates.get(id)?.slotClass !== "core_value_pattern")) errors.push(`uncovered_pattern:${pattern.coreUserValuePatternId}`);
  const expected = expectedSlotIds(state);
  if (!expected) errors.push("unmapped_pattern");
  return { registryVersion: registry.registryVersion, semanticRegistryVersion: registry.semanticRegistryVersion, coreUserValuePatternIds: uniqueSorted(state.coreUserValueMapping?.patternIds), errors, complete: errors.length === 0 };
}
export function capabilityCoverageProof({ authority, requirementFingerprint: suppliedFingerprint = null }) {
  const state = assertAuthority(authority);
  const currentFingerprint = requirementFingerprint({ authority });
  const registryProof = slotRegistryCoverageProof({ authority });
  const expected = generateCapabilitySlots({ authority });
  const unknownBlockingSlotIds = expected.filter(({ slotInstanceId }) => !state.slots.has(slotInstanceId)).map(({ slotInstanceId }) => slotInstanceId);
  const provisionalBlockingCapabilityIds = [...state.capabilities.values()].filter((item) => item.currentness === "current" && item.blocking && item.provisional).map((item) => item.id).sort();
  return { requirementFingerprint: currentFingerprint, slotRegistryCoverageProofId: hash(registryProof), slotInstanceIds: expected.map((item) => item.slotInstanceId), unknownBlockingSlotIds, provisionalBlockingCapabilityIds, complete: (!suppliedFingerprint || suppliedFingerprint === currentFingerprint) && registryProof.complete && !unknownBlockingSlotIds.length && !provisionalBlockingCapabilityIds.length };
}
export function genericEnvelope({ behaviorFamily, baselineEvaluated, blockingDecisionMapped, unresolvedGapBlocking }) {
  return { behaviorFamily, completionContribution: false, mayPromoteToCapability: GenericBehaviorFamily.includes(behaviorFamily) && baselineEvaluated === true && blockingDecisionMapped === true && unresolvedGapBlocking === false };
}

export function classifyRequirement({ impacts = {}, aiCandidate = null }) {
  const axis = ["productVisibleState", "actorOperation", "requiredOutput", "dataBoundary", "primaryFlow", "externalConsequence"].find((key) => impacts[key] === true);
  return axis ? { classification: "product_requirement", resolverRuleId: `classification:${axis}`, provisional: false } : { classification: aiCandidate ? "implementation_proposal" : "implementation_constraint", resolverRuleId: "classification:non_product", provisional: Boolean(aiCandidate) };
}
export function resolveDelegation({ candidates = [], valueSchemaValid, inScope, coreInvariantSafe, noBlockingConflict, introducesCapability, expandsExternalConsequence, expandsDataBoundary }) {
  const safe = valueSchemaValid && inScope && coreInvariantSafe && noBlockingConflict && !introducesCapability && !expandsExternalConsequence && !expandsDataBoundary;
  return safe && candidates.length === 1 ? { settled: true, value: candidates[0], reason: "unique_safe_default" } : { settled: false, value: null, reason: !safe ? "boundary_violation" : candidates.length ? "ambiguous_safe_default" : "no_safe_default" };
}
export function resolveCriticality({ authority, decisionInstanceId, requirementFingerprint: suppliedFingerprint = null }) {
  const state = assertAuthority(authority);
  const decision = state.decisions.get(decisionInstanceId);
  const revision = decision && state.revisions.get(decision.revisionId);
  const rule = revision && state.registries.criticalityRules.find((item) => item.ruleId === revision.criticalityRuleId);
  const currentFingerprint = requirementFingerprint({ authority });
  const blocking = Boolean(rule) && (!suppliedFingerprint || suppliedFingerprint === currentFingerprint) && rule.blockingWhenAny.some((key) => revision.effects?.[key] === true);
  return { decisionInstanceId, blocking, resolverRuleId: rule?.ruleId ?? "criticality:no_registered_rule", requirementFingerprint: currentFingerprint };
}

const semanticCapability = (item) => ({ id: item.id, capabilityTypeId: item.capabilityTypeId, parentCapabilityInstanceId: item.parentCapabilityInstanceId, managedObjectIds: uniqueSorted(item.managedObjectIds), actorIds: uniqueSorted(item.actorIds), phaseKindId: item.phaseKindId, scopeKey: item.scopeKey, blocking: item.blocking, provisional: item.provisional, currentness: item.currentness });
const semanticDecision = (state, item) => ({ id: item.id, revision: state.revisions.get(item.revisionId) ? semanticRevision(state.revisions.get(item.revisionId)) : null, scopeKey: item.scopeKey, settlement: item.settlement, currentness: item.currentness });
const semanticRevision = (item) => ({ revisionId: item.revisionId, decisionInstanceId: item.decisionInstanceId, value: item.value, authority: item.authority, confirmation: item.confirmation, currentness: item.currentness, evidenceEdgeIds: uniqueSorted(item.evidenceEdgeIds), dependsOnRevisionIds: uniqueSorted(item.dependsOnRevisionIds), supersedesRevisionId: item.supersedesRevisionId, classification: item.classification, scopeKey: item.scopeKey, valueSchemaId: item.valueSchemaId, criticalityRuleId: item.criticalityRuleId, effects: stable(item.effects), settlement: item.settlement });
export function requirementFingerprint({ authority }) {
  const state = assertAuthority(authority);
  return hash({
    coreUserValue: state.coreUserValue,
    actors: [...state.actors.values()].filter((item) => item.currentness === "current").map((item) => stable(item)).sort((a, b) => a.id.localeCompare(b.id)),
    managedObjects: [...state.managedObjects.values()].filter((item) => item.currentness === "current").map((item) => stable(item)).sort((a, b) => a.id.localeCompare(b.id)),
    activeCapabilities: [...state.capabilities.values()].filter((item) => item.currentness === "current").map(semanticCapability).sort((a, b) => a.id.localeCompare(b.id)),
    currentTraits: [...state.traits.values()].filter((item) => item.currentness === "current").map((item) => stable(item)).sort((a, b) => a.id.localeCompare(b.id)),
    currentDecisions: [...state.decisions.values()].filter((item) => item.currentness === "current").map((item) => semanticDecision(state, item)).sort((a, b) => a.id.localeCompare(b.id)),
    openBlockingIssues: [...state.openBlockingIssues.values()].filter((item) => item.currentness === "current").map((item) => stable(item)).sort((a, b) => a.id.localeCompare(b.id)),
    registryVersions: state.registries.registryVersionSet,
  });
}
const semanticClaim = (item) => ({ claimId: item.claimId, claimTypeId: item.claimTypeId, sourceIds: uniqueSorted(item.sourceIds), scopeKey: item.scopeKey, currentness: item.currentness, evidenceEdgeIds: uniqueSorted(item.evidenceEdgeIds) });
export function claimSetFingerprint({ authority }) {
  const state = assertAuthority(authority);
  return hash({ requirementFingerprint: requirementFingerprint({ authority }), claims: [...state.claims.values()].filter((item) => item.currentness === "current").map(semanticClaim).sort((a, b) => a.claimId.localeCompare(b.claimId)), claimTypeRegistryVersion: REGISTRY_VERSION_SET.claimType });
}
export function completionCandidateFingerprint({ authority, auditId }) {
  return hash({ requirementFingerprint: requirementFingerprint({ authority }), claimSetFingerprint: claimSetFingerprint({ authority }), finalCoverageAuditId: auditId });
}

function requiredSources(state) {
  const result = [];
  for (const item of state.capabilities.values()) if (item.currentness === "current" && item.blocking) result.push({ kind: "capability", id: item.id, scopeKey: item.scopeKey });
  for (const item of state.decisions.values()) {
    const revision = state.revisions.get(item.revisionId);
    if (item.currentness === "current" && revision?.currentness === "current" && revision.classification === "product_requirement" && ["settled", "delegated"].includes(revision.settlement)) result.push({ kind: "decision", id: item.id, scopeKey: item.scopeKey });
  }
  for (const item of state.coreInvariants.values()) if (item.currentness === "current") result.push({ kind: "core_invariant", id: item.id, scopeKey: item.scopeKey });
  for (const item of state.primaryFlows.values()) if (item.currentness === "current") result.push({ kind: "primary_flow", id: item.id, scopeKey: item.scopeKey });
  return result;
}
function findRequiredSource(state, id) { return requiredSources(state).find((item) => item.id === id) ?? null; }
export function claimCoverageProof({ authority }) {
  const state = assertAuthority(authority);
  const sources = requiredSources(state);
  const entries = sources.map((source) => {
    const representedByClaimIds = [...state.claims.values()].filter((candidate) => candidate.currentness === "current" && candidate.sourceIds.includes(source.id) && candidate.scopeKey === source.scopeKey && candidate.evidenceEdgeIds.every((edgeId) => evidenceValidation(state, state.evidenceEdges.get(edgeId) ?? {}).accepted)).map((candidate) => candidate.claimId).sort();
    return { sourceKind: source.kind, sourceId: source.id, representedByClaimIds, explicitlyNoClaimReason: null };
  });
  const uncoveredBlockingSourceIds = entries.filter((entry) => !entry.representedByClaimIds.length).map((entry) => entry.sourceId);
  return { claimSetFingerprint: claimSetFingerprint({ authority }), entries, uncoveredBlockingSourceIds, invalidNoClaimReasonIds: [], complete: !uncoveredBlockingSourceIds.length && entries.length > 0 };
}

export function auditTerminalState({ authority, auditId, requirementFingerprint: suppliedFingerprint = null }) {
  const state = assertAuthority(authority);
  const audit = state.audits.get(auditId);
  const currentFingerprint = requirementFingerprint({ authority });
  if (!audit || audit.currentness !== "current") return { state: "not_run", rejectedGapFingerprints: [] };
  if (suppliedFingerprint && suppliedFingerprint !== currentFingerprint) return { state: "stale", rejectedGapFingerprints: audit.rejectedGapFingerprints };
  if (audit.requirementFingerprint !== currentFingerprint) return { state: "stale", rejectedGapFingerprints: audit.rejectedGapFingerprints };
  if (!audit.executed || !audit.completed || audit.outcome !== "passed") return { state: audit.attempts >= audit.maxAttempts ? "inconclusive_limit_reached" : "failed_retryable", rejectedGapFingerprints: audit.rejectedGapFingerprints };
  return { state: "passed", rejectedGapFingerprints: audit.rejectedGapFingerprints };
}

export function validateArtifactDag(edges) {
  const allowedKinds = new Set(["semantic", "scope", "classification", "grounding", "coverage", "generation"]);
  const adjacency = new Map(); const nodes = new Set();
  for (const edge of edges) {
    if (!edge.fromArtifactKind || !edge.fromArtifactId || !edge.toArtifactKind || !edge.toArtifactId || !allowedKinds.has(edge.dependencyKind)) throw new Error("invalid artifact dependency edge");
    const from = `${edge.fromArtifactKind}:${edge.fromArtifactId}`; const to = `${edge.toArtifactKind}:${edge.toArtifactId}`;
    nodes.add(from); nodes.add(to); adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  const visiting = new Set(); const visited = new Set();
  const visit = (node) => { if (visiting.has(node)) throw new Error("artifact dependency cycle"); if (visited.has(node)) return; visiting.add(node); for (const next of adjacency.get(node) ?? []) visit(next); visiting.delete(node); visited.add(node); };
  for (const node of nodes) visit(node); return true;
}
export function propagateStaleTransaction({ authority, changedArtifactId, reevaluate = () => true }) {
  const state = assertAuthority(authority);
  validateArtifactDag(state.dependencyEdges);
  if (!state.artifacts.has(changedArtifactId)) throw new Error("unknown changed artifact");
  const downstream = new Map();
  for (const edge of state.dependencyEdges) { const from = `${edge.fromArtifactKind}:${edge.fromArtifactId}`; const to = `${edge.toArtifactKind}:${edge.toArtifactId}`; downstream.set(from, [...(downstream.get(from) ?? []), to]); }
  const stale = new Set([changedArtifactId]); const queue = [changedArtifactId];
  while (queue.length) for (const next of downstream.get(queue.shift()) ?? []) if (!stale.has(next)) { stale.add(next); queue.push(next); }
  const staged = new Map([...state.artifacts].map(([key, value]) => [key, { ...value }]));
  for (const id of stale) staged.set(id, { ...staged.get(id), currentness: "stale" });
  if (reevaluate([...stale]) !== true) throw new Error("stale propagation reevaluation failed");
  state.artifacts = staged;
  return [...stale].sort();
}

export function validateSpecClaimConformance({ authority, specElements = [] }) {
  const state = assertAuthority(authority);
  const currentClaims = new Set([...state.claims.values()].filter((item) => item.currentness === "current" && item.evidenceEdgeIds.every((edgeId) => evidenceValidation(state, state.evidenceEdges.get(edgeId) ?? {}).accepted)).map((item) => item.claimId));
  const invalid = specElements.filter((element) => REQUIRED_SPEC_ELEMENT_KINDS.includes(element.kind) && (!Array.isArray(element.sourceClaimIds) || !element.sourceClaimIds.length || element.sourceClaimIds.some((id) => !currentClaims.has(id)))).map((element) => element.id);
  return { invalidElementIds: invalid, complete: invalid.length === 0 && specElements.some((element) => REQUIRED_SPEC_ELEMENT_KINDS.includes(element.kind)) };
}

export function finalCompletionProof({ authority, auditId, specElements = [] }) {
  assertAuthority(authority);
  const requirementFp = requirementFingerprint({ authority });
  const capability = capabilityCoverageProof({ authority, requirementFingerprint: requirementFp });
  const claims = claimCoverageProof({ authority });
  const audit = auditTerminalState({ authority, auditId, requirementFingerprint: requirementFp });
  const spec = validateSpecClaimConformance({ authority, specElements });
  const claimGrounding = claims.complete;
  const complete = capability.complete && claims.complete && claimGrounding && audit.state === "passed" && spec.complete;
  return deepFreeze({ completionCandidateFingerprint: completionCandidateFingerprint({ authority, auditId }), requirementFingerprint: requirementFp, capabilityCoverageComplete: capability.complete, claimCoverageComplete: claims.complete, claimGroundingComplete: claimGrounding, auditState: audit.state, specClaimConformanceComplete: spec.complete, complete });
}

export function migrateV4Context({ authority, snapshotId }) {
  const state = assertAuthority(authority);
  const snapshot = state.legacySnapshots.get(snapshotId);
  if (!snapshot) throw new Error("unknown authoritative legacy snapshot");
  const adapter = state.registries.migrationAdapters.find((item) => item.adapterId === snapshot.adapterId && item.sourceContextVersion === snapshot.sourceContextVersion);
  if (!adapter) throw new Error("incompatible legacy adapter");
  const sourceFactFingerprint = hash(snapshot.facts);
  const migrationId = hash({ sourceFactFingerprint, target: "v5", registryVersionSet: state.registries.registryVersionSet });
  const existing = state.migrations.get(migrationId);
  if (existing) return { record: structuredClone(existing), projection: structuredClone(existing.projection), created: false };
  for (const [id, record] of state.migrations) if (record.sourceFactFingerprint === sourceFactFingerprint && record.migrationStatus === "completed") state.migrations.set(id, { ...record, migrationStatus: "superseded", currentness: "superseded" });
  const projection = { userConfirmedRevisions: snapshot.facts.filter((fact) => fact.source === "user_confirmed").map((fact) => ({ revisionId: fact.revisionId ?? fact.key, value: fact.value, authority: "user", confirmation: "explicitly_confirmed" })), legacyGeneratedArtifacts: [] };
  const record = { migrationId, sourceContextVersion: snapshot.sourceContextVersion, targetContextVersion: "v5", sourceFactFingerprint, registryVersionSet: state.registries.registryVersionSet, migrationStatus: "completed", currentness: "current", migrationWarnings: [], projection };
  state.migrations.set(migrationId, record);
  return { record: structuredClone(record), projection: structuredClone(projection), created: true };
}
export function currentMigrationProjection({ authority, sourceFactFingerprint }) {
  const state = assertAuthority(authority);
  const current = [...state.migrations.values()].find((item) => item.sourceFactFingerprint === sourceFactFingerprint && item.currentness === "current" && item.migrationStatus === "completed");
  return current ? structuredClone(current.projection) : null;
}

export function createDecisionLedger() { return { revisions: new Map(), heads: new Map() }; }
export function appendDecisionRevision(ledger, revision, { expectedCurrentRevisionId = null } = {}) {
  const head = ledger.heads.get(revision.decisionInstanceId) ?? null;
  if (head !== expectedCurrentRevisionId || revision.currentness !== "current" || (revision.supersedesRevisionId && revision.supersedesRevisionId !== head) || revision.supersedesRevisionId === revision.revisionId || ledger.revisions.has(revision.revisionId)) throw new Error("invalid decision revision commit");
  if (head) ledger.revisions.set(head, { ...ledger.revisions.get(head), currentness: "superseded" });
  ledger.revisions.set(revision.revisionId, { ...revision, evidenceEdgeIds: uniqueSorted(revision.evidenceEdgeIds), dependsOnRevisionIds: uniqueSorted(revision.dependsOnRevisionIds) }); ledger.heads.set(revision.decisionInstanceId, revision.revisionId); return revision;
}
export function decisionProjection(ledger, instanceId, owningCapabilityActive = true) {
  const revision = ledger.revisions.get(ledger.heads.get(instanceId)); if (!owningCapabilityActive) return "inactive"; if (!revision) return "unresolved"; if (revision.currentness === "stale" || (revision.dependsOnRevisionIds ?? []).some((id) => ledger.revisions.get(id)?.currentness === "stale")) return "stale"; return revision.authority === "delegated_to_system" ? "delegated" : "settled";
}
export function createTraitLedger() { return { revisions: new Map(), heads: new Map() }; }
export function appendTraitAssertion(ledger, assertion) {
  const scope = `${assertion.traitId}:${assertion.scopeKey}`; const head = ledger.heads.get(scope);
  if (assertion.currentness !== "current" || assertion.status === "superseded" || ledger.revisions.has(assertion.revisionId) || (assertion.supersedesAssertionId && assertion.supersedesAssertionId !== head)) throw new Error("invalid trait assertion commit");
  if (head) ledger.revisions.set(head, { ...ledger.revisions.get(head), currentness: "superseded", status: "superseded" });
  ledger.revisions.set(assertion.revisionId, { ...assertion, evidenceEdgeIds: uniqueSorted(assertion.evidenceEdgeIds) }); ledger.heads.set(scope, assertion.revisionId); return assertion;
}
