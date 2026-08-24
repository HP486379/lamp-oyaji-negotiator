/**
 * v5 PR1 Semantic Intake & Required Promotion Gate.
 *
 * This module deliberately produces only draft semantic artifacts.  It never
 * settles decisions, generates claims, or returns a completion proof.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  capabilityInstanceId,
  createArchitectureAuthority,
  decisionInstanceId,
  submitExplicitUserConfirmation,
  submitRawInitialInput,
  submitRawUserAnswer,
} from "./contracts.js";

export const PR1_SEMANTIC_REGISTRY_VERSION = "v5-pr1.0";

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const digest = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
};
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const current = (artifact) => artifact?.currentness === "current";
const SESSION = new WeakMap();

const entry = (id, extra = {}) => ({ id, version: "1.0.0", registryVersion: PR1_SEMANTIC_REGISTRY_VERSION, status: "active", ...extra });

export const PR1_SEMANTIC_REGISTRY = freeze({
  version: PR1_SEMANTIC_REGISTRY_VERSION,
  coreUserValuePatterns: [
    entry("core_value.constrained_candidate_recommendation", {
      semanticLabels: ["constrained_candidate_recommendation"],
      minimumCapabilityTypeIds: ["capability.input.capture", "capability.candidate.source", "capability.candidate.eligibility", "capability.rule.evaluation", "capability.candidate.presentation"],
    }),
    entry("core_value.turn_based_state_progression", {
      semanticLabels: ["turn_based_state_progression"],
      minimumCapabilityTypeIds: ["capability.input.capture", "capability.turn.resolution", "capability.state.transition", "capability.rule.evaluation", "capability.candidate.presentation"],
    }),
    entry("core_value.goal_directed_state_navigation", { semanticLabels: ["goal_directed_state_navigation"], minimumCapabilityTypeIds: ["capability.input.capture", "capability.state.transition", "capability.rule.evaluation", "capability.candidate.presentation"] }),
    entry("core_value.simulated_decision_support", { semanticLabels: ["simulated_decision_support"], minimumCapabilityTypeIds: ["capability.input.capture", "capability.rule.evaluation", "capability.candidate.presentation"] }),
  ],
  capabilityTypes: [
    entry("capability.input.capture", { semanticLabels: ["input_capture"] }),
    entry("capability.candidate.source", { semanticLabels: ["candidate_source"] }),
    entry("capability.candidate.eligibility", { semanticLabels: ["candidate_eligibility"] }),
    entry("capability.candidate.presentation", { semanticLabels: ["candidate_presentation"] }),
    entry("capability.rule.evaluation", { semanticLabels: ["rule_evaluation"] }),
    entry("capability.state.persistence", { semanticLabels: ["state_persistence", "persist_inputs_local"] }),
    entry("capability.state.transition", { semanticLabels: ["state_transition"] }),
    entry("capability.turn.resolution", { semanticLabels: ["turn_resolution"] }),
  ],
  decisionTypes: [
    entry("decision.source.selection", { semanticLabels: ["source_selection"], valueSchemaId: "value_schema.source_mode", globalScopeAllowed: true }),
    entry("decision.eligibility.policy", { semanticLabels: ["eligibility_policy"], valueSchemaId: "value_schema.constraint_policy", globalScopeAllowed: true }),
    entry("decision.primary_flow.policy", { semanticLabels: ["primary_flow"], valueSchemaId: "value_schema.primary_flow_policy", globalScopeAllowed: true }),
    entry("decision.state.persistence.policy", { semanticLabels: ["persistence_policy"], valueSchemaId: "value_schema.persistence_mode", globalScopeAllowed: true }),
    entry("decision.turn.control.policy", { semanticLabels: ["turn_control"], valueSchemaId: "value_schema.turn_control_mode", globalScopeAllowed: true }),
    entry("decision.goal.condition", { semanticLabels: ["goal_condition"], valueSchemaId: "value_schema.goal_condition", globalScopeAllowed: true }),
  ],
  valueSchemas: [
    entry("value_schema.source_mode", { values: ["embedded_catalog", "external_provider", "user_supplied_collection"] }),
    entry("value_schema.constraint_policy", { values: ["all_constraints_required", "partial_allowed", "substitute_allowed"] }),
    entry("value_schema.primary_flow_policy", { values: ["explicit_flow", "delegate_safe_minimum"] }),
    entry("value_schema.persistence_mode", { values: ["transient", "local_persistent", "cloud_synchronized"] }),
    entry("value_schema.turn_control_mode", { values: ["alternating_turns", "single_actor", "automatic_resolution"] }),
    entry("value_schema.goal_condition", { values: ["goal_state_reached", "rule_defined_terminal_state", "user_confirmed_completion"] }),
  ],
  uniqueTransforms: [
    entry("transform.structured_answer.source_to_candidate_source", { decisionTypeId: "decision.source.selection", allowedValues: ["embedded_catalog", "external_provider", "user_supplied_collection"], targetCapabilityTypeId: "capability.candidate.source" }),
    entry("transform.structured_answer.eligibility_to_candidate_eligibility", { decisionTypeId: "decision.eligibility.policy", allowedValues: ["all_constraints_required", "partial_allowed", "substitute_allowed"], targetCapabilityTypeId: "capability.candidate.eligibility" }),
  ],
  requiredDependencyRules: [
    entry("dependency.candidate_source.requires_rule_evaluation", { upstreamCapabilityTypeId: "capability.candidate.source", downstreamCapabilityTypeId: "capability.rule.evaluation" }),
    entry("dependency.candidate_eligibility.requires_rule_evaluation", { upstreamCapabilityTypeId: "capability.candidate.eligibility", downstreamCapabilityTypeId: "capability.rule.evaluation" }),
    entry("dependency.candidate_evaluation.requires_presentation", { upstreamCapabilityTypeId: "capability.rule.evaluation", downstreamCapabilityTypeId: "capability.candidate.presentation" }),
    entry("dependency.turn_resolution.requires_state_transition", { upstreamCapabilityTypeId: "capability.turn.resolution", downstreamCapabilityTypeId: "capability.state.transition" }),
  ],
  safeDefaultRules: [
    entry("safe_default.primary_flow.constrained_candidate_recommendation", {
      appliesToPatternId: "core_value.constrained_candidate_recommendation",
      allowedExistingCapabilityTypeIds: ["capability.input.capture", "capability.candidate.source", "capability.candidate.eligibility", "capability.rule.evaluation", "capability.candidate.presentation"],
      requiredExistingCapabilityTypeIds: ["capability.input.capture", "capability.candidate.source", "capability.candidate.eligibility", "capability.rule.evaluation", "capability.candidate.presentation"],
      allowedDecisionTypeIds: ["decision.primary_flow.policy"],
      decisionValueProposal: "input_evaluate_present",
      expandsDataBoundary: false,
      expandsExternalConsequence: false,
      mayCreateCapabilityInstances: false,
      mayPromoteRequired: false,
      mayCreateBlockingStatus: false,
    }),
    entry("safe_default.primary_flow.turn_based_state_progression", {
      appliesToPatternId: "core_value.turn_based_state_progression",
      allowedExistingCapabilityTypeIds: ["capability.input.capture", "capability.turn.resolution", "capability.state.transition", "capability.rule.evaluation", "capability.candidate.presentation"],
      requiredExistingCapabilityTypeIds: ["capability.input.capture", "capability.turn.resolution", "capability.state.transition", "capability.rule.evaluation", "capability.candidate.presentation"],
      allowedDecisionTypeIds: ["decision.primary_flow.policy"],
      decisionValueProposal: "alternate_evaluate_transition_present",
      expandsDataBoundary: false,
      expandsExternalConsequence: false,
      mayCreateCapabilityInstances: false,
      mayPromoteRequired: false,
      mayCreateBlockingStatus: false,
    }),
  ],
  ambiguousLabels: {
    candidate_configuration: ["decision.source.selection", "decision.eligibility.policy"],
  },
});

const findById = (items, id) => items.find((item) => item.id === id) ?? null;
const findByLabel = (items, label) => items.filter((item) => item.semanticLabels?.includes(label));
const semanticStatus = (status, extra = {}) => freeze({ status, ...extra });
const sourceKind = { initial_input: "initial_input_adapter", user_answer: "user_answer_adapter", user_confirmation: "user_confirmation_adapter" };

function state(session) {
  const value = SESSION.get(session);
  if (!value) throw new Error("invalid semantic runtime session");
  return value;
}

function runtimeResult(status, extra = {}) {
  return freeze({ status, ...extra });
}

function eventEnvelope(runtime, event, eventType) {
  if (!event || !nonBlank(event.eventId) || typeof event.text !== "string") throw new Error("invalid raw event");
  const questionId = event.questionId ?? null;
  if (eventType === "user_answer" && (!questionId || !runtime.questions.has(questionId))) return runtimeResult("rejected_unissued_question");
  const answerValue = typeof event.answerValue === "string" ? event.answerValue : null;
  const payloadDigest = digest({ text: event.text, answerValue, questionId });
  const bindingDigest = digest({ eventId: event.eventId, eventType, source: sourceKind[eventType], sessionId: runtime.sessionId, questionId, payloadDigest });
  const existing = runtime.events.get(event.eventId);
  if (existing) return existing.eventBindingDigest === bindingDigest
    ? runtimeResult("accepted", { replay: true, sourceRevisionId: existing.sourceRevisionId })
    : runtimeResult("rejected_tampered_replay");
  const envelope = freeze({
    eventId: event.eventId,
    eventType,
    source: freeze({ kind: sourceKind[eventType], sessionId: runtime.sessionId, questionId }),
    rawPayloadDigest: payloadDigest,
    eventBindingDigest: bindingDigest,
    sourceRevisionId: `rawrev:${digest({ sessionId: runtime.sessionId, eventId: event.eventId, bindingDigest })}`,
    occurredAt: typeof event.occurredAt === "string" ? event.occurredAt : null,
    receivedAt: new Date().toISOString(),
    semanticInputFingerprint: null,
    text: event.text,
    answerValue,
    currentness: "current",
  });
  if (eventType === "initial_input") submitRawInitialInput({ authority: runtime.pr0Authority, event });
  if (eventType === "user_answer") submitRawUserAnswer({ authority: runtime.pr0Authority, event });
  if (eventType === "user_confirmation") submitExplicitUserConfirmation({ authority: runtime.pr0Authority, event });
  runtime.events.set(event.eventId, envelope);
  runtime.revisions.set(envelope.sourceRevisionId, freeze({ id: envelope.sourceRevisionId, type: "revision", text: event.text, scopeKey: questionId ?? "core", currentness: "current", provenance: envelope.eventBindingDigest }));
  return runtimeResult("accepted", { replay: false, sourceRevisionId: envelope.sourceRevisionId });
}

function canonicalCapability(runtime, capabilityTypeId, scopeKey, origin, evidenceId = null, classification = "unresolved") {
  const definition = findById(PR1_SEMANTIC_REGISTRY.capabilityTypes, capabilityTypeId);
  if (!definition) return null;
  const id = capabilityInstanceId({ capabilityTypeId, parentCapabilityInstanceId: null, managedObjectIds: [], actorIds: [], phaseKindId: scopeKey });
  const existing = runtime.capabilities.get(id);
  if (existing) {
    if (current(existing) && classification === "required_candidate" && existing.classification !== "required_candidate") {
      const promoted = freeze({ ...existing, origin, evidenceId, classification });
      runtime.capabilities.set(id, promoted);
      return promoted;
    }
    return existing;
  }
  const artifact = freeze({ id, typeId: capabilityTypeId, scopeKey, origin, evidenceId, classification, currentness: "current", blocking: false });
  runtime.capabilities.set(id, artifact);
  return artifact;
}

function staleDerived(runtime, sourceRevisionId) {
  if (runtime.pattern?.sourceRevisionId === sourceRevisionId && current(runtime.pattern)) runtime.pattern = freeze({ ...runtime.pattern, currentness: "stale" });
  runtime.evidence = runtime.evidence.map((artifact) => artifact.sourceRevisionId === sourceRevisionId && current(artifact) ? freeze({ ...artifact, currentness: "stale" }) : artifact);
  runtime.capabilities.forEach((artifact, id) => {
    if (artifact.evidenceId && runtime.evidence.some((edge) => edge.id === artifact.evidenceId && edge.currentness === "stale")) runtime.capabilities.set(id, freeze({ ...artifact, currentness: "stale", classification: "unresolved" }));
  });
  runtime.decisions.forEach((artifact, id) => {
    if (artifact.sourceRevisionId === sourceRevisionId && current(artifact)) runtime.decisions.set(id, freeze({ ...artifact, currentness: "stale", classification: "unresolved" }));
  });
}

function explicitEvidence(runtime, sourceRevisionId, targetId, scopeKey) {
  const source = runtime.revisions.get(sourceRevisionId);
  if (!source || !current(source)) return null;
  const id = `evidence:${digest({ sourceRevisionId, targetId, scopeKey, relation: "explicitly_states" })}`;
  const existing = runtime.evidence.find((edge) => edge.id === id);
  if (existing) return existing;
  const edge = freeze({ id, sourceRevisionId, targetId, scopeKey, relation: "explicitly_states", transformRuleId: "transform:identity", evidenceSpan: source.text, derivationDepth: 0, currentness: "current" });
  runtime.evidence.push(edge);
  return edge;
}

function validateValue(schemaId, value) {
  const schema = findById(PR1_SEMANTIC_REGISTRY.valueSchemas, schemaId);
  return Boolean(schema && typeof value === "string" && schema.values.includes(value));
}

function createDecisionFromExplicitEvidence(runtime, candidate, eventId, value) {
  const event = runtime.events.get(eventId);
  const definition = findById(PR1_SEMANTIC_REGISTRY.decisionTypes, candidate.mappedTypeId);
  if (!event || !definition || !validateValue(definition.valueSchemaId, value)) return semanticStatus("unresolved", { reasonCode: "invalid_value_schema" });
  const key = { decisionTypeId: definition.id, capabilityInstanceId: null, managedObjectIds: [], actorIds: [], phaseKindId: candidate.scopeKey };
  const id = decisionInstanceId(key, definition);
  const existing = runtime.decisions.get(id);
  if (existing && existing.value === value && current(existing)) return semanticStatus(existing.classification, { decisionId: id, duplicate: true });
  if (existing && current(existing)) {
    runtime.decisions.set(id, freeze({ ...existing, currentness: "stale" }));
    const priorRevision = runtime.revisions.get(existing.sourceRevisionId);
    if (priorRevision) runtime.revisions.set(priorRevision.id, freeze({ ...priorRevision, currentness: "stale" }));
    staleDerived(runtime, existing.sourceRevisionId);
  }
  const evidence = explicitEvidence(runtime, event.sourceRevisionId, id, candidate.scopeKey);
  if (!evidence) return semanticStatus("unresolved", { reasonCode: "missing_current_explicit_evidence" });
  const classification = definition.id === "decision.primary_flow.policy" && value === "delegate_safe_minimum" ? "unresolved" : "required_candidate";
  runtime.decisions.set(id, freeze({ id, typeId: definition.id, scopeKey: candidate.scopeKey, value, sourceRevisionId: event.sourceRevisionId, evidenceId: evidence.id, classification, authority: "explicit_user_evidence", currentness: "current" }));
  applyUniqueTransforms(runtime, id);
  return semanticStatus(classification, { decisionId: id, duplicate: false });
}

function applyUniqueTransforms(runtime, decisionId) {
  const decision = runtime.decisions.get(decisionId);
  if (!decision || !current(decision) || decision.classification !== "required_candidate") return [];
  const created = [];
  for (const transform of PR1_SEMANTIC_REGISTRY.uniqueTransforms.filter((rule) => rule.decisionTypeId === decision.typeId && rule.allowedValues.includes(decision.value))) {
    const targetId = `derived:${digest({ transformId: transform.id, decisionId })}`;
    const evidence = freeze({ id: targetId, sourceRevisionId: decision.sourceRevisionId, targetId: transform.targetCapabilityTypeId, scopeKey: decision.scopeKey, relation: "directly_entails", transformRuleId: transform.id, evidenceSpan: runtime.revisions.get(decision.sourceRevisionId)?.text ?? "", derivationDepth: 1, parentEvidenceId: decision.evidenceId, currentness: "current" });
    runtime.evidence.push(evidence);
    const capability = canonicalCapability(runtime, transform.targetCapabilityTypeId, decision.scopeKey, "registered_unique_transform", evidence.id, "required_candidate");
    if (capability) created.push(capability.id);
  }
  return created;
}

function mapCandidate(kind, semanticLabel) {
  const collection = kind === "core_user_value_pattern" ? PR1_SEMANTIC_REGISTRY.coreUserValuePatterns : kind === "capability" ? PR1_SEMANTIC_REGISTRY.capabilityTypes : PR1_SEMANTIC_REGISTRY.decisionTypes;
  const ambiguous = PR1_SEMANTIC_REGISTRY.ambiguousLabels[semanticLabel];
  if (ambiguous) return semanticStatus("ambiguous_mapping", { candidateTypeIds: ambiguous });
  const matches = findByLabel(collection, semanticLabel);
  if (matches.length === 1) return semanticStatus("mapped", { mappedTypeId: matches[0].id });
  return semanticStatus("unresolved", { reasonCode: "unknown_registry_reference" });
}

function establishMinimumUniverse(runtime, patternId, scopeKey, sourceRevisionId) {
  const pattern = findById(PR1_SEMANTIC_REGISTRY.coreUserValuePatterns, patternId);
  if (!pattern) return [];
  const patternEvidenceId = runtime.pattern?.sourceRevisionId === sourceRevisionId ? runtime.pattern.evidenceId : null;
  return pattern.minimumCapabilityTypeIds.map((typeId) => canonicalCapability(runtime, typeId, scopeKey, "pattern_minimum_capability_rule", patternEvidenceId, "unresolved")).filter(Boolean).map((capability) => capability.id);
}

export function createSemanticRuntimeSession() {
  const session = freeze({ kind: "v5-pr1-semantic-runtime-session" });
  SESSION.set(session, {
    sessionId: `semantic:${randomUUID()}`,
    pr0Authority: createArchitectureAuthority(),
    events: new Map(),
    revisions: new Map(),
    candidates: new Map(),
    questions: new Map(),
    evidence: [],
    capabilities: new Map(),
    decisions: new Map(),
    pattern: null,
    safeDefaults: [],
  });
  return session;
}

export const ingestInitialInput = (session, event) => eventEnvelope(state(session), event, "initial_input");
export const ingestUserAnswer = (session, event) => eventEnvelope(state(session), event, "user_answer");
export const ingestUserConfirmation = (session, event) => eventEnvelope(state(session), event, "user_confirmation");

export function receiveAiSemanticCandidate(session, candidate) {
  const runtime = state(session);
  if (!candidate || !nonBlank(candidate.candidateId) || !["core_user_value_pattern", "decision", "capability"].includes(candidate.kind) || !nonBlank(candidate.semanticLabel) || !nonBlank(candidate.scopeKey)) return semanticStatus("unresolved", { reasonCode: "invalid_candidate_shape" });
  const mapping = mapCandidate(candidate.kind, candidate.semanticLabel);
  const stored = freeze({ candidateId: candidate.candidateId, kind: candidate.kind, semanticLabel: candidate.semanticLabel, scopeKey: candidate.scopeKey, mappedTypeId: mapping.mappedTypeId ?? null, status: mapping.status, currentness: "current", classification: "proposal" });
  runtime.candidates.set(candidate.candidateId, stored);
  if (mapping.status !== "mapped") return mapping;
  if (candidate.kind === "core_user_value_pattern") {
    const sourceEvent = runtime.events.get(candidate.sourceEventId);
    if (!sourceEvent || sourceEvent.eventType !== "initial_input") return semanticStatus("unresolved", { reasonCode: "missing_initial_input_provenance" });
    const evidence = explicitEvidence(runtime, sourceEvent.sourceRevisionId, `core:${mapping.mappedTypeId}`, candidate.scopeKey);
    runtime.pattern = freeze({ patternId: mapping.mappedTypeId, scopeKey: candidate.scopeKey, sourceRevisionId: sourceEvent.sourceRevisionId, evidenceId: evidence?.id ?? null, currentness: evidence ? "current" : "stale" });
    establishMinimumUniverse(runtime, mapping.mappedTypeId, candidate.scopeKey, sourceEvent.sourceRevisionId);
  }
  return mapping;
}

export function issueClarificationQuestion(session, { candidateId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  if (!candidate || candidate.kind !== "decision" || candidate.status !== "mapped") return runtimeResult("rejected_unmappable_candidate");
  const definition = findById(PR1_SEMANTIC_REGISTRY.decisionTypes, candidate.mappedTypeId);
  const questionId = `question:${digest({ sessionId: runtime.sessionId, candidateId, typeId: definition.id, scopeKey: candidate.scopeKey })}`;
  const question = freeze({ questionId, candidateId, decisionTypeId: definition.id, valueSchemaId: definition.valueSchemaId, scopeKey: candidate.scopeKey });
  runtime.questions.set(questionId, question);
  return runtimeResult("issued", { question: clone(question) });
}

export function classifyUserAnswer(session, { candidateId, eventId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  const event = runtime.events.get(eventId);
  if (!candidate || !event || event.eventType !== "user_answer" || runtime.questions.get(event.source.questionId)?.candidateId !== candidateId) return semanticStatus("unresolved", { reasonCode: "missing_issued_question_or_answer" });
  return createDecisionFromExplicitEvidence(runtime, candidate, eventId, event.answerValue);
}

export function classifyUserConfirmation(session, { candidateId, eventId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  const event = runtime.events.get(eventId);
  if (!candidate || !event || event.eventType !== "user_confirmation") return semanticStatus("unresolved", { reasonCode: "missing_confirmation_provenance" });
  return createDecisionFromExplicitEvidence(runtime, candidate, eventId, event.answerValue);
}

export function promoteRequiredDependency(session, { ruleId, scopeKey }) {
  const runtime = state(session);
  const rule = findById(PR1_SEMANTIC_REGISTRY.requiredDependencyRules, ruleId);
  if (!rule) return semanticStatus("unresolved", { reasonCode: "unknown_required_dependency_rule" });
  const upstream = [...runtime.capabilities.values()].find((capability) => current(capability) && capability.typeId === rule.upstreamCapabilityTypeId && capability.scopeKey === scopeKey && capability.classification === "required_candidate");
  if (!upstream) return semanticStatus("unresolved", { reasonCode: "missing_required_upstream_capability" });
  const capability = canonicalCapability(runtime, rule.downstreamCapabilityTypeId, scopeKey, "registered_required_dependency", upstream.evidenceId, "required_candidate");
  return capability ? semanticStatus("required_candidate", { capabilityId: capability.id }) : semanticStatus("unresolved", { reasonCode: "unknown_dependency_target" });
}

export function evaluateSafeDefault(session, { ruleId, scopeKey, decisionCandidateId }) {
  const runtime = state(session);
  const rule = findById(PR1_SEMANTIC_REGISTRY.safeDefaultRules, ruleId);
  const candidate = runtime.candidates.get(decisionCandidateId);
  const delegation = [...runtime.decisions.values()].find((decision) => current(decision) && decision.typeId === "decision.primary_flow.policy" && decision.scopeKey === scopeKey && decision.value === "delegate_safe_minimum");
  if (!rule || !runtime.pattern || runtime.pattern.currentness !== "current" || runtime.pattern.patternId !== rule.appliesToPatternId || candidate?.mappedTypeId !== "decision.primary_flow.policy" || candidate.scopeKey !== scopeKey || !delegation) return semanticStatus("unresolved", { reasonCode: "safe_default_not_applicable" });
  if (rule.mayCreateCapabilityInstances || rule.mayPromoteRequired || rule.mayCreateBlockingStatus || rule.expandsDataBoundary || rule.expandsExternalConsequence) return semanticStatus("unresolved", { reasonCode: "safe_default_contract_violation" });
  const selected = [...runtime.capabilities.values()].filter((capability) => current(capability) && capability.scopeKey === scopeKey && rule.allowedExistingCapabilityTypeIds.includes(capability.typeId));
  if (rule.requiredExistingCapabilityTypeIds.some((typeId) => !selected.some((capability) => capability.typeId === typeId))) return semanticStatus("unresolved", { reasonCode: "missing_existing_capability" });
  const result = freeze({ ruleId: rule.id, scopeKey, selectedExistingCapabilityInstanceIds: selected.map((capability) => capability.id).sort(), referencedExistingCapabilityInstanceIds: selected.map((capability) => capability.id).sort(), decisionValueProposal: rule.decisionValueProposal, classification: "safe_default_candidate", currentness: "current", createsCapabilities: false, promotesRequired: false, createsBlocking: false, expandsDataBoundary: false, expandsExternalConsequence: false });
  runtime.safeDefaults.push(result);
  return semanticStatus("safe_default_candidate", { evaluation: clone(result) });
}

export function draftArtifactOutput(session) {
  const runtime = state(session);
  return freeze({
    status: "blocked_missing_authority",
    reasonCodes: ["slot_completion_unavailable", "decision_settlement_unavailable", "claim_ledger_unavailable", "audit_authority_unavailable"],
    semanticRegistryVersion: PR1_SEMANTIC_REGISTRY_VERSION,
    pattern: runtime.pattern ? clone(runtime.pattern) : null,
    evidence: runtime.evidence.map(clone),
    capabilities: [...runtime.capabilities.values()].map(clone),
    decisions: [...runtime.decisions.values()].map(clone),
    safeDefaultEvaluations: runtime.safeDefaults.map(clone),
  });
}

export function semanticRuntimeSnapshot(session) {
  const runtime = state(session);
  return freeze({
    sessionId: runtime.sessionId,
    events: [...runtime.events.values()].map(({ text: _text, ...envelope }) => clone(envelope)),
    candidates: [...runtime.candidates.values()].map(clone),
    questions: [...runtime.questions.values()].map(clone),
    revisions: [...runtime.revisions.values()].map(clone),
    ...draftArtifactOutput(session),
  });
}
