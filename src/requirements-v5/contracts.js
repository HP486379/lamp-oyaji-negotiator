/**
 * v5 PR0 — Contract Kernel / Verifier.
 *
 * This module deliberately does not interpret natural language or produce
 * semantic requirements. Production callers may submit raw events, but no raw
 * event can become Evidence, a settled Slot, a Claim, or Completion until a
 * later PR connects registered semantic producers to this verifier.
 */
import { createHash } from "node:crypto";

export const REGISTRY_VERSION_SET = Object.freeze({
  decisionType: "v5-pr0.4", capabilityType: "v5-pr0.4", trait: "v5-pr0.4",
  coreUserValuePattern: "v5-pr0.4", slotTemplate: "v5-pr0.4",
  criticalityRule: "v5-pr0.4", claimType: "v5-pr0.4", auditRule: "v5-pr0.4",
  migrationAdapter: "v5-pr0.4",
});
export const UNIVERSAL_SLOT_TEMPLATES = Object.freeze([
  "actor_participation", "primary_interaction", "required_input", "required_output",
  "success_observability", "state_continuity", "external_boundary", "failure_observability",
]);
export const REQUIRED_SPEC_ELEMENT_KINDS = Object.freeze([
  "functional_requirement", "data_model_field", "state_transition", "error_handling_rule",
  "acceptance_criteria", "primary_flow_step", "required_product_paragraph",
]);

const PRIVATE = new WeakMap();
const KERNEL = new WeakMap();
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const hash = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const uniqueSorted = (values = []) => [...new Set(values ?? [])].sort();
const freeze = (value) => Object.freeze(value);
const asArray = (value) => Array.isArray(value) ? value : [];
const byId = (items) => new Map(asArray(items).map((item) => [item.id, item]));
const current = (item) => item?.currentness === "current";
const collection = (value) => value === null ? { presence: "null", values: null } : Array.isArray(value) ? { presence: "array", values: uniqueSorted(value) } : { presence: "missing", values: null };
const result = (errors, details = {}) => freeze({ eligible: errors.length === 0, status: errors.length ? "blocked_invariant" : "eligible", errors: uniqueSorted(errors), ...details });

export function canonicalCapabilityKey(key) {
  return { capabilityTypeId: key.capabilityTypeId, parentCapabilityInstanceId: key.parentCapabilityInstanceId ?? null, managedObjectIds: collection(key.managedObjectIds), actorIds: collection(key.actorIds), phaseKindId: key.phaseKindId ?? null };
}
export function canonicalDecisionKey(key, definition = null) {
  const value = { decisionTypeId: key.decisionTypeId, capabilityInstanceId: key.capabilityInstanceId ?? null, managedObjectIds: collection(key.managedObjectIds), actorIds: collection(key.actorIds), phaseKindId: key.phaseKindId ?? null };
  if (!value.capabilityInstanceId && definition?.globalScopeAllowed !== true) throw new Error("decision scope requires a capability instance");
  return value;
}
export const capabilityInstanceId = (key) => `cap:${hash(canonicalCapabilityKey(key))}`;
export const decisionInstanceId = (key, definition) => `dec:${hash(canonicalDecisionKey(key, definition))}`;

