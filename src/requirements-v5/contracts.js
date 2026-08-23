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
const TRUSTED_ENVELOPES = new WeakMap();
const TRUSTED_ORIGINS = new Set(["initial_input_adapter", "user_answer_adapter", "user_confirmation_adapter", "registered_rule_engine", "registered_audit_executor", "registered_migration_adapter"]);
const issueTrustedEnvelope = (origin, command) => {
  if (!TRUSTED_ORIGINS.has(origin)) throw new Error("unregistered command origin");
  const envelope = Object.freeze({ origin, command: Object.freeze({ ...command }) });
  TRUSTED_ENVELOPES.set(envelope, { origin, command: envelope.command });
  return envelope;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
export const trustedAdapters = Object.freeze({
  initialInput: ({ revisionId, value }) => issueTrustedEnvelope("initial_input_adapter", { type: "set_core_user_value", revisionId, value }),
  userAnswer: ({ revisionId, value, evidenceText, scopeKey, decisionInstanceId = null, supersedesRevisionId = null }) => issueTrustedEnvelope("user_answer_adapter", { type: "add_revision", revisionId, value, evidenceText, scopeKey, decisionInstanceId, supersedesRevisionId, authority: "user", confirmation: "explicitly_confirmed", classification: "product_requirement", kind: "answer", valueSchemaId: "enum" }),
  userConfirmation: ({ revisionId, value, evidenceText, scopeKey, decisionInstanceId = null, supersedesRevisionId = null }) => issueTrustedEnvelope("user_confirmation_adapter", { type: "add_revision", revisionId, value, evidenceText, scopeKey, decisionInstanceId, supersedesRevisionId, authority: "user", confirmation: "explicitly_confirmed", classification: "product_requirement", kind: "confirmation", valueSchemaId: "enum" }),
  // These are intentionally the only command factories exposed for registered
  // engines.  They do not accept caller-supplied authority, settlement,
  // criticality, audit outcome, or migration facts as a conclusion.
  ruleEngine: Object.freeze({
    mapCoreUserValue: ({ patternIds }) => issueTrustedEnvelope("registered_rule_engine", { type: "map_core_user_value", patternIds }),
    target: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_target", ...input }),
    evidence: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_evidence", ...input }),
    capability: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_capability", ...input }),
    decision: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_decision", ...input }),
    source: (input) => issueTrustedEnvelope("registered_rule_engine", { type: input.kind === "primary_flow" ? "add_primary_flow" : "add_core_invariant", ...input }),
    settleSlot: ({ slotTemplateId, evidenceEdgeId }) => issueTrustedEnvelope("registered_rule_engine", { type: "settle_slot", slotTemplateId, evidenceEdgeId }),
    claim: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_claim", ...input }),
    conflict: ({ id, sourceIds = [] }) => issueTrustedEnvelope("registered_rule_engine", { type: "record_blocking_conflict", id, sourceIds }),
    graphFixpoint: () => issueTrustedEnvelope("registered_rule_engine", { type: "mark_graph_fixpoint" }),
    artifact: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_artifact", ...input }),
    dependency: (input) => issueTrustedEnvelope("registered_rule_engine", { type: "add_dependency", ...input }),
  }),
  auditExecutor: Object.freeze({
    completed: ({ auditId, executorId, auditRuleId, executionId, executorVersion, requirementFingerprint, gapEvaluation }) => issueTrustedEnvelope("registered_audit_executor", { type: "record_audit_execution", auditId, executorId, auditRuleId, executionId, executorVersion, requirementFingerprint, gapEvaluation }),
  }),
  migrationAdapter: Object.freeze({
    v4Export: ({ snapshotId, adapterId, adapterVersion, sourceContextVersion, sourceFingerprint, compatibleRegistryVersions, exportProof }) => issueTrustedEnvelope("registered_migration_adapter", { type: "register_legacy_snapshot", snapshotId, adapterId, adapterVersion, sourceContextVersion, sourceFingerprint, compatibleRegistryVersions, exportProof }),
  }),
});
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
  decisionHeads: new Map(),
  graphFixpoint: false,
  auditExecutions: new Map(),
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
  const trusted = TRUSTED_ENVELOPES.get(command);
  if (!trusted || !TRUSTED_ORIGINS.has(trusted.origin)) throw new Error("untrusted authority command");
  command = trusted.command;
  const requireOrigin = (...origins) => {
    if (!origins.includes(trusted.origin)) throw new Error("command origin is not authorized for this fact");
  };
  switch (command.type) {
    case "set_core_user_value": {
      requireOrigin("initial_input_adapter");
      if (!command.revisionId || typeof command.value !== "string") throw new Error("invalid core user value");
      const sourceRevisionId = `source:${command.revisionId}`;
      if (state.revisions.has(sourceRevisionId)) throw new Error("core user value source already exists");
      state.revisions.set(sourceRevisionId, { revisionId: sourceRevisionId, decisionInstanceId: null, value: command.value, authority: "user", confirmation: "explicitly_confirmed", currentness: "current", evidenceEdgeIds: [], dependsOnRevisionIds: [], supersedesRevisionId: null, kind: "answer", classification: "product_requirement", scopeKey: "core_user_value", evidenceText: command.value, valueSchemaId: "enum", criticalityRuleId: null, effects: {}, settlement: null, sourceKind: "initial_input" });
      state.targets.set(`target:${command.revisionId}`, { id: `target:${command.revisionId}`, kind: "requirement", classification: "product_requirement", scopeKey: "core_user_value", valueSchemaId: "enum", currentness: "current" });
      const edge = { edgeId: `evidence:${command.revisionId}`, sourceRevisionId, targetId: `target:${command.revisionId}`, relation: "explicitly_states", targetScopeKey: "core_user_value", evidenceSpan: command.value, derivationDepth: 0, parentEdgeId: null, entailmentRuleId: null, transformId: null, excludesEdgeId: null, currentness: "current" };
      if (!evidenceValidation(state, edge).accepted) throw new Error("core user value source is not grounded");
      state.evidenceEdges.set(edge.edgeId, edge);
      state.coreUserValue = { revisionId: command.revisionId, sourceRevisionId, evidenceEdgeId: edge.edgeId, value: command.value, currentness: "current" };
      return;
    }
    case "map_core_user_value": {
      requireOrigin("registered_rule_engine");
      const patternIds = uniqueSorted(command.patternIds);
      const known = new Set(state.registries.slotRegistry.coreUserValuePatterns.map((item) => item.coreUserValuePatternId));
      const cv = state.coreUserValue;
      if (!cv || !state.evidenceEdges.get(cv.evidenceEdgeId) || !evidenceValidation(state, state.evidenceEdges.get(cv.evidenceEdgeId)).accepted || !patternIds.length || patternIds.some((id) => !known.has(id))) throw new Error("invalid core user value mapping");
      state.coreUserValueMapping = { status: "mapped", patternIds, coreUserValueRevisionId: cv.revisionId, groundingEvidenceEdgeId: cv.evidenceEdgeId };
      return;
    }
    case "add_actor": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.actorTypeId) throw new Error("invalid actor");
      state.actors.set(command.id, { id: command.id, actorTypeId: command.actorTypeId, scopeKey: command.scopeKey ?? null, currentness: "current" });
      return;
    }
    case "add_managed_object": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.objectTypeId) throw new Error("invalid managed object");
      state.managedObjects.set(command.id, { id: command.id, objectTypeId: command.objectTypeId, parentId: command.parentId ?? null, currentness: "current" });
      return;
    }
    case "add_revision": {
      requireOrigin("user_answer_adapter", "user_confirmation_adapter");
      if (!command.revisionId || state.revisions.has(command.revisionId) || !RequirementClassification.includes(command.classification) || !command.evidenceText || !command.scopeKey) throw new Error("invalid user source revision");
      const head = command.decisionInstanceId ? state.decisionHeads.get(command.decisionInstanceId) ?? null : null;
      if (command.decisionInstanceId && command.supersedesRevisionId && command.supersedesRevisionId !== head) throw new Error("decision optimistic concurrency conflict");
      if (command.decisionInstanceId && !command.supersedesRevisionId && head) throw new Error("decision current revision already exists");
      if (head) {
        state.revisions.set(head, { ...state.revisions.get(head), currentness: "superseded" });
        const artifactId = `revision:${head}`;
        if (state.artifacts.has(artifactId)) propagateStaleTransaction({ authority, changedArtifactId: artifactId });
      }
      const revision = { revisionId: command.revisionId, decisionInstanceId: command.decisionInstanceId ?? null, value: command.value, authority: "user", confirmation: "explicitly_confirmed", currentness: "current", evidenceEdgeIds: [], dependsOnRevisionIds: [], supersedesRevisionId: head, kind: trusted.origin === "user_answer_adapter" ? "answer" : "confirmation", classification: "product_requirement", scopeKey: command.scopeKey, evidenceText: command.evidenceText, valueSchemaId: "enum", criticalityRuleId: null, effects: {}, settlement: null, sourceKind: trusted.origin };
      state.revisions.set(command.revisionId, revision);
      if (command.decisionInstanceId) state.decisionHeads.set(command.decisionInstanceId, command.revisionId);
      state.artifacts.set(`revision:${command.revisionId}`, { id: command.revisionId, kind: "revision", currentness: "current", blocking: true });
      return;
    }
    case "add_target": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.kind || !RequirementClassification.includes(command.classification)) throw new Error("invalid target");
      state.targets.set(command.id, { id: command.id, kind: command.kind, classification: command.classification, scopeKey: command.scopeKey ?? null, valueSchemaId: command.valueSchemaId ?? null, slotTemplateId: command.slotTemplateId ?? null, currentness: "current" });
      return;
    }
    case "add_evidence": {
      requireOrigin("registered_rule_engine");
      if (!command.edgeId || state.evidenceEdges.has(command.edgeId)) throw new Error("invalid evidence edge");
      const edge = { edgeId: command.edgeId, sourceRevisionId: command.sourceRevisionId, targetId: command.targetId, relation: command.relation, targetScopeKey: command.targetScopeKey ?? null, evidenceSpan: command.evidenceSpan, derivationDepth: command.derivationDepth, parentEdgeId: command.parentEdgeId ?? null, entailmentRuleId: command.entailmentRuleId ?? null, transformId: command.transformId ?? null, excludesEdgeId: command.excludesEdgeId ?? null, currentness: "current" };
      const result = evidenceValidation(state, edge);
      if (!result.accepted) throw new Error(`invalid evidence: ${result.reason}`);
      state.evidenceEdges.set(edge.edgeId, edge);
      return;
    }
    case "add_capability": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.capabilityTypeId) throw new Error("invalid capability");
      if (!command.groundingTargetId || !state.targets.has(command.groundingTargetId)) throw new Error("capability requires registered grounding target");
      state.capabilities.set(command.id, { id: command.id, capabilityTypeId: command.capabilityTypeId, parentCapabilityInstanceId: command.parentCapabilityInstanceId ?? null, managedObjectIds: uniqueSorted(command.managedObjectIds), actorIds: uniqueSorted(command.actorIds), phaseKindId: command.phaseKindId ?? null, scopeKey: command.scopeKey ?? null, groundingTargetId: command.groundingTargetId, currentness: "current", blocking: true, provisional: command.provisional === true });
      state.artifacts.set(`capability:${command.id}`, { id: command.id, kind: "capability", currentness: "current", blocking: true });
      return;
    }
    case "add_decision": {
      requireOrigin("registered_rule_engine");
      const revision = state.revisions.get(command.revisionId);
      if (!revision || revision.currentness !== "current" || revision.classification !== "product_requirement") throw new Error("invalid decision source revision");
      if (state.decisions.has(command.id) || !command.groundingTargetId || !state.targets.has(command.groundingTargetId)) throw new Error("invalid decision target");
      const decisionInstance = revision.decisionInstanceId;
      if (decisionInstance && state.decisionHeads.get(decisionInstance) !== revision.revisionId) throw new Error("decision does not reference current revision");
      state.decisions.set(command.id, { id: command.id, revisionId: revision.revisionId, scopeKey: revision.scopeKey, groundingTargetId: command.groundingTargetId, settlement: "settled", currentness: "current" });
      state.artifacts.set(`decision:${command.id}`, { id: command.id, kind: "decision", currentness: "current", blocking: true });
      state.dependencyEdges.push({ fromArtifactKind: "revision", fromArtifactId: revision.revisionId, toArtifactKind: "decision", toArtifactId: command.id, dependencyKind: "semantic" });
      return;
    }
    case "add_trait": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !TraitAssertionStatus.includes(command.status)) throw new Error("invalid trait");
      state.traits.set(command.id, { id: command.id, traitId: command.traitId, scopeKey: command.scopeKey ?? null, status: command.status, value: command.value, currentness: "current", evidenceEdgeIds: uniqueSorted(command.evidenceEdgeIds) });
      return;
    }
    case "add_core_invariant":
    case "add_primary_flow": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.scopeKey) throw new Error("invalid required source");
      const target = command.type === "add_core_invariant" ? state.coreInvariants : state.primaryFlows;
      if (!command.groundingTargetId || !state.targets.has(command.groundingTargetId)) throw new Error("required source needs grounding target");
      target.set(command.id, { id: command.id, scopeKey: command.scopeKey, groundingTargetId: command.groundingTargetId, currentness: "current", evidenceEdgeIds: uniqueSorted(command.evidenceEdgeIds) });
      state.artifacts.set(`${command.type === "add_core_invariant" ? "core_invariant" : "primary_flow"}:${command.id}`, { id: command.id, kind: command.type === "add_core_invariant" ? "core_invariant" : "primary_flow", currentness: "current", blocking: true });
      return;
    }
    case "settle_slot": {
      requireOrigin("registered_rule_engine");
      const expected = expectedSlotIds(state);
      if (!expected?.includes(command.slotTemplateId)) throw new Error("unknown slot");
      const slotId = `slot:${command.slotTemplateId}`;
      if (!command.evidenceEdgeId) throw new Error("slot settlement requires evidence");
      const edge = state.evidenceEdges.get(command.evidenceEdgeId);
      if (!edge || !evidenceValidation(state, edge).accepted) throw new Error("invalid slot evidence");
      if (state.targets.get(edge.targetId)?.slotTemplateId !== command.slotTemplateId) throw new Error("slot evidence target does not match slot template");
      state.slots.set(slotId, { slotInstanceId: slotId, slotTemplateId: command.slotTemplateId, status: "satisfied", evidenceEdgeId: command.evidenceEdgeId, ruleId: "grounded_evidence", currentness: "current" });
      return;
    }
    case "add_claim": {
      requireOrigin("registered_rule_engine");
      const type = state.registries.claimTypes.find((item) => item.claimTypeId === command.claimTypeId && item.required === true);
      if (!type || !command.claimId || !command.sourceId || !command.evidenceEdgeId) throw new Error("invalid claim");
      const source = findRequiredSource(state, command.sourceId);
      if (!source || !type.sourceKinds.includes(source.kind) || source.scopeKey !== command.scopeKey) throw new Error("claim source mismatch");
      const edge = state.evidenceEdges.get(command.evidenceEdgeId);
      if (!edge || !evidenceValidation(state, edge).accepted) throw new Error("claim requires current grounded evidence");
      const sourceTargetId = source.kind === "capability" ? state.capabilities.get(source.id)?.groundingTargetId : source.kind === "decision" ? state.decisions.get(source.id)?.groundingTargetId : source.kind === "core_invariant" ? state.coreInvariants.get(source.id)?.groundingTargetId : state.primaryFlows.get(source.id)?.groundingTargetId;
      if (!sourceTargetId || edge.targetId !== sourceTargetId) throw new Error("claim evidence does not ground its source target");
      state.claims.set(command.claimId, { claimId: command.claimId, claimTypeId: command.claimTypeId, sourceIds: [command.sourceId], scopeKey: command.scopeKey, currentness: "current", evidenceEdgeIds: [command.evidenceEdgeId] });
      state.artifacts.set(`claim:${command.claimId}`, { id: command.claimId, kind: "claim", currentness: "current", blocking: true });
      const sourceArtifactKind = source.kind;
      const sourceArtifactId = `${sourceArtifactKind}:${source.id}`;
      if (state.artifacts.has(sourceArtifactId)) state.dependencyEdges.push({ fromArtifactKind: sourceArtifactKind, fromArtifactId: source.id, toArtifactKind: "claim", toArtifactId: command.claimId, dependencyKind: "grounding" });
      return;
    }
    case "record_audit_execution": {
      requireOrigin("registered_audit_executor");
      const currentFp = requirementFingerprint({ authority });
      const executor = state.registries.auditExecutors.some((item) => item.executorId === command.executorId);
      const rule = state.registries.auditRules.some((item) => item.auditRuleId === command.auditRuleId);
      if (!executor || !rule || command.requirementFingerprint !== currentFp || !command.executionId || !command.executorVersion || !command.gapEvaluation || command.gapEvaluation.complete !== true || command.gapEvaluation.errorKinds?.length || command.gapEvaluation.proposedGapFingerprint) throw new Error("invalid completed audit execution");
      const record = { auditId: command.auditId, executorId: command.executorId, auditRuleId: command.auditRuleId, executionId: command.executionId, executorVersion: command.executorVersion, requirementFingerprint: currentFp, attempts: 1, maxAttempts: 1, executed: true, completed: true, outcome: "passed", currentness: "current", rejectedGapFingerprints: uniqueSorted(command.gapEvaluation.rejectedGapFingerprints) };
      state.auditExecutions.set(command.executionId, { executionId: command.executionId, executorId: command.executorId, executorVersion: command.executorVersion, completed: true, requirementFingerprint: currentFp });
      state.audits.set(command.auditId, record);
      return;
    }
    case "add_artifact": {
      requireOrigin("registered_rule_engine");
      if (!command.id || !command.kind) throw new Error("invalid artifact");
      state.artifacts.set(`${command.kind}:${command.id}`, { id: command.id, kind: command.kind, currentness: "current" });
      return;
    }
    case "add_dependency": {
      requireOrigin("registered_rule_engine");
      const edge = { fromArtifactKind: command.fromArtifactKind, fromArtifactId: command.fromArtifactId, toArtifactKind: command.toArtifactKind, toArtifactId: command.toArtifactId, dependencyKind: command.dependencyKind };
      validateArtifactDag([...state.dependencyEdges, edge]);
      state.dependencyEdges.push(edge);
      return;
    }
    case "register_legacy_snapshot": {
      requireOrigin("registered_migration_adapter");
      const adapter = state.registries.migrationAdapters.find((item) => item.adapterId === command.adapterId && item.sourceContextVersion === command.sourceContextVersion);
      if (!adapter || !command.snapshotId || !command.adapterVersion || !command.sourceFingerprint || !command.exportProof || !Array.isArray(command.compatibleRegistryVersions) || !command.compatibleRegistryVersions.includes(REGISTRY_VERSION_SET.slotTemplate)) throw new Error("untrusted legacy snapshot");
      const snapshot = { snapshotId: command.snapshotId, adapterId: command.adapterId, adapterVersion: command.adapterVersion, sourceContextVersion: command.sourceContextVersion, sourceFingerprint: command.sourceFingerprint, compatibleRegistryVersions: uniqueSorted(command.compatibleRegistryVersions), exportProof: command.exportProof };
      state.legacySnapshots.set(snapshot.snapshotId, snapshot);
      return snapshot.snapshotId;
    }
    case "mark_graph_fixpoint": {
      requireOrigin("registered_rule_engine");
      state.graphFixpoint = true;
      return;
    }
    case "record_blocking_conflict": {
      requireOrigin("registered_rule_engine");
      if (!command.id || state.openBlockingIssues.has(command.id)) throw new Error("invalid blocking conflict");
      state.openBlockingIssues.set(command.id, { id: command.id, sourceIds: uniqueSorted(command.sourceIds), currentness: "current" });
      return;
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
    if (item.currentness === "current" && revision?.currentness === "current" && revision.classification === "product_requirement" && ["settled", "delegated"].includes(item.settlement)) result.push({ kind: "decision", id: item.id, scopeKey: item.scopeKey });
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
  const provisional = provisionalCompletionProof({ authority });
  const capability = capabilityCoverageProof({ authority, requirementFingerprint: requirementFp });
  const claims = claimCoverageProof({ authority });
  const audit = auditTerminalState({ authority, auditId, requirementFingerprint: requirementFp });
  const spec = validateSpecClaimConformance({ authority, specElements });
  const claimGrounding = claims.complete;
  const complete = provisional.complete && capability.complete && claims.complete && claimGrounding && audit.state === "passed" && spec.complete;
  return deepFreeze({ completionCandidateFingerprint: completionCandidateFingerprint({ authority, auditId }), requirementFingerprint: requirementFp, provisionalCompletionProofId: provisional.proofId, provisionalCompletionComplete: provisional.complete, capabilityCoverageComplete: capability.complete, claimCoverageComplete: claims.complete, claimGroundingComplete: claimGrounding, auditState: audit.state, specClaimConformanceComplete: spec.complete, complete });
}

