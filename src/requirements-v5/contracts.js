/**
 * v5 PR0 executable architecture contracts.
 *
 * Public callers submit raw user/audit/migration requests only.  Semantic
 * adapters, rules, evidence, registries, and proofs are module-private.
 */
import { createHash } from "node:crypto";

export const REGISTRY_VERSION_SET = Object.freeze({
  decisionType: "v5-pr0.3", capabilityType: "v5-pr0.3", trait: "v5-pr0.3",
  coreUserValuePattern: "v5-pr0.3", slotTemplate: "v5-pr0.3",
  criticalityRule: "v5-pr0.3", claimType: "v5-pr0.3", auditRule: "v5-pr0.3",
  migrationAdapter: "v5-pr0.3",
});
export const UNIVERSAL_SLOT_TEMPLATES = Object.freeze([
  "actor_participation", "primary_interaction", "required_input", "required_output",
  "success_observability", "state_continuity", "external_boundary", "failure_observability",
]);
export const REQUIRED_SPEC_ELEMENT_KINDS = Object.freeze([
  "functional_requirement", "data_model_field", "state_transition", "error_handling_rule",
  "acceptance_criteria", "primary_flow_step", "required_product_paragraph",
]);

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const hash = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const uniqueSorted = (values = []) => [...new Set(values ?? [])].sort();
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value;
};
const collection = (value) => value === null ? { presence: "null", values: null } : Array.isArray(value) ? { presence: "array", values: uniqueSorted(value) } : { presence: "missing", values: null };

export function canonicalCapabilityKey(key) {
  return { capabilityTypeId: key.capabilityTypeId, parentCapabilityInstanceId: key.parentCapabilityInstanceId ?? null, managedObjectIds: collection(key.managedObjectIds), actorIds: collection(key.actorIds), phaseKindId: key.phaseKindId ?? null };
}
export function canonicalDecisionKey(key, definition = null) {
  const result = { decisionTypeId: key.decisionTypeId, capabilityInstanceId: key.capabilityInstanceId ?? null, managedObjectIds: collection(key.managedObjectIds), actorIds: collection(key.actorIds), phaseKindId: key.phaseKindId ?? null };
  if (!result.capabilityInstanceId && definition?.globalScopeAllowed !== true) throw new Error("decision scope requires a capability instance");
  return result;
}
export const capabilityInstanceId = (key) => `cap:${hash(canonicalCapabilityKey(key))}`;
export const decisionInstanceId = (key, definition) => `dec:${hash(canonicalDecisionKey(key, definition))}`;