/** Raw-event ingress has no semantic side effects in PR0. */
export function createArchitectureAuthority() {
  const authority = freeze({ kind: "v5-pr0-contract-authority", version: "pr0.4" });
  PRIVATE.set(authority, { rawEvents: new Map() });
  return authority;
}
const internalAuthority = (authority) => {
  const state = PRIVATE.get(authority);
  if (!state) throw new Error("invalid architecture authority handle");
  return state;
};
const rawDigest = (event) => hash({ eventId: event.eventId, type: event.type, text: event.text ?? "", questionId: event.questionId ?? null, sourceId: event.sourceId ?? null });
const recordRaw = (authority, event, type) => {
  const state = internalAuthority(authority);
  if (!event || typeof event.eventId !== "string" || !event.eventId || typeof event.text !== "string") throw new Error("invalid raw event");
  const stored = freeze({ eventId: event.eventId, type, text: event.text, questionId: event.questionId ?? null, sourceId: event.sourceId ?? null, digest: rawDigest({ ...event, type }) });
  const prior = state.rawEvents.get(stored.eventId);
  if (prior && prior.digest !== stored.digest) throw new Error("raw event replay was modified");
  if (!prior) state.rawEvents.set(stored.eventId, stored);
  return { accepted: true, replay: Boolean(prior), status: "blocked_missing_authority", reasonCodes: ["semantic_authority_unavailable"] };
};
export const submitRawInitialInput = ({ authority, event }) => recordRaw(authority, event, "initial_input");
export const submitRawUserAnswer = ({ authority, event }) => recordRaw(authority, event, "user_answer");
export const submitExplicitUserConfirmation = ({ authority, event }) => recordRaw(authority, event, "user_confirmation");
export const listPendingQuestions = ({ authority }) => { internalAuthority(authority); return []; };
export function productionCompletionStatus({ authority }) {
  internalAuthority(authority);
  return freeze({ eligible: false, status: "blocked_missing_authority", reasonCodes: ["semantic_authority_unavailable", "registered_registry_unavailable", "registered_rule_engine_unavailable", "registered_audit_executor_unavailable"] });
}
export const provisionalCompletionProof = ({ authority }) => productionCompletionStatus({ authority });
export const finalCompletionProof = ({ authority }) => productionCompletionStatus({ authority });
export const requestAuditExecution = ({ authority }) => productionCompletionStatus({ authority });
export const auditTerminalState = ({ authority }) => productionCompletionStatus({ authority });
export const requestMigration = ({ authority }) => productionCompletionStatus({ authority });
export const currentMigrationProjection = ({ authority }) => { internalAuthority(authority); return null; };

/** Canonical, phase-separated fingerprints for semantic artifacts from future producers. */
export function requirementFingerprint(state) {
  return hash({
    coreUserValue: state.coreUserValue ? { revisionId: state.coreUserValue.revisionId, value: state.coreUserValue.value, patternId: state.coreUserValue.patternId } : null,
    actors: asArray(state.actors).filter(current).map(stable).sort((a, b) => a.id.localeCompare(b.id)),
    managedObjects: asArray(state.managedObjects).filter(current).map(stable).sort((a, b) => a.id.localeCompare(b.id)),
    capabilities: asArray(state.capabilities).filter(current).map((item) => ({ id: item.id, key: item.key, scopeKey: item.scopeKey, evidenceId: item.evidenceId })).sort((a, b) => a.id.localeCompare(b.id)),
    traits: asArray(state.traits).filter(current).map((item) => ({ id: item.id, value: item.value, scopeKey: item.scopeKey })).sort((a, b) => a.id.localeCompare(b.id)),
    decisionRevisions: asArray(state.decisionRevisions).filter(current).map((item) => ({ id: item.id, instanceId: item.instanceId, value: item.value, scopeKey: item.scopeKey })).sort((a, b) => a.id.localeCompare(b.id)),
    openBlockingIssues: asArray(state.issues).filter((item) => current(item) && item.blocking).map((item) => ({ id: item.id, kind: item.kind, scopeKey: item.scopeKey })).sort((a, b) => a.id.localeCompare(b.id)),
    registryVersions: state.registry?.versionSet ?? null,
  });
}
export function claimSetFingerprint(state) {
  return hash({ requirementFingerprint: requirementFingerprint(state), claimTypeRegistryVersion: state.registry?.versionSet?.claimType ?? null, claims: asArray(state.claims).filter(current).map((item) => ({ id: item.id, sourceId: item.sourceId, typeId: item.typeId, evidenceId: item.evidenceId, scopeKey: item.scopeKey })).sort((a, b) => a.id.localeCompare(b.id)) });
}
export const completionCandidateFingerprint = (state, auditId) => hash({ requirementFingerprint: requirementFingerprint(state), claimSetFingerprint: claimSetFingerprint(state), auditId });

