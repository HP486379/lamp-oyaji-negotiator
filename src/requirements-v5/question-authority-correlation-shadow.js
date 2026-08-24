const CORRELATION_STATUS = Object.freeze({
  MATCHED: "MATCHED",
  REVISION_MISMATCH: "REVISION_MISMATCH",
  FINGERPRINT_MISMATCH: "FINGERPRINT_MISMATCH",
  STALE: "STALE",
  NOT_FOUND: "NOT_FOUND",
});

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function validateObservedIdentity(value, sourceName) {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${sourceName} must be an object`);
  }
  for (const key of ["questionId", "questionRevision", "questionFingerprint"]) {
    if (!nonEmptyString(value[key])) {
      throw new TypeError(`${sourceName}.${key} must be a non-empty string`);
    }
  }
}

function immutableSnapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableSnapshot));
  if (value && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, immutableSnapshot(child)]),
    ));
  }
  return value;
}

function sameIdentity(left, right) {
  return left.questionId === right.questionId
    && left.questionRevision === right.questionRevision
    && left.questionFingerprint === right.questionFingerprint;
}

function findByQuestionId(results, questionId) {
  return results.filter((result) => result.questionId === questionId);
}

/**
 * Correlates two already-observed facts only:
 * 1) a question identity actually adopted by the existing Question Runtime;
 * 2) an audit result already emitted by the existing Question Authority Shadow.
 *
 * It does not execute or re-execute Question Authority, rebuild candidates,
 * regenerate proofs, calculate fingerprints, or infer whether a question was displayed.
 */
export function correlateQuestionAuthorityShadow({
  adoptedQuestion,
  shadowAuditResults,
  diagnosticId,
  observedAt,
}) {
  validateObservedIdentity(adoptedQuestion, "adoptedQuestion");
  if (adoptedQuestion.displayed !== true) {
    throw new TypeError("adoptedQuestion.displayed must be the existing runtime fact true");
  }
  if (!Array.isArray(shadowAuditResults)) {
    throw new TypeError("shadowAuditResults must be an array");
  }
  for (const result of shadowAuditResults) {
    validateObservedIdentity(result, "shadowAuditResult");
  }

  const exact = shadowAuditResults.find((result) => sameIdentity(adoptedQuestion, result));
  if (exact) {
    const status = exact.currentness === "stale" || exact.shadowAuthorityResult === "STALE"
      ? CORRELATION_STATUS.STALE
      : CORRELATION_STATUS.MATCHED;
    return immutableSnapshot({
      diagnosticId,
      observedAt,
      questionId: adoptedQuestion.questionId,
      questionRevision: adoptedQuestion.questionRevision,
      questionFingerprint: adoptedQuestion.questionFingerprint,
      displayed: true,
      correlationStatus: status,
      shadowAuthorityResult: exact.shadowAuthorityResult,
      failedGate: exact.failedGate ?? null,
      reasonCode: exact.reasonCode ?? null,
      targetCapability: exact.targetCapability ?? null,
      sourceShadowAuditId: exact.shadowAuditId ?? null,
      mutatesUi: false,
      mutatesQuestionRuntime: false,
      mutatesQuestionQueue: false,
      mutatesDecisionState: false,
      mutatesCapabilityState: false,
      mutatesRequirementState: false,
      authorityEffect: "none",
    });
  }

  const sameQuestionId = findByQuestionId(shadowAuditResults, adoptedQuestion.questionId);
  const sameRevision = sameQuestionId.filter(
    (result) => result.questionRevision === adoptedQuestion.questionRevision,
  );

  let correlationStatus = CORRELATION_STATUS.NOT_FOUND;
  let reasonCode = "SHADOW_AUDIT_RESULT_NOT_FOUND";
  if (sameQuestionId.length && !sameRevision.length) {
    correlationStatus = CORRELATION_STATUS.REVISION_MISMATCH;
    reasonCode = "CORRELATION_FAILED_REVISION_MISMATCH";
  } else if (sameRevision.length) {
    correlationStatus = CORRELATION_STATUS.FINGERPRINT_MISMATCH;
    reasonCode = "CORRELATION_FAILED_FINGERPRINT_MISMATCH";
  }

  return immutableSnapshot({
    diagnosticId,
    observedAt,
    questionId: adoptedQuestion.questionId,
    questionRevision: adoptedQuestion.questionRevision,
    questionFingerprint: adoptedQuestion.questionFingerprint,
    displayed: true,
    correlationStatus,
    shadowAuthorityResult: null,
    failedGate: null,
    reasonCode,
    targetCapability: null,
    sourceShadowAuditId: null,
    mutatesUi: false,
    mutatesQuestionRuntime: false,
    mutatesQuestionQueue: false,
    mutatesDecisionState: false,
    mutatesCapabilityState: false,
    mutatesRequirementState: false,
    authorityEffect: "none",
  });
}

export { CORRELATION_STATUS };
