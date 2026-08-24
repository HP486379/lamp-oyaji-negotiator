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
    entry("decision.source.selection", { semanticLabels: ["source_selection"], valueSchemaId: "value_schema.source_mode", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.eligibility.policy", { semanticLabels: ["eligibility_policy"], valueSchemaId: "value_schema.constraint_policy", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.primary_flow.policy", { semanticLabels: ["primary_flow"], valueSchemaId: "value_schema.primary_flow_policy", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.state.persistence.policy", { semanticLabels: ["persistence_policy"], valueSchemaId: "value_schema.persistence_mode", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.turn.control.policy", { semanticLabels: ["turn_control"], valueSchemaId: "value_schema.turn_control_mode", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.goal.condition", { semanticLabels: ["goal_condition"], valueSchemaId: "value_schema.goal_condition", semanticValidatorId: "validator.enum_selection_text", globalScopeAllowed: true }),
    entry("decision.feature.toggle", { semanticLabels: ["feature_toggle"], valueSchemaId: "value_schema.boolean_choice", semanticValidatorId: "validator.boolean_value", globalScopeAllowed: true }),
    entry("decision.quantity.limit", { semanticLabels: ["quantity_limit"], valueSchemaId: "value_schema.nonnegative_integer", semanticValidatorId: "validator.nonnegative_integer", globalScopeAllowed: true }),
  ],
  valueSchemas: [
    entry("value_schema.source_mode", { values: ["embedded_catalog", "external_provider", "user_supplied_collection"] }),
    entry("value_schema.constraint_policy", { values: ["all_constraints_required", "partial_allowed", "substitute_allowed"] }),
    entry("value_schema.primary_flow_policy", { values: ["explicit_flow", "delegate_safe_minimum"] }),
    entry("value_schema.persistence_mode", { values: ["transient", "local_persistent", "cloud_synchronized"] }),
    entry("value_schema.turn_control_mode", { values: ["alternating_turns", "single_actor", "automatic_resolution"] }),
    entry("value_schema.goal_condition", { values: ["goal_state_reached", "rule_defined_terminal_state", "user_confirmed_completion"] }),
    entry("value_schema.boolean_choice", { values: [true, false] }),
    entry("value_schema.nonnegative_integer", { values: [], minimum: 0, integer: true }),
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
  const confirmationRequestId = event.confirmationRequestId ?? null;
  if (eventType === "user_confirmation" && (!confirmationRequestId || !current(runtime.confirmations.get(confirmationRequestId)))) return runtimeResult("rejected_unissued_confirmation");
  const answerValue = ["string", "boolean", "number"].includes(typeof event.answerValue) ? event.answerValue : null;
  const payloadDigest = digest({ text: event.text, answerValue, questionId });
  const bindingDigest = digest({ eventId: event.eventId, eventType, source: sourceKind[eventType], sessionId: runtime.sessionId, questionId, payloadDigest });
  const existing = runtime.events.get(event.eventId);
  if (existing) return existing.eventBindingDigest === bindingDigest
    ? runtimeResult("accepted", { replay: true, sourceRevisionId: existing.sourceRevisionId })
    : runtimeResult("rejected_tampered_replay");
  const envelope = freeze({
    eventId: event.eventId,
    eventType,
    source: freeze({ kind: sourceKind[eventType], sessionId: runtime.sessionId, questionId, confirmationRequestId }),
    rawPayloadDigest: payloadDigest,
    eventBindingDigest: bindingDigest,
    sourceRevisionId: `rawrev:${digest({ sessionId: runtime.sessionId, eventId: event.eventId, bindingDigest })}`,
    occurredAt: typeof event.occurredAt === "string" ? event.occurredAt : null,
    receivedAt: new Date().toISOString(),
    semanticInputFingerprint: null,
    canonicalAnswerBindingDigest: null,
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

function canonicalCapability(runtime, capabilityTypeId, scopeKey, origin, evidenceId = null, classification = "unresolved", coreSourceRevisionId = runtime.currentCoreUserValueSourceRevisionId) {
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
  const artifact = freeze({ id, typeId: capabilityTypeId, scopeKey, origin, evidenceId, coreSourceRevisionId, classification, currentness: "current", blocking: false });
  runtime.capabilities.set(id, artifact);
  return artifact;
}

function staleCoreSource(runtime, sourceRevisionId) {
  const next = {
    revisions: new Map(runtime.revisions),
    candidates: new Map(runtime.candidates),
    questions: new Map(runtime.questions),
    confirmations: new Map(runtime.confirmations),
    evidence: runtime.evidence.map((artifact) => ({ ...artifact })),
    capabilities: new Map(runtime.capabilities),
    decisions: new Map(runtime.decisions),
    safeDefaults: runtime.safeDefaults.map((artifact) => ({ ...artifact })),
    staleArtifacts: [...runtime.staleArtifacts],
    pattern: runtime.pattern,
  };
  const revision = next.revisions.get(sourceRevisionId);
  if (revision && current(revision)) next.revisions.set(sourceRevisionId, freeze({ ...revision, currentness: "superseded" }));
  next.candidates.forEach((artifact, id) => {
    if (artifact.coreSourceRevisionId === sourceRevisionId && current(artifact)) next.candidates.set(id, freeze({ ...artifact, currentness: "stale" }));
  });
  next.questions.forEach((artifact, id) => {
    if (artifact.coreSourceRevisionId === sourceRevisionId && current(artifact)) next.questions.set(id, freeze({ ...artifact, currentness: "stale" }));
  });
  next.confirmations.forEach((artifact, id) => {
    if (artifact.coreSourceRevisionId === sourceRevisionId && current(artifact)) next.confirmations.set(id, freeze({ ...artifact, currentness: "stale" }));
  });
  next.evidence = next.evidence.map((artifact) => artifact.sourceRevisionId === sourceRevisionId || artifact.coreSourceRevisionId === sourceRevisionId
    ? freeze({ ...artifact, currentness: "stale" }) : freeze(artifact));
  next.capabilities.forEach((artifact, id) => {
    const stale = artifact.coreSourceRevisionId === sourceRevisionId || next.evidence.some((edge) => edge.id === artifact.evidenceId && edge.currentness === "stale");
    if (stale && current(artifact)) {
      next.staleArtifacts.push(freeze({ ...artifact, currentness: "stale", classification: "unresolved" }));
      next.capabilities.delete(id);
    }
  });
  next.decisions.forEach((artifact, id) => {
    if ((artifact.coreSourceRevisionId === sourceRevisionId || artifact.sourceRevisionId === sourceRevisionId) && current(artifact)) {
      next.staleArtifacts.push(freeze({ ...artifact, currentness: "stale", classification: "unresolved" }));
      next.decisions.delete(id);
    }
  });
  next.safeDefaults = next.safeDefaults.map((artifact) => artifact.coreSourceRevisionId === sourceRevisionId && current(artifact)
    ? freeze({ ...artifact, currentness: "stale" }) : freeze(artifact));
  if (next.pattern?.sourceRevisionId === sourceRevisionId && current(next.pattern)) {
    next.staleArtifacts.push(freeze({ ...next.pattern, artifactKind: "pattern", currentness: "stale" }));
    next.pattern = freeze({ ...next.pattern, currentness: "stale" });
  }
  runtime.revisions = next.revisions;
  runtime.candidates = next.candidates;
  runtime.questions = next.questions;
  runtime.confirmations = next.confirmations;
  runtime.evidence = next.evidence;
  runtime.capabilities = next.capabilities;
  runtime.decisions = next.decisions;
  runtime.safeDefaults = next.safeDefaults;
  runtime.staleArtifacts = next.staleArtifacts;
  runtime.pattern = next.pattern;
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

function explicitEvidence(runtime, sourceRevisionId, targetId, scopeKey, coreSourceRevisionId = runtime.currentCoreUserValueSourceRevisionId) {
  const source = runtime.revisions.get(sourceRevisionId);
  if (!source || !current(source)) return null;
  const id = `evidence:${digest({ sourceRevisionId, targetId, scopeKey, relation: "explicitly_states" })}`;
  const existing = runtime.evidence.find((edge) => edge.id === id);
  if (existing) return existing;
  const edge = freeze({ id, sourceRevisionId, coreSourceRevisionId, targetId, scopeKey, relation: "explicitly_states", transformRuleId: "transform:identity", evidenceSpan: source.text, derivationDepth: 0, currentness: "current" });
  runtime.evidence.push(edge);
  return edge;
}

function validateValue(schemaId, value) {
  const schema = findById(PR1_SEMANTIC_REGISTRY.valueSchemas, schemaId);
  if (!schema) return false;
  if (schema.integer) return typeof value === "number" && Number.isInteger(value) && value >= schema.minimum;
  return schema.values.includes(value);
}

function normalize(value) {
  return String(value).trim().toLocaleLowerCase();
}

function semanticAnswerValid(question, event) {
  if (!question || !event || !validateValue(question.answerSchemaId, event.answerValue) || !nonBlank(event.text)) return false;
  const text = normalize(event.text);
  if (question.semanticValidatorId === "validator.enum_selection_text") return text.includes(normalize(event.answerValue));
  if (question.semanticValidatorId === "validator.boolean_value") return text === String(event.answerValue);
  if (question.semanticValidatorId === "validator.nonnegative_integer") return text === String(event.answerValue);
  return false;
}

function answerBinding(question, value) {
  return digest({ questionId: question.questionId, answerSchemaId: question.answerSchemaId, semanticValidatorId: question.semanticValidatorId, targetDecisionTypeId: question.targetDecisionTypeId, scopeKey: question.scopeKey, canonicalValue: value });
}

function admitQuestionAnswer(runtime, candidate, event) {
  const question = runtime.questions.get(event?.source?.questionId);
  if (!question || !candidate || !current(question) || !current(candidate) || question.candidateId !== candidate.candidateId || question.targetDecisionTypeId !== candidate.mappedTypeId || question.scopeKey !== candidate.scopeKey || candidate.coreSourceRevisionId !== runtime.currentCoreUserValueSourceRevisionId || !semanticAnswerValid(question, event)) return null;
  const canonicalAnswerBindingDigest = answerBinding(question, event.answerValue);
  const admitted = freeze({ ...event, semanticInputFingerprint: digest({ answerSchemaId: question.answerSchemaId, canonicalValue: event.answerValue, scopeKey: question.scopeKey }), canonicalAnswerBindingDigest, evidenceAdmission: "accepted" });
  runtime.events.set(event.eventId, admitted);
  return admitted;
}

function createDecisionFromExplicitEvidence(runtime, candidate, eventId, value) {
  const event = runtime.events.get(eventId);
  const definition = findById(PR1_SEMANTIC_REGISTRY.decisionTypes, candidate.mappedTypeId);
  if (!event || event.evidenceAdmission !== "accepted" || !definition || !validateValue(definition.valueSchemaId, value)) return semanticStatus("unresolved", { reasonCode: "evidence_admission_rejected" });
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
  const evidence = explicitEvidence(runtime, event.sourceRevisionId, id, candidate.scopeKey, candidate.coreSourceRevisionId);
  if (!evidence) return semanticStatus("unresolved", { reasonCode: "missing_current_explicit_evidence" });
  const classification = definition.id === "decision.primary_flow.policy" && value === "delegate_safe_minimum" ? "unresolved" : "required_candidate";
  runtime.decisions.set(id, freeze({ id, typeId: definition.id, scopeKey: candidate.scopeKey, value, sourceRevisionId: event.sourceRevisionId, coreSourceRevisionId: candidate.coreSourceRevisionId, evidenceId: evidence.id, classification, authority: "explicit_user_evidence", currentness: "current" }));
  applyUniqueTransforms(runtime, id);
  return semanticStatus(classification, { decisionId: id, duplicate: false });
}

function applyUniqueTransforms(runtime, decisionId) {
  const decision = runtime.decisions.get(decisionId);
  if (!decision || !current(decision) || decision.classification !== "required_candidate") return [];
  const created = [];
  for (const transform of PR1_SEMANTIC_REGISTRY.uniqueTransforms.filter((rule) => rule.decisionTypeId === decision.typeId && rule.allowedValues.includes(decision.value))) {
    const targetId = `derived:${digest({ transformId: transform.id, decisionId })}`;
    const evidence = freeze({ id: targetId, sourceRevisionId: decision.sourceRevisionId, coreSourceRevisionId: decision.coreSourceRevisionId, targetId: transform.targetCapabilityTypeId, scopeKey: decision.scopeKey, relation: "directly_entails", transformRuleId: transform.id, evidenceSpan: runtime.revisions.get(decision.sourceRevisionId)?.text ?? "", derivationDepth: 1, parentEvidenceId: decision.evidenceId, currentness: "current" });
    runtime.evidence.push(evidence);
    const capability = canonicalCapability(runtime, transform.targetCapabilityTypeId, decision.scopeKey, "registered_unique_transform", evidence.id, "required_candidate", decision.coreSourceRevisionId);
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
  return pattern.minimumCapabilityTypeIds.map((typeId) => canonicalCapability(runtime, typeId, scopeKey, "pattern_minimum_capability_rule", patternEvidenceId, "unresolved", sourceRevisionId)).filter(Boolean).map((capability) => capability.id);
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
    confirmations: new Map(),
    evidence: [],
    capabilities: new Map(),
    decisions: new Map(),
    pattern: null,
    currentCoreUserValueSourceRevisionId: null,
    safeDefaults: [],
    staleArtifacts: [],
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
  let coreSourceRevisionId = runtime.currentCoreUserValueSourceRevisionId;
  let sourceEvent = null;
  if (candidate.kind === "core_user_value_pattern") {
    sourceEvent = runtime.events.get(candidate.sourceEventId);
    if (!sourceEvent || sourceEvent.eventType !== "initial_input") return semanticStatus("unresolved", { reasonCode: "missing_initial_input_provenance" });
    coreSourceRevisionId = sourceEvent.sourceRevisionId;
    if (mapping.status === "mapped" && runtime.currentCoreUserValueSourceRevisionId && runtime.currentCoreUserValueSourceRevisionId !== coreSourceRevisionId) staleCoreSource(runtime, runtime.currentCoreUserValueSourceRevisionId);
  }
  const stored = freeze({ candidateId: candidate.candidateId, kind: candidate.kind, semanticLabel: candidate.semanticLabel, scopeKey: candidate.scopeKey, mappedTypeId: mapping.mappedTypeId ?? null, proposedValue: candidate.proposedValue ?? null, coreSourceRevisionId, status: mapping.status, currentness: "current", classification: "proposal" });
  runtime.candidates.set(candidate.candidateId, stored);
  if (mapping.status !== "mapped") return mapping;
  if (candidate.kind === "core_user_value_pattern") {
    runtime.currentCoreUserValueSourceRevisionId = coreSourceRevisionId;
    const evidence = explicitEvidence(runtime, sourceEvent.sourceRevisionId, `core:${mapping.mappedTypeId}`, candidate.scopeKey, coreSourceRevisionId);
    runtime.pattern = freeze({ patternId: mapping.mappedTypeId, scopeKey: candidate.scopeKey, sourceRevisionId: sourceEvent.sourceRevisionId, evidenceId: evidence?.id ?? null, currentness: evidence ? "current" : "stale" });
    establishMinimumUniverse(runtime, mapping.mappedTypeId, candidate.scopeKey, sourceEvent.sourceRevisionId);
  }
  return mapping;
}

export function issueClarificationQuestion(session, { candidateId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  if (!candidate || !current(candidate) || candidate.coreSourceRevisionId !== runtime.currentCoreUserValueSourceRevisionId || candidate.kind !== "decision" || candidate.status !== "mapped") return runtimeResult("rejected_unmappable_candidate");
  const definition = findById(PR1_SEMANTIC_REGISTRY.decisionTypes, candidate.mappedTypeId);
  const questionId = `question:${digest({ sessionId: runtime.sessionId, candidateId, typeId: definition.id, scopeKey: candidate.scopeKey })}`;
  const question = freeze({ questionId, candidateId, targetDecisionTypeId: definition.id, answerSchemaId: definition.valueSchemaId, semanticValidatorId: definition.semanticValidatorId, scopeKey: candidate.scopeKey, coreSourceRevisionId: candidate.coreSourceRevisionId, currentness: "current" });
  runtime.questions.set(questionId, question);
  return runtimeResult("issued", { question: clone(question) });
}

export function classifyUserAnswer(session, { candidateId, eventId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  const event = runtime.events.get(eventId);
  if (!candidate || !event || event.eventType !== "user_answer" || runtime.questions.get(event.source.questionId)?.candidateId !== candidateId) return semanticStatus("unresolved", { reasonCode: "missing_issued_question_or_answer" });
  const admitted = admitQuestionAnswer(runtime, candidate, event);
  if (!admitted) return semanticStatus("unresolved", { reasonCode: "evidence_admission_rejected" });
  return createDecisionFromExplicitEvidence(runtime, candidate, eventId, admitted.answerValue);
}

export function issueConfirmationRequest(session, { candidateId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  const definition = findById(PR1_SEMANTIC_REGISTRY.decisionTypes, candidate?.mappedTypeId);
  if (!candidate || !definition || !current(candidate) || candidate.coreSourceRevisionId !== runtime.currentCoreUserValueSourceRevisionId || !validateValue(definition.valueSchemaId, candidate.proposedValue)) return runtimeResult("rejected_unconfirmable_candidate");
  const targetFingerprint = digest({ candidateId, targetDecisionTypeId: definition.id, scopeKey: candidate.scopeKey, canonicalValue: candidate.proposedValue, coreSourceRevisionId: candidate.coreSourceRevisionId });
  const confirmationRequestId = `confirmation:${digest({ sessionId: runtime.sessionId, targetFingerprint })}`;
  const request = freeze({ confirmationRequestId, candidateId, targetDecisionTypeId: definition.id, scopeKey: candidate.scopeKey, targetFingerprint, expectedAction: "confirm", coreSourceRevisionId: candidate.coreSourceRevisionId, currentness: "current" });
  runtime.confirmations.set(confirmationRequestId, request);
  return runtimeResult("issued", { confirmationRequest: clone(request) });
}

function admitConfirmation(runtime, candidate, event) {
  const request = runtime.confirmations.get(event?.source?.confirmationRequestId);
  if (!request || !candidate || !current(request) || !current(candidate) || request.candidateId !== candidate.candidateId || request.targetDecisionTypeId !== candidate.mappedTypeId || request.scopeKey !== candidate.scopeKey || request.coreSourceRevisionId !== runtime.currentCoreUserValueSourceRevisionId || event.answerValue !== request.expectedAction || !nonBlank(event.text)) return null;
  const targetFingerprint = digest({ candidateId: candidate.candidateId, targetDecisionTypeId: candidate.mappedTypeId, scopeKey: candidate.scopeKey, canonicalValue: candidate.proposedValue, coreSourceRevisionId: candidate.coreSourceRevisionId });
  if (targetFingerprint !== request.targetFingerprint) return null;
  const admitted = freeze({ ...event, semanticInputFingerprint: digest({ confirmationRequestId: request.confirmationRequestId, targetFingerprint, action: event.answerValue }), canonicalAnswerBindingDigest: digest({ confirmationRequestId: request.confirmationRequestId, targetFingerprint, action: event.answerValue }), evidenceAdmission: "accepted" });
  runtime.events.set(event.eventId, admitted);
  return admitted;
}

export function classifyUserConfirmation(session, { candidateId, eventId }) {
  const runtime = state(session);
  const candidate = runtime.candidates.get(candidateId);
  const event = runtime.events.get(eventId);
  if (!candidate || !event || event.eventType !== "user_confirmation") return semanticStatus("unresolved", { reasonCode: "missing_confirmation_provenance" });
  if (!admitConfirmation(runtime, candidate, event)) return semanticStatus("unresolved", { reasonCode: "confirmation_admission_rejected" });
  return createDecisionFromExplicitEvidence(runtime, candidate, eventId, candidate.proposedValue);
}

export function promoteRequiredDependency(session, { ruleId, scopeKey }) {
  const runtime = state(session);
  const rule = findById(PR1_SEMANTIC_REGISTRY.requiredDependencyRules, ruleId);
  if (!rule) return semanticStatus("unresolved", { reasonCode: "unknown_required_dependency_rule" });
  const upstream = [...runtime.capabilities.values()].find((capability) => current(capability) && capability.typeId === rule.upstreamCapabilityTypeId && capability.scopeKey === scopeKey && capability.classification === "required_candidate");
  if (!upstream) return semanticStatus("unresolved", { reasonCode: "missing_required_upstream_capability" });
  const capability = canonicalCapability(runtime, rule.downstreamCapabilityTypeId, scopeKey, "registered_required_dependency", upstream.evidenceId, "required_candidate", upstream.coreSourceRevisionId);
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
  const result = freeze({ ruleId: rule.id, scopeKey, coreSourceRevisionId: runtime.currentCoreUserValueSourceRevisionId, selectedExistingCapabilityInstanceIds: selected.map((capability) => capability.id).sort(), referencedExistingCapabilityInstanceIds: selected.map((capability) => capability.id).sort(), decisionValueProposal: rule.decisionValueProposal, classification: "safe_default_candidate", currentness: "current", createsCapabilities: false, promotesRequired: false, createsBlocking: false, expandsDataBoundary: false, expandsExternalConsequence: false });
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
    evidence: runtime.evidence.filter(current).map(clone),
    capabilities: [...runtime.capabilities.values()].filter(current).map(clone),
    decisions: [...runtime.decisions.values()].filter(current).map(clone),
    safeDefaultEvaluations: runtime.safeDefaults.filter(current).map(clone),
  });
}

export function semanticRuntimeSnapshot(session) {
  const runtime = state(session);
  const draft = draftArtifactOutput(session);
  return freeze({
    sessionId: runtime.sessionId,
    events: [...runtime.events.values()].map(({ text: _text, ...envelope }) => clone(envelope)),
    candidates: [...runtime.candidates.values()].map(clone),
    questions: [...runtime.questions.values()].map(clone),
    confirmationRequests: [...runtime.confirmations.values()].map(clone),
    revisions: [...runtime.revisions.values()].map(clone),
    staleArtifacts: runtime.staleArtifacts.map(clone),
    ...draft,
    allEvidence: runtime.evidence.map(clone),
    allSafeDefaultEvaluations: runtime.safeDefaults.map(clone),
  });
}