const ruleIds = (registry) => new Set(asArray(registry?.rules).map((item) => item.id));
const registryVersionsMatch = (versionSet) => JSON.stringify(stable(versionSet)) === JSON.stringify(stable(REGISTRY_VERSION_SET));
export function validateRegistryContext(registry) {
  const errors = [];
  if (!registry || !registryVersionsMatch(registry.versionSet)) errors.push("registry_version_mismatch");
  const slotIds = new Set(asArray(registry?.slotTemplates).map((item) => item.slotTemplateId));
  for (const id of UNIVERSAL_SLOT_TEMPLATES) if (!slotIds.has(id)) errors.push(`missing_universal_slot:${id}`);
  const rules = ruleIds(registry);
  for (const slot of asArray(registry?.slotTemplates)) if (!slot.satisfactionRuleId || !rules.has(slot.satisfactionRuleId)) errors.push(`unresolved_satisfaction_rule:${slot.slotTemplateId ?? "unknown"}`);
  const patternIds = new Set(asArray(registry?.coreUserValuePatterns).map((item) => item.id));
  if (!patternIds.size) errors.push("missing_core_user_value_pattern_registry");
  for (const pattern of asArray(registry?.coreUserValuePatterns)) for (const id of [...asArray(pattern.universalSlotTemplateIds), ...asArray(pattern.patternSlotTemplateIds)]) if (!slotIds.has(id)) errors.push(`uncovered_pattern_slot:${pattern.id}:${id}`);
  if (!asArray(registry?.claimTypes).length) errors.push("missing_claim_type_registry");
  if (!asArray(registry?.auditExecutors).length) errors.push("missing_audit_executor_registry");
  if (!asArray(registry?.allowedEvidenceRelations).length) errors.push("missing_evidence_relation_registry");
  return result(errors, { registryFingerprint: hash(registry ?? null) });
}

export function validateRevisionInvariants({ revisions, dependencies = [] }) {
  const errors = []; const heads = new Map();
  for (const revision of asArray(revisions)) {
    if (!revision.id || !revision.instanceId) errors.push("invalid_revision_identity");
    if (current(revision)) heads.set(revision.instanceId, [...(heads.get(revision.instanceId) ?? []), revision.id]);
    if (revision.supersedesRevisionId && revision.supersedesRevisionId === revision.id) errors.push(`revision_self_supersede:${revision.id}`);
  }
  for (const [instanceId, ids] of heads) if (ids.length !== 1) errors.push(`multiple_current_heads:${instanceId}`);
  const graph = new Map();
  for (const edge of asArray(dependencies)) { if (!edge.fromId || !edge.toId) errors.push("invalid_dependency_edge"); graph.set(edge.fromId, [...(graph.get(edge.fromId) ?? []), edge.toId]); }
  const visiting = new Set(); const visited = new Set();
  const visit = (node) => { if (visiting.has(node)) return true; if (visited.has(node)) return false; visiting.add(node); const cycle = (graph.get(node) ?? []).some(visit); visiting.delete(node); visited.add(node); return cycle; };
  if ([...graph.keys()].some(visit)) errors.push("artifact_dependency_cycle");
  return result(errors);
}

export function validateEvidenceEdges({ registry, revisions, targets, evidenceEdges }) {
  const errors = [...validateRegistryContext(registry).errors]; const revisionMap = byId(revisions); const targetMap = byId(targets); const edgeMap = byId(evidenceEdges); const relations = new Set(asArray(registry?.allowedEvidenceRelations));
  for (const edge of asArray(evidenceEdges)) {
    const source = revisionMap.get(edge.sourceRevisionId); const target = targetMap.get(edge.targetId);
    if (!edge.id || !source || !current(source)) errors.push(`evidence_source_not_current:${edge.id ?? "unknown"}`);
    if (!target || !current(target)) errors.push(`evidence_target_not_current:${edge.id ?? "unknown"}`);
    if (!relations.has(edge.relation)) errors.push(`invalid_evidence_relation:${edge.id ?? "unknown"}`);
    if (edge.evidenceSpan !== source?.text) errors.push(`evidence_span_mismatch:${edge.id ?? "unknown"}`);
    if (edge.scopeKey !== source?.scopeKey || edge.scopeKey !== target?.scopeKey) errors.push(`evidence_scope_mismatch:${edge.id ?? "unknown"}`);
    if (edge.classification !== target?.classification) errors.push(`evidence_classification_mismatch:${edge.id ?? "unknown"}`);
    if ((edge.derivationDepth ?? 0) > 0 && (!edge.parentEdgeId || !edgeMap.has(edge.parentEdgeId))) errors.push(`missing_evidence_parent:${edge.id ?? "unknown"}`);
    if ((edge.derivationDepth ?? 0) > 1) errors.push(`evidence_derivation_depth_exceeded:${edge.id ?? "unknown"}`);
  }
  return result(errors);
}