export function provisionalCompletionProof({ authority }) {
  const state = assertAuthority(authority);
  const cv = state.coreUserValue;
  const groundedCoreUserValue = Boolean(cv && cv.currentness === "current" && cv.evidenceEdgeId && evidenceValidation(state, state.evidenceEdges.get(cv.evidenceEdgeId) ?? {}).accepted);
  const capability = capabilityCoverageProof({ authority });
  const blockingDecisions = [...state.decisions.values()].filter((item) => item.currentness === "current" && resolveCriticality({ authority, decisionInstanceId: item.id }).blocking);
  const unresolvedDecisionIds = blockingDecisions.filter((item) => !["settled", "delegated"].includes(item.settlement) || state.revisions.get(item.revisionId)?.currentness !== "current").map((item) => item.id).sort();
  const blockingConflictIds = [...state.openBlockingIssues.values()].filter((item) => item.currentness === "current").map((item) => item.id).sort();
  const staleBlockingArtifactIds = [...state.artifacts.entries()].filter(([, item]) => item.currentness === "stale" && item.blocking === true).map(([id]) => id).sort();
  const complete = groundedCoreUserValue && capability.complete && unresolvedDecisionIds.length === 0 && blockingConflictIds.length === 0 && state.graphFixpoint === true && staleBlockingArtifactIds.length === 0;
  return deepFreeze({ proofId: hash({ requirementFingerprint: requirementFingerprint({ authority }), groundedCoreUserValue, capability: capability.complete, unresolvedDecisionIds, blockingConflictIds, graphFixpoint: state.graphFixpoint, staleBlockingArtifactIds }), requirementFingerprint: requirementFingerprint({ authority }), groundedCoreUserValue, capabilityCoverageComplete: capability.complete, unresolvedDecisionIds, blockingConflictIds, graphFixpointReached: state.graphFixpoint === true, staleBlockingArtifactIds, complete });
}

