/**
 * QA-PR0 Question Authority Gate.
 *
 * Pure, fail-closed admission for question candidates. This module does not
 * mutate PR0/PR1 authority, create capabilities/decisions, settle values, or
 * enforce UI behavior.
 */

export const QUESTION_AUTHORITY_VERSION = "v5-qa-pr0.0";

export const CAPABILITY_ADMISSION_AUTHORITY_TYPES = Object.freeze([
  "explicit_user_evidence",
  "registered_pattern_minimum_rule",
  "registered_unique_transform",
  "registered_required_dependency",
]);

export const MVP_CONTRACT_FIELD_IDS = Object.freeze([
  "actor",
  "input",
  "output",
  "core_rule",
  "primary_interaction",
  "state_boundary",
  "external_boundary",
  "external_consequence",
]);

const ALLOWED_AUTHORITY = new Set(CAPABILITY_ADMISSION_AUTHORITY_TYPES);
const ALLOWED_MVP_FIELDS = new Set(MVP_CONTRACT_FIELD_IDS);
const current = (artifact) => artifact?.currentness === "current";
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const reject = (reasonCode, diagnostics = {}) => Object.freeze({ approved: false, status: "rejected", reasonCode, diagnostics: Object.freeze(diagnostics) });
const approve = (diagnostics = {}) => Object.freeze({ approved: true, status: "approved_shadow_only", reasonCode: "approved", diagnostics: Object.freeze(diagnostics) });

export function validateCapabilityAdmission(admission) {
  if (!admission || !ALLOWED_AUTHORITY.has(admission.authorityType)) return reject("INVALID_CAPABILITY_ADMISSION_AUTHORITY");
  if (!nonBlank(admission.capabilityInstanceId) || !nonBlank(admission.capabilityTypeId)) return reject("INVALID_CAPABILITY_ADMISSION");
  if (!current(admission)) return reject("STALE_CAPABILITY_ADMISSION");
  if (!nonBlank(admission.authorityRefId)) return reject("MISSING_CAPABILITY_ADMISSION_AUTHORITY_REF");
  return approve({ capabilityInstanceId: admission.capabilityInstanceId, authorityType: admission.authorityType });
}

export function validateMaterialityProof(proof, candidate, context) {
  if (!proof || !current(proof)) return reject("MISSING_OR_STALE_MATERIALITY_PROOF");
  if (!nonBlank(proof.proofId) || proof.complete !== true) return reject("INCOMPLETE_MATERIALITY_PROOF");
  if (proof.targetDecisionInstanceId !== candidate.targetDecisionInstanceId) return reject("MATERIALITY_DECISION_MISMATCH");
  if (proof.requirementFingerprint !== context.requirementFingerprint) return reject("STALE_MATERIALITY_FINGERPRINT");
  if (!Array.isArray(proof.evaluatedRuleIds) || proof.evaluatedRuleIds.length === 0 || proof.evaluatedRuleIds.some((id) => !context.registeredMaterialityRuleIds?.includes(id))) return reject("UNREGISTERED_MATERIALITY_RULE");
  if (!Array.isArray(proof.affectedMvpFieldIds) || proof.affectedMvpFieldIds.length === 0 || proof.affectedMvpFieldIds.some((id) => !ALLOWED_MVP_FIELDS.has(id))) return reject("NO_MATERIAL_MVP_IMPACT");
  return approve({ proofId: proof.proofId, affectedMvpFieldIds: proof.affectedMvpFieldIds });
}

/**
 * Evaluate a QuestionCandidate without mutating any authoritative state.
 * All referenced capabilities and decisions must already exist in the supplied
 * authoritative snapshot. AI-provided importance/productImpact fields are
 * deliberately ignored.
 */