const evidenceCurrentFor = (state, evidenceId, targetId, scopeKey) => {
  const edge = byId(state.evidenceEdges).get(evidenceId); const revision = edge && byId(state.revisions).get(edge.sourceRevisionId); const target = edge && byId(state.targets).get(edge.targetId);
  return Boolean(edge && current(edge) && current(revision) && current(target) && edge.targetId === targetId && edge.scopeKey === scopeKey);
};
export function validateCapabilityCoverageProof({ state, proof }) {
  const errors = [...validateRegistryContext(state?.registry).errors, ...validateEvidenceEdges({ registry: state?.registry, revisions: state?.revisions, targets: state?.targets, evidenceEdges: state?.evidenceEdges }).errors]; const expectedFingerprint = requirementFingerprint(state);
  if (proof?.requirementFingerprint !== expectedFingerprint) errors.push("requirement_fingerprint_mismatch");
  const pattern = asArray(state?.registry?.coreUserValuePatterns).find((item) => item.id === state?.coreUserValue?.patternId);
  if (!state?.coreUserValue || !pattern || !evidenceCurrentFor(state, state.coreUserValue.evidenceId, state.coreUserValue.targetId, state.coreUserValue.scopeKey)) errors.push("core_user_value_not_grounded_or_mapped");
  const requiredSlotIds = uniqueSorted([...asArray(pattern?.universalSlotTemplateIds), ...asArray(pattern?.patternSlotTemplateIds)]); const slots = new Map(asArray(proof?.slotEvaluations).map((item) => [item.slotTemplateId, item]));
  for (const slotId of requiredSlotIds) { const slot = slots.get(slotId); if (!slot || !["satisfied", "explicitly_not_required", "not_applicable"].includes(slot.status)) errors.push(`required_slot_unresolved:${slotId}`); if (slot?.status === "satisfied" && !evidenceCurrentFor(state, slot.evidenceId, slot.targetId, slot.scopeKey)) errors.push(`slot_evidence_not_current:${slotId}`); if (slot?.status !== "satisfied" && !slot?.ruleId) errors.push(`slot_closure_rule_missing:${slotId}`); }
  return result(errors, { requirementFingerprint: expectedFingerprint, requiredSlotIds });
}

const requiredSources = (state) => [
  ...asArray(state?.capabilities).filter((item) => current(item) && item.blocking).map((item) => ({ id: item.id, kind: "capability", scopeKey: item.scopeKey, targetId: item.targetId })),
  ...asArray(state?.decisionRevisions).filter((item) => current(item) && ["settled", "delegated"].includes(item.status)).map((item) => ({ id: item.id, kind: "decision", scopeKey: item.scopeKey, targetId: item.targetId })),
  ...asArray(state?.coreInvariants).filter(current).map((item) => ({ id: item.id, kind: "core_invariant", scopeKey: item.scopeKey, targetId: item.targetId })),
  ...asArray(state?.primaryFlows).filter(current).map((item) => ({ id: item.id, kind: "primary_flow", scopeKey: item.scopeKey, targetId: item.targetId })),
];
export function validateClaimCoverageProof({ state, proof }) {
  const errors = []; if (proof?.claimSetFingerprint !== claimSetFingerprint(state)) errors.push("claim_set_fingerprint_mismatch"); const claimTypes = new Set(asArray(state?.registry?.claimTypes).map((item) => item.id));
  for (const source of requiredSources(state)) { const claims = asArray(state.claims).filter((claim) => current(claim) && claim.sourceId === source.id); if (!claims.length) errors.push(`missing_required_claim:${source.id}`); for (const claim of claims) { if (!claimTypes.has(claim.typeId)) errors.push(`unregistered_claim_type:${claim.id}`); if (claim.scopeKey !== source.scopeKey || claim.targetId !== source.targetId) errors.push(`claim_source_scope_mismatch:${claim.id}`); if (!evidenceCurrentFor(state, claim.evidenceId, claim.targetId, claim.scopeKey)) errors.push(`claim_not_grounded:${claim.id}`); } }
  return result(errors);
}