const QUESTION_CONTRACTS = deepFreeze({
  actor_participation: { answerSchemaId: "enum_actor", allowedValues: ["single_actor", "multiple_actors"], semanticValidatorId: "known_enum_value" },
  primary_interaction: { answerSchemaId: "enum_interaction", allowedValues: ["select", "create"], semanticValidatorId: "known_enum_value" },
  required_input: { answerSchemaId: "meaningful_text", allowedValues: null, semanticValidatorId: "meaningful_text" },
  required_output: { answerSchemaId: "meaningful_text", allowedValues: null, semanticValidatorId: "meaningful_text" },
  success_observability: { answerSchemaId: "boolean", allowedValues: ["true", "false"], semanticValidatorId: "strict_boolean" },
  state_continuity: { answerSchemaId: "integer", allowedValues: null, semanticValidatorId: "strict_integer" },
  external_boundary: { answerSchemaId: "enum_boundary", allowedValues: ["local", "external"], semanticValidatorId: "known_enum_value" },
  failure_observability: { answerSchemaId: "enum_failure", allowedValues: ["visible", "silent"], semanticValidatorId: "known_enum_value" },
  pattern_primary_capability: { answerSchemaId: "meaningful_text", allowedValues: null, semanticValidatorId: "meaningful_text" },
});
const SLOT_REGISTRY = deepFreeze({
  registryVersion: REGISTRY_VERSION_SET.slotTemplate,
  semanticRegistryVersion: REGISTRY_VERSION_SET.coreUserValuePattern,
  patternId: "pr0_interactive_value",
  slots: [...UNIVERSAL_SLOT_TEMPLATES, "pattern_primary_capability"].map((slotTemplateId) => ({ slotTemplateId, ...QUESTION_CONTRACTS[slotTemplateId], evidenceMappingRuleId: "validated_answer_to_issued_target", satisfactionRuleId: "validated_evidence_for_matching_slot", registryVersion: REGISTRY_VERSION_SET.slotTemplate })),
});
const REGISTRIES = deepFreeze({
  slotRegistry: SLOT_REGISTRY,
  criticalityRules: [{ ruleId: "slot_decision_required", blocking: true }],
  auditExecutor: { id: "coverage-audit-v1", version: "1" },
  auditRule: { id: "final-coverage-v1" },
  migrationAdapter: { id: "v4-authoritative-export-v1", sourceContextVersion: "v4" },
});
const PRIVATE = new WeakMap();
const internal = (authority) => {
  const state = PRIVATE.get(authority);
  if (!state) throw new Error("invalid architecture authority handle");
  return state;
};
const eventDigest = (event) => hash({ eventId: event.eventId, type: event.type, text: event.text ?? "", questionId: event.questionId ?? null, sourceId: event.sourceId ?? null });
const newState = () => ({
  registries: REGISTRIES, rawEvents: new Map(), answerAssessments: new Map(), revisions: new Map(), evidence: new Map(),
  targets: new Map(), slots: new Map(), questions: new Map(), capabilities: new Map(), decisions: new Map(),
  claims: new Map(), audits: new Map(), artifacts: new Map(), coreUserValue: null, coreUserValueMapping: null,
  coreInvariant: null, primaryFlow: null, migrationRequests: new Map(), revisionHeads: new Map(),
});
export function createArchitectureAuthority() {
  const authority = Object.freeze({ kind: "v5-architecture-authority", version: "pr0.3" });
  PRIVATE.set(authority, newState());
  return authority;
}