export function evaluateQuestionAuthority(candidate, context) {
  if (!candidate || !context) return reject("INVALID_QUESTION_CANDIDATE");
  if (!nonBlank(candidate.questionCandidateId) || !nonBlank(candidate.targetDecisionInstanceId) || !nonBlank(candidate.targetCapabilityInstanceId)) return reject("INVALID_QUESTION_CANDIDATE");
  if (!nonBlank(candidate.decisionTypeId) || !context.registeredDecisionTypeIds?.includes(candidate.decisionTypeId)) return reject("UNKNOWN_DECISION_TYPE");
  if (!nonBlank(candidate.capabilityTypeId) || !context.registeredCapabilityTypeIds?.includes(candidate.capabilityTypeId)) return reject("UNKNOWN_CAPABILITY_TYPE");
  if (!ALLOWED_MVP_FIELDS.has(candidate.affectedMvpFieldId)) return reject("INVALID_MVP_CONTRACT_FIELD");

  const capability = context.capabilities?.find((item) => item.id === candidate.targetCapabilityInstanceId);
  if (!capability || !current(capability) || capability.typeId !== candidate.capabilityTypeId) return reject("QUESTION_ASSUMES_UNADMITTED_CAPABILITY");
  const admission = context.capabilityAdmissions?.find((item) => item.capabilityInstanceId === capability.id);
  const admissionResult = validateCapabilityAdmission(admission);
  if (!admissionResult.approved) return reject("QUESTION_ASSUMES_UNADMITTED_CAPABILITY", { admissionReason: admissionResult.reasonCode });

  const decision = context.decisions?.find((item) => item.id === candidate.targetDecisionInstanceId);
  if (!decision || !current(decision) || decision.typeId !== candidate.decisionTypeId) return reject("QUESTION_ASSUMES_UNADMITTED_DECISION");
  if (decision.status !== "unresolved") return reject("DECISION_ALREADY_DETERMINED");
  if (decision.scopeKey !== capability.scopeKey || candidate.scopeKey !== decision.scopeKey) return reject("QUESTION_SCOPE_MISMATCH");

  if (!Array.isArray(candidate.sourceEvidenceIds) || candidate.sourceEvidenceIds.length === 0) return reject("QUESTION_MISSING_GROUNDING");
  const evidenceById = new Map((context.evidence ?? []).map((item) => [item.id, item]));
  if (candidate.sourceEvidenceIds.some((id) => !current(evidenceById.get(id)))) return reject("QUESTION_MISSING_OR_STALE_GROUNDING");

  const proof = context.materialityProofs?.find((item) => item.proofId === candidate.materialityProofId);
  const materiality = validateMaterialityProof(proof, candidate, context);
  if (!materiality.approved) return materiality;

  if (candidate.delegationStatus === "already_delegated") return reject("QUESTION_ALREADY_DELEGATED");
  if (candidate.presentation?.templateKind === "template_missing_fallback" && !context.registeredDecisionTypeIds.includes(candidate.decisionTypeId)) return reject("UNKNOWN_DECISION_TYPE");
  if (!nonBlank(candidate.presentation?.templateId) && candidate.presentation?.templateKind !== "template_missing_fallback") return reject("QUESTION_PRESENTATION_UNSAFE");
  if (candidate.presentation?.containsInternalId === true) return reject("QUESTION_PRESENTATION_UNSAFE");

  return approve({
    questionCandidateId: candidate.questionCandidateId,
    targetDecisionInstanceId: candidate.targetDecisionInstanceId,
    materialityProofId: proof.proofId,
    shadowOnly: true,
  });
}

/** QA-PR1: diagnostic-only shadow evaluation. Never changes UI behavior. */
export function shadowEvaluateQuestion(candidate, context) {
  const result = evaluateQuestionAuthority(candidate, context);
  return Object.freeze({
    mode: "shadow",
    enforceUi: false,
    candidateId: candidate?.questionCandidateId ?? null,
    approved: result.approved,
    reasonCode: result.reasonCode,
    requirementFingerprint: context?.requirementFingerprint ?? null,
    evaluatedAt: new Date().toISOString(),
  });
}