export function validateProvisionalCompletionProof({ state, proof }) {
  const errors = []; const coverage = validateCapabilityCoverageProof({ state, proof: proof?.capabilityCoverageProof }); if (!coverage.eligible) errors.push(...coverage.errors);
  if (proof?.requirementFingerprint !== requirementFingerprint(state)) errors.push("provisional_requirement_fingerprint_mismatch");
  if (asArray(state?.decisionRevisions).some((item) => current(item) && item.blocking && !["settled", "delegated"].includes(item.status))) errors.push("unresolved_blocking_decision");
  if (asArray(state?.issues).some((item) => current(item) && item.blocking && ["conflict", "feasibility"].includes(item.kind))) errors.push("blocking_conflict_or_feasibility_issue");
  if (state?.graphFixpoint?.reached !== true) errors.push("graph_fixpoint_not_reached"); if (asArray(state?.artifacts).some((item) => item.blocking && item.currentness === "stale")) errors.push("stale_blocking_artifact");
  return result(errors);
}

export function validateAuditProof({ state, auditProof, provisionalProof }) {
  const errors = []; const executors = new Map(asArray(state?.registry?.auditExecutors).map((item) => [item.id, item])); const executor = executors.get(auditProof?.executorId);
  if (!executor || executor.version !== auditProof?.executorVersion) errors.push("unregistered_or_version_mismatched_audit_executor");
  if (auditProof?.outcome !== "passed" || auditProof?.completed !== true || !auditProof?.executionId) errors.push("audit_not_successfully_executed");
  if (auditProof?.requirementFingerprint !== requirementFingerprint(state)) errors.push("stale_audit_requirement_fingerprint"); if (auditProof?.provisionalProofId !== provisionalProof?.proofId) errors.push("audit_provisional_proof_mismatch"); if (asArray(auditProof?.blockingGapIds).length) errors.push("audit_has_blocking_gaps");
  return result(errors);
}

export function validateSpecClaimConformance({ state, spec }) {
  const errors = []; const claims = new Set(asArray(state?.claims).filter(current).map((item) => item.id));
  for (const element of asArray(spec?.elements)) { if (!REQUIRED_SPEC_ELEMENT_KINDS.includes(element.kind)) continue; if (!asArray(element.sourceClaimIds).length) errors.push(`spec_element_missing_claim_ids:${element.id}`); if (asArray(element.sourceClaimIds).some((id) => !claims.has(id))) errors.push(`spec_element_unknown_claim:${element.id}`); }
  if (!asArray(spec?.elements).length) errors.push("missing_generated_spec_artifact"); return result(errors);
}

export function validateFinalCompletionProof({ state, provisionalProof, claimCoverageProof, auditProof, spec, finalProof }) {
  const errors = []; const provisional = validateProvisionalCompletionProof({ state, proof: provisionalProof }); if (!provisional.eligible) errors.push(...provisional.errors); const claims = validateClaimCoverageProof({ state, proof: claimCoverageProof }); if (!claims.eligible) errors.push(...claims.errors); const audit = validateAuditProof({ state, auditProof, provisionalProof }); if (!audit.eligible) errors.push(...audit.errors); const conformance = validateSpecClaimConformance({ state, spec }); if (!conformance.eligible) errors.push(...conformance.errors);
  const candidate = completionCandidateFingerprint(state, auditProof?.auditId); if (finalProof?.completionCandidateFingerprint !== candidate) errors.push("completion_candidate_fingerprint_mismatch"); if (finalProof?.provisionalProofId !== provisionalProof?.proofId || finalProof?.auditId !== auditProof?.auditId) errors.push("final_proof_chain_mismatch");
  return result(errors, { completionCandidateFingerprint: candidate });
}