export function migrateV4Context({ authority, snapshotId }) {
  const state = assertAuthority(authority);
  const snapshot = state.legacySnapshots.get(snapshotId);
  if (!snapshot) throw new Error("unknown authoritative legacy snapshot");
  const adapter = state.registries.migrationAdapters.find((item) => item.adapterId === snapshot.adapterId && item.sourceContextVersion === snapshot.sourceContextVersion);
  if (!adapter) throw new Error("incompatible legacy adapter");
  const sourceFactFingerprint = snapshot.sourceFingerprint;
  const migrationId = hash({ sourceFactFingerprint, target: "v5", registryVersionSet: state.registries.registryVersionSet });
  const existing = state.migrations.get(migrationId);
  if (existing) return { record: clone(existing), projection: clone(existing.projection), created: false };
  for (const [id, record] of state.migrations) if (record.sourceFactFingerprint === sourceFactFingerprint && record.migrationStatus === "completed") state.migrations.set(id, { ...record, migrationStatus: "superseded", currentness: "superseded" });
  const projection = { sourceSnapshotId: snapshot.snapshotId, sourceFingerprint: snapshot.sourceFingerprint, trustedAdapter: { id: snapshot.adapterId, version: snapshot.adapterVersion }, legacyGeneratedArtifacts: [] };
  const record = { migrationId, sourceContextVersion: snapshot.sourceContextVersion, targetContextVersion: "v5", sourceFactFingerprint, compatibleRegistryVersions: snapshot.compatibleRegistryVersions, registryVersionSet: state.registries.registryVersionSet, migrationStatus: "completed", currentness: "current", migrationWarnings: [], projection };
  state.migrations.set(migrationId, record);
  return { record: clone(record), projection: clone(projection), created: true };
}
export function currentMigrationProjection({ authority, sourceFactFingerprint }) {
  const state = assertAuthority(authority);
  const current = [...state.migrations.values()].find((item) => item.sourceFactFingerprint === sourceFactFingerprint && item.currentness === "current" && item.migrationStatus === "completed");
  return current ? clone(current.projection) : null;
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