const recordRawEvent = (state, event) => {
  if (!event || typeof event.eventId !== "string" || !event.eventId || typeof event.text !== "string") throw new Error("invalid raw event");
  const digest = eventDigest(event); const prior = state.rawEvents.get(event.eventId);
  if (prior) {
    if (prior.digest !== digest) throw new Error("raw event replay was modified");
    return { replay: true, event: prior };
  }
  const stored = deepFreeze({ eventId: event.eventId, type: event.type, text: event.text, questionId: event.questionId ?? null, sourceId: event.sourceId ?? null, digest });
  state.rawEvents.set(stored.eventId, stored); return { replay: false, event: stored };
};
const assessRawAnswer = (question, text) => {
  const syntaxValid = typeof text === "string" && text.trim().length > 0;
  if (!syntaxValid) return { syntaxValid: false, schemaValid: false, semanticallyValid: false, reason: "empty_or_whitespace" };
  const value = text.trim(); const contract = question.answerContract;
  let schemaValid = false;
  if (contract.answerSchemaId === "meaningful_text") schemaValid = value.length >= 2 && /[\p{L}\p{N}]/u.test(value);
  else if (contract.answerSchemaId === "integer") schemaValid = /^-?\d+$/.test(value);
  else if (contract.answerSchemaId === "boolean") schemaValid = contract.allowedValues.includes(value);
  else if (contract.answerSchemaId.startsWith("enum_")) schemaValid = contract.allowedValues.includes(value);
  const semanticallyValid = schemaValid && contract.semanticValidatorId !== "meaningful_text" || (schemaValid && !["x", "n/a", "none", "不明", "-"].includes(value.toLowerCase()));
  return { syntaxValid, schemaValid, semanticallyValid, reason: semanticallyValid ? null : "answer_contract_rejected", normalizedValue: value };
};
const assessInitialInput = (text) => typeof text === "string" && text.trim().length >= 2 && /[\p{L}\p{N}]/u.test(text);
const addTarget = (state, id, scopeKey, slotTemplateId = null) => state.targets.set(id, deepFreeze({ id, scopeKey, slotTemplateId, currentness: "current" }));
const addEvidence = (state, { id, revisionId, targetId, event }) => {
  const revision = state.revisions.get(revisionId); const target = state.targets.get(targetId);
  if (!revision || revision.currentness !== "current" || !target || target.currentness !== "current" || revision.sourceEventId !== event.eventId || revision.text !== event.text || revision.scopeKey !== target.scopeKey) throw new Error("internal evidence validation failed");
  state.evidence.set(id, deepFreeze({ id, revisionId, targetId, sourceEventId: event.eventId, span: event.text, relation: "explicitly_states", derivationDepth: 0, currentness: "current" }));
  return id;
};
const currentEvidence = (state, evidenceId, targetId = null) => {
  const edge = state.evidence.get(evidenceId); const revision = edge && state.revisions.get(edge.revisionId);
  return Boolean(edge && edge.currentness === "current" && revision?.currentness === "current" && (!targetId || edge.targetId === targetId));
};
const staleDownstream = (state, revisionId) => {
  for (const artifact of state.artifacts.values()) if (artifact.revisionId === revisionId || artifact.dependsOnRevisionId === revisionId) artifact.currentness = "stale";
  for (const claim of state.claims.values()) if (claim.revisionId === revisionId) claim.currentness = "stale";
  for (const decision of state.decisions.values()) if (decision.revisionId === revisionId) decision.currentness = "stale";
};
const addClaim = (state, source) => {
  const claimId = `claim:${source.id}`;
  const edge = state.evidence.get(source.evidenceId);
  if (!currentEvidence(state, source.evidenceId, source.targetId)) throw new Error("internal claim grounding failed");
  state.claims.set(claimId, { id: claimId, sourceId: source.id, sourceKind: source.kind, targetId: source.targetId, evidenceId: edge.id, revisionId: edge.revisionId, scopeKey: source.scopeKey, currentness: "current" });
  state.artifacts.set(`claim:${claimId}`, { id: `claim:${claimId}`, dependsOnRevisionId: edge.revisionId, blocking: true, currentness: "current" });
};
const evaluateSlotSatisfaction = (state, question, assessment, evidenceId) => {
  const definition = state.registries.slotRegistry.slots.find((item) => item.slotTemplateId === question.slotTemplateId);
  const accepted = Boolean(definition && definition.satisfactionRuleId === "validated_evidence_for_matching_slot" && definition.evidenceMappingRuleId === "validated_answer_to_issued_target" && assessment.semanticallyValid && currentEvidence(state, evidenceId, question.targetId));
  if (accepted) state.slots.set(question.slotTemplateId, { slotTemplateId: question.slotTemplateId, status: "satisfied", evidenceId, currentness: "current" });
  return accepted;
};
const activateCapabilityForSatisfiedSlot = (state, question, revision, evidenceId) => {
  const slot = state.slots.get(question.slotTemplateId);
  if (slot?.status !== "satisfied" || slot.evidenceId !== evidenceId) return null;
  const capId = `cap:${question.slotTemplateId}`; const decisionId = `decision:${question.slotTemplateId}`;
  const previous = state.revisionHeads.get(question.slotTemplateId);
  if (previous && previous !== revision.id) staleDownstream(state, previous);
  state.revisionHeads.set(question.slotTemplateId, revision.id);
  state.capabilities.set(capId, { id: capId, targetId: question.targetId, evidenceId, revisionId: revision.id, scopeKey: question.scopeKey, currentness: "current", blocking: true, provisional: false });
  state.decisions.set(decisionId, { id: decisionId, revisionId: revision.id, targetId: question.targetId, evidenceId, scopeKey: question.scopeKey, currentness: "current" });
  state.artifacts.set(`capability:${capId}`, { id: `capability:${capId}`, revisionId: revision.id, blocking: true, currentness: "current" });
  state.artifacts.set(`decision:${decisionId}`, { id: `decision:${decisionId}`, revisionId: revision.id, blocking: true, currentness: "current" });
  return { capId, decisionId };
};
const settleDecisionFromActivatedCapability = (state, ids) => {
  if (!ids) return false;
  const capability = state.capabilities.get(ids.capId); const decision = state.decisions.get(ids.decisionId);
  return Boolean(capability?.currentness === "current" && !capability.provisional && decision?.currentness === "current" && currentEvidence(state, decision.evidenceId, decision.targetId));
};
const deriveClaimsFromSettledState = (state, ids) => {
  if (!ids || !settleDecisionFromActivatedCapability(state, ids)) return;
  const capability = state.capabilities.get(ids.capId); const decision = state.decisions.get(ids.decisionId);
  addClaim(state, { id: capability.id, kind: "capability", targetId: capability.targetId, evidenceId: capability.evidenceId, scopeKey: capability.scopeKey });
  addClaim(state, { id: decision.id, kind: "decision", targetId: decision.targetId, evidenceId: decision.evidenceId, scopeKey: decision.scopeKey });
};
const initializeQuestions = (state) => {
  for (const definition of state.registries.slotRegistry.slots) {
    const questionId = `question:${definition.slotTemplateId}`; const targetId = `target:${definition.slotTemplateId}`;
    addTarget(state, targetId, "global", definition.slotTemplateId);
    state.questions.set(questionId, deepFreeze({ id: questionId, targetId, slotTemplateId: definition.slotTemplateId, decisionTypeId: `decision:${definition.slotTemplateId}`, answerSchemaId: definition.answerSchemaId, semanticValidatorId: definition.semanticValidatorId, evidenceMappingRuleId: definition.evidenceMappingRuleId, satisfactionRuleId: definition.satisfactionRuleId, answerContract: definition, scopeKey: "global", answeredByEventId: null }));
    state.slots.set(definition.slotTemplateId, { slotTemplateId: definition.slotTemplateId, status: "unknown", evidenceId: null, currentness: "current" });
  }
};
export function submitRawInitialInput({ authority, event }) {
  const state = internal(authority); const raw = { ...event, type: "initial_input", questionId: null };
  const recorded = recordRawEvent(state, raw); if (recorded.replay) return { accepted: true, replay: true };
  if (state.coreUserValue || [...state.rawEvents.values()].some((item) => item.type === "initial_input" && item.eventId !== raw.eventId)) throw new Error("initial input is already recorded");
  initializeQuestions(state);
  if (!assessInitialInput(raw.text)) {
    state.answerAssessments.set(raw.eventId, { eventId: raw.eventId, stage: "semantically_invalid", reason: "invalid_core_user_value" });
    return { accepted: true, replay: false, semanticallyValid: false };
  }
  const revisionId = `revision:initial:${raw.eventId}`; const targetId = `target:core:${raw.eventId}`; const evidenceId = `evidence:core:${raw.eventId}`;
  state.revisions.set(revisionId, { id: revisionId, sourceEventId: raw.eventId, text: raw.text, scopeKey: "core", currentness: "current", adapterVersion: "initial_input_adapter@1" });
  addTarget(state, targetId, "core"); addEvidence(state, { id: evidenceId, revisionId, targetId, event: raw });
  state.coreUserValue = { revisionId, targetId, evidenceId, value: raw.text, currentness: "current" };
  state.coreUserValueMapping = { patternId: state.registries.slotRegistry.patternId, evidenceId, currentness: "current" };
  state.coreInvariant = { id: "invariant:core", targetId, evidenceId, revisionId, scopeKey: "core", currentness: "current" };
  state.primaryFlow = { id: "flow:core", targetId, evidenceId, revisionId, scopeKey: "core", currentness: "current" };
  state.artifacts.set("invariant:core", { id: "invariant:core", revisionId, blocking: true, currentness: "current" });
  state.artifacts.set("flow:core", { id: "flow:core", revisionId, blocking: true, currentness: "current" });
  addClaim(state, { id: "invariant:core", kind: "core_invariant", targetId, evidenceId, scopeKey: "core" });
  addClaim(state, { id: "flow:core", kind: "primary_flow", targetId, evidenceId, scopeKey: "core" });
  return { accepted: true, replay: false, semanticallyValid: true };
}
export function listPendingQuestions({ authority }) {
  const state = internal(authority);
  return [...state.questions.values()].filter((question) => !question.answeredByEventId).map((question) => ({ questionId: question.id, decisionTypeId: question.decisionTypeId, slotTemplateId: question.slotTemplateId, answerSchemaId: question.answerSchemaId, allowedValues: question.answerContract.allowedValues, semanticValidatorId: question.semanticValidatorId, evidenceMappingRuleId: question.evidenceMappingRuleId, satisfactionRuleId: question.satisfactionRuleId, scope: question.scopeKey }));
}
export function submitRawUserAnswer({ authority, event }) {
  const state = internal(authority); const raw = { ...event, type: "user_answer" };
  const recorded = recordRawEvent(state, raw); if (recorded.replay) return { accepted: true, replay: true, assessment: state.answerAssessments.get(raw.eventId) ?? null };
  const question = state.questions.get(raw.questionId);
  if (!question) throw new Error("unknown issued question");
  const previousEvent = question.answeredByEventId;
  if (previousEvent && previousEvent !== raw.eventId) throw new Error("issued question already has a current answer");
  const assessment = assessRawAnswer(question, raw.text);
  state.answerAssessments.set(raw.eventId, { eventId: raw.eventId, questionId: question.id, stage: assessment.semanticallyValid ? "semantically_valid" : assessment.schemaValid ? "schema_valid" : assessment.syntaxValid ? "syntax_valid" : "received", ...assessment });
  if (!assessment.semanticallyValid) return { accepted: true, replay: false, evidenceAccepted: false, assessment: state.answerAssessments.get(raw.eventId) };
  const revisionId = `revision:answer:${raw.eventId}`; const evidenceId = `evidence:answer:${raw.eventId}`;
  const revision = { id: revisionId, sourceEventId: raw.eventId, text: raw.text, scopeKey: question.scopeKey, currentness: "current", adapterVersion: "user_answer_adapter@1" };
  state.revisions.set(revisionId, revision); addEvidence(state, { id: evidenceId, revisionId, targetId: question.targetId, event: raw });
  const accepted = evaluateSlotSatisfaction(state, question, assessment, evidenceId);
  if (!accepted) return { accepted: true, replay: false, evidenceAccepted: false, assessment: state.answerAssessments.get(raw.eventId) };
  state.answerAssessments.set(raw.eventId, { ...state.answerAssessments.get(raw.eventId), stage: "evidence_accepted" });
  state.questions.set(question.id, { ...question, answeredByEventId: raw.eventId });
  const ids = activateCapabilityForSatisfiedSlot(state, question, revision, evidenceId);
  deriveClaimsFromSettledState(state, ids);
  return { accepted: true, replay: false, evidenceAccepted: true, assessment: state.answerAssessments.get(raw.eventId) };
}
export function submitExplicitUserConfirmation({ authority, event }) {
  const state = internal(authority); const raw = { ...event, type: "user_confirmation", questionId: null };
  const recorded = recordRawEvent(state, raw); if (recorded.replay) return { accepted: true, replay: true };
  return { accepted: true, replay: false, confirmationId: raw.eventId };
}