export const migrationRecordId = (record) => `migration:${hash({ sourceContextVersion: record.sourceContextVersion, targetContextVersion: record.targetContextVersion, sourceFactFingerprint: record.sourceFactFingerprint, registryVersionSet: record.registryVersionSet })}`;
export function validateMigrationRecord({ record, registry, existingRecords = [], currentProjection }) {
  const errors = [...validateRegistryContext(registry).errors]; for (const field of ["migrationId", "sourceContextVersion", "targetContextVersion", "sourceFactFingerprint", "registryVersionSet", "migrationStatus", "migrationWarnings"]) if (record?.[field] === undefined || record?.[field] === null) errors.push(`migration_missing_field:${field}`);
  if (record?.migrationId && record.migrationId !== migrationRecordId(record)) errors.push("migration_identity_mismatch"); if (!registryVersionsMatch(record?.registryVersionSet)) errors.push("migration_registry_version_mismatch"); const duplicate = asArray(existingRecords).filter((item) => item.sourceFactFingerprint === record?.sourceFactFingerprint && item.targetContextVersion === record?.targetContextVersion && item.migrationId !== record?.migrationId); if (duplicate.length) errors.push("migration_idempotency_violation"); if (currentProjection && currentProjection.migrationId !== record?.migrationId) errors.push("migration_current_projection_mismatch"); return result(errors);
}

/** In-memory transaction/DAG kernel. It transports only already-validated facts. */
export function createTransactionKernel({ revisions = [], dependencies = [] } = {}) { const kernel = freeze({ kind: "v5-pr0-transaction-kernel" }); KERNEL.set(kernel, { version: 0, revisions: [...revisions], dependencies: [...dependencies] }); return kernel; }
const kernelState = (kernel) => { const state = KERNEL.get(kernel); if (!state) throw new Error("invalid transaction kernel"); return state; };
export function beginTransaction(kernel) { const state = kernelState(kernel); return { kernel, baseVersion: state.version, revisions: [...state.revisions], dependencies: [...state.dependencies], closed: false }; }
export function proposeRevision(transaction, revision) { if (transaction.closed) throw new Error("transaction is closed"); transaction.revisions.push({ ...revision }); }
export function proposeDependency(transaction, dependency) { if (transaction.closed) throw new Error("transaction is closed"); transaction.dependencies.push({ ...dependency }); }
export function rollbackTransaction(transaction) { transaction.closed = true; return freeze({ committed: false, rolledBack: true }); }
export function commitTransaction(transaction) {
  if (transaction.closed) throw new Error("transaction is closed"); const state = kernelState(transaction.kernel); if (state.version !== transaction.baseVersion) { transaction.closed = true; return freeze({ committed: false, rolledBack: true, errors: ["optimistic_concurrency_conflict"] }); }
  const validation = validateRevisionInvariants({ revisions: transaction.revisions, dependencies: transaction.dependencies }); if (!validation.eligible) { transaction.closed = true; return freeze({ committed: false, rolledBack: true, errors: validation.errors }); }
  const changedHeads = new Set(transaction.revisions.filter(current).map((item) => item.instanceId)); const stale = new Set(); const visit = (id) => transaction.dependencies.filter((edge) => edge.fromId === id).forEach((edge) => { if (!stale.has(edge.toId)) { stale.add(edge.toId); visit(edge.toId); } }); for (const id of changedHeads) visit(id);
  state.revisions = transaction.revisions.map((revision) => stale.has(revision.id) ? { ...revision, currentness: "stale" } : revision); state.dependencies = transaction.dependencies; state.version += 1; transaction.closed = true; return freeze({ committed: true, version: state.version, staleArtifactIds: uniqueSorted([...stale]) });
}
export function transactionSnapshot(kernel) { const state = kernelState(kernel); return freeze({ version: state.version, revisions: state.revisions.map((item) => ({ ...item })), dependencies: state.dependencies.map((item) => ({ ...item })) }); }