const currentSources = (state) => [
  ...[...state.capabilities.values()].filter((item) => item.currentness === "current").map((item) => ({ id: item.id, kind: "capability", ...item })),
  ...[...state.decisions.values()].filter((item) => item.currentness === "current").map((item) => ({ id: item.id, kind: "decision", ...item })),
  ...(state.coreInvariant?.currentness === "current" ? [{ ...state.coreInvariant, kind: "core_invariant" }] : []),
  ...(state.primaryFlow?.currentness === "current" ? [{ ...state.primaryFlow, kind: "primary_flow" }] : []),
];
export function requirementFingerprint({ authority }) {
  const state = internal(authority);
  return hash({ coreUserValue: state.coreUserValue, coreUserValueMapping: state.coreUserValueMapping, slots: [...state.slots.values()].sort((a, b) => a.slotTemplateId.localeCompare(b.slotTemplateId)), sources: currentSources(state).map((item) => ({ id: item.id, kind: item.kind, revisionId: item.revisionId, targetId: item.targetId, evidenceId: item.evidenceId, currentness: item.currentness })).sort((a, b) => a.id.localeCompare(b.id)), registryVersions: state.registries === REGISTRIES ? REGISTRY_VERSION_SET : null });
}
export function claimSetFingerprint({ authority }) {
  const state = internal(authority); return hash({ requirementFingerprint: requirementFingerprint({ authority }), claims: [...state.claims.values()].filter((item) => item.currentness === "current").map((item) => stable(item)).sort((a, b) => a.id.localeCompare(b.id)), claimTypeVersion: REGISTRY_VERSION_SET.claimType });
}
export function completionCandidateFingerprint({ authority, auditId }) { return hash({ requirementFingerprint: requirementFingerprint({ authority }), claimSetFingerprint: claimSetFingerprint({ authority }), auditId }); }
export function slotRegistryCoverageProof({ authority }) {
  const state = internal(authority); const registry = state.registries.slotRegistry;
  const hasAll = UNIVERSAL_SLOT_TEMPLATES.every((id) => registry.slots.some((slot) => slot.slotTemplateId === id && slot.satisfactionRuleId));
  const mapped = Boolean(state.coreUserValueMapping?.currentness === "current" && currentEvidence(state, state.coreUserValueMapping.evidenceId));
  return { registryVersion: registry.registryVersion, semanticRegistryVersion: registry.semanticRegistryVersion, complete: hasAll && mapped && registry.semanticRegistryVersion === REGISTRY_VERSION_SET.coreUserValuePattern };
}
export function capabilityCoverageProof({ authority }) {
  const state = internal(authority); const registry = slotRegistryCoverageProof({ authority });
  const unknownBlockingSlotIds = [...state.slots.values()].filter((slot) => slot.status !== "satisfied" || !currentEvidence(state, slot.evidenceId)).map((slot) => slot.slotTemplateId).sort();
  const provisionalBlockingCapabilityIds = [...state.capabilities.values()].filter((item) => item.currentness === "current" && item.provisional).map((item) => item.id).sort();
  return { requirementFingerprint: requirementFingerprint({ authority }), slotRegistryCoverageProofId: hash(registry), unknownBlockingSlotIds, provisionalBlockingCapabilityIds, complete: registry.complete && !unknownBlockingSlotIds.length && !provisionalBlockingCapabilityIds.length };
}
export function claimCoverageProof({ authority }) {
  const state = internal(authority); const entries = currentSources(state).map((source) => ({ sourceId: source.id, sourceKind: source.kind, claimIds: [...state.claims.values()].filter((claim) => claim.currentness === "current" && claim.sourceId === source.id && claim.targetId === source.targetId && claim.revisionId === source.revisionId && currentEvidence(state, claim.evidenceId, source.targetId)).map((claim) => claim.id) }));
  const uncoveredBlockingSourceIds = entries.filter((entry) => !entry.claimIds.length).map((entry) => entry.sourceId);
  return { claimSetFingerprint: claimSetFingerprint({ authority }), entries, uncoveredBlockingSourceIds, complete: entries.length > 0 && !uncoveredBlockingSourceIds.length };
}
export function provisionalCompletionProof({ authority }) {
  const state = internal(authority); const coverage = capabilityCoverageProof({ authority });
  const groundedCoreUserValue = Boolean(state.coreUserValue?.currentness === "current" && currentEvidence(state, state.coreUserValue.evidenceId, state.coreUserValue.targetId));
  const staleBlockingArtifactIds = [...state.artifacts.values()].filter((item) => item.currentness === "stale" && item.blocking).map((item) => item.id).sort();
  const allDecisionsSettled = [...state.decisions.values()].filter((item) => item.currentness === "current").every((item) => currentEvidence(state, item.evidenceId, item.targetId));
  const graphFixpointReached = coverage.complete && allDecisionsSettled;
  const complete = groundedCoreUserValue && coverage.complete && allDecisionsSettled && graphFixpointReached && !staleBlockingArtifactIds.length;
  return deepFreeze({ requirementFingerprint: requirementFingerprint({ authority }), proofId: hash({ requirementFingerprint: requirementFingerprint({ authority }), groundedCoreUserValue, coverage: coverage.complete, allDecisionsSettled, graphFixpointReached, staleBlockingArtifactIds }), groundedCoreUserValue, capabilityCoverageComplete: coverage.complete, allDecisionsSettled, blockingConflictIds: [], blockingFeasibilityIssueIds: [], graphFixpointReached, staleBlockingArtifactIds, complete });
}
const internalSpecElements = (state) => currentSources(state).map((source, index) => ({ id: `spec:${index}:${source.id}`, kind: index % 2 ? "acceptance_criteria" : "functional_requirement", sourceClaimIds: [`claim:${source.id}`] }));
export function requestAuditExecution({ authority, auditId }) {
  const state = internal(authority); if (!auditId) throw new Error("invalid audit request");
  const provisional = provisionalCompletionProof({ authority }); const claims = claimCoverageProof({ authority }); const fp = requirementFingerprint({ authority });
  const passed = provisional.complete && claims.complete;
  state.audits.set(auditId, { auditId, executorId: state.registries.auditExecutor.id, executorVersion: state.registries.auditExecutor.version, auditRuleId: state.registries.auditRule.id, requirementFingerprint: fp, outcome: passed ? "passed" : "failed", completed: true, rejectedGapFingerprints: passed ? [] : [hash({ provisional, claims })] });
  return { accepted: true, auditId, passed };
}
export function auditTerminalState({ authority, auditId }) {
  const state = internal(authority); const audit = state.audits.get(auditId); const fp = requirementFingerprint({ authority });
  if (!audit || audit.requirementFingerprint !== fp) return { state: "stale", rejectedGapFingerprints: audit?.rejectedGapFingerprints ?? [] };
  return { state: audit.completed && audit.outcome === "passed" ? "passed" : "failed_terminal", rejectedGapFingerprints: audit.rejectedGapFingerprints };
}
export function validateSpecClaimConformance({ authority }) {
  const state = internal(authority); const elements = internalSpecElements(state); const claimIds = new Set([...state.claims.values()].filter((claim) => claim.currentness === "current" && currentEvidence(state, claim.evidenceId, claim.targetId)).map((claim) => claim.id));
  const invalidElementIds = elements.filter((element) => element.sourceClaimIds.some((id) => !claimIds.has(id))).map((element) => element.id);
  return { invalidElementIds, complete: elements.length > 0 && !invalidElementIds.length };
}
export function finalCompletionProof({ authority, auditId }) {
  internal(authority); const provisional = provisionalCompletionProof({ authority }); const claims = claimCoverageProof({ authority }); const audit = auditTerminalState({ authority, auditId }); const spec = validateSpecClaimConformance({ authority }); const requirementFp = requirementFingerprint({ authority });
  const complete = provisional.complete && claims.complete && audit.state === "passed" && spec.complete;
  return deepFreeze({ requirementFingerprint: requirementFp, completionCandidateFingerprint: completionCandidateFingerprint({ authority, auditId }), provisionalCompletionProofId: provisional.proofId, capabilityCoverageComplete: provisional.capabilityCoverageComplete, claimCoverageComplete: claims.complete, auditState: audit.state, specClaimConformanceComplete: spec.complete, complete });
}
export function requestMigration({ authority, request }) {
  const state = internal(authority);
  if (!request || typeof request.sourceId !== "string" || !request.sourceId) throw new Error("invalid migration request");
  // PR0 deliberately has no v4 source connector. A request is recorded but no
  // authority projection is created until an internal authenticated adapter exists.
  state.migrationRequests.set(request.sourceId, { sourceId: request.sourceId, status: "unavailable_without_internal_adapter" });
  return { accepted: false, reason: "no_internal_authenticated_legacy_source" };
}
export function currentMigrationProjection({ authority, sourceFactFingerprint }) { internal(authority); void sourceFactFingerprint; return null; }
