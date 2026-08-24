import test from "node:test";
import assert from "node:assert/strict";
import {
  CORRELATION_STATUS,
  correlateQuestionAuthorityShadow,
} from "../src/requirements-v5/question-authority-correlation-shadow.js";

const adopted = (overrides = {}) => ({
  questionId: "question:location-method",
  questionRevision: "revision:3",
  questionFingerprint: "fingerprint:abc",
  displayed: true,
  ...overrides,
});

const shadow = (overrides = {}) => ({
  shadowAuditId: "shadow:1",
  questionId: "question:location-method",
  questionRevision: "revision:3",
  questionFingerprint: "fingerprint:abc",
  shadowAuthorityResult: "APPROVED",
  failedGate: null,
  reasonCode: null,
  targetCapability: "capability:location-input",
  currentness: "current",
  ...overrides,
});

const correlate = (question, results) => correlateQuestionAuthorityShadow({
  adoptedQuestion: question,
  shadowAuditResults: results,
  diagnosticId: "diagnostic:1",
  observedAt: "2026-08-24T00:00:00.000Z",
});

test("Fixture A: exact identity, revision, and fingerprint correlate as MATCHED", () => {
  const result = correlate(adopted(), [shadow()]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.MATCHED);
  assert.equal(result.shadowAuthorityResult, "APPROVED");
  assert.equal(result.displayed, true);
});

test("Fixture B: displayed reservation question correlates to an existing REJECT result without enforcement", () => {
  const question = adopted({
    questionId: "question:reservation-customer-information",
    questionFingerprint: "fingerprint:reservation",
  });
  const result = correlate(question, [shadow({
    questionId: question.questionId,
    questionFingerprint: question.questionFingerprint,
    shadowAuthorityResult: "REJECT",
    failedGate: "QG-04_CAPABILITY_ADMISSION",
    reasonCode: "QUESTION_ASSUMES_UNADMITTED_CAPABILITY",
    targetCapability: "reservation",
  })]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.MATCHED);
  assert.equal(result.shadowAuthorityResult, "REJECT");
  assert.equal(result.displayed, true);
  assert.equal(result.mutatesUi, false);
  assert.equal(result.mutatesQuestionRuntime, false);
  assert.equal(result.authorityEffect, "none");
});

test("Fixture C: same question ID with different revision is REVISION_MISMATCH", () => {
  const result = correlate(adopted(), [shadow({ questionRevision: "revision:2" })]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.REVISION_MISMATCH);
  assert.equal(result.shadowAuthorityResult, null);
});

test("Fixture D: same ID and revision with different fingerprint is FINGERPRINT_MISMATCH", () => {
  const result = correlate(adopted(), [shadow({ questionFingerprint: "fingerprint:other" })]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.FINGERPRINT_MISMATCH);
  assert.equal(result.shadowAuthorityResult, null);
});

test("Fixture E: exact stale shadow result is correlated as STALE", () => {
  const result = correlate(adopted(), [shadow({ currentness: "stale" })]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.STALE);
});

test("Fixture F: REJECT does not change displayed fact or runtime/state mutation flags", () => {
  const result = correlate(adopted(), [shadow({ shadowAuthorityResult: "REJECT" })]);
  assert.equal(result.displayed, true);
  assert.equal(result.mutatesUi, false);
  assert.equal(result.mutatesQuestionRuntime, false);
  assert.equal(result.mutatesQuestionQueue, false);
  assert.equal(result.mutatesDecisionState, false);
  assert.equal(result.mutatesCapabilityState, false);
  assert.equal(result.mutatesRequirementState, false);
});

test("Fixture G: inputs are not mutated and output is immutable diagnostic data", () => {
  const question = adopted();
  const audit = shadow();
  const beforeQuestion = JSON.parse(JSON.stringify(question));
  const beforeAudit = JSON.parse(JSON.stringify(audit));
  const result = correlate(question, [audit]);
  assert.deepEqual(question, beforeQuestion);
  assert.deepEqual(audit, beforeAudit);
  assert.equal(Object.isFrozen(result), true);
});

test("Fixture H: displayed question without shadow audit result is NOT_FOUND and runtime remains unchanged", () => {
  const question = adopted();
  const before = JSON.parse(JSON.stringify(question));
  const result = correlate(question, []);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.NOT_FOUND);
  assert.equal(result.reasonCode, "SHADOW_AUDIT_RESULT_NOT_FOUND");
  assert.equal(result.displayed, true);
  assert.equal(result.mutatesQuestionRuntime, false);
  assert.deepEqual(question, before);
});

test("displayed cannot be inferred from a candidate-like object", () => {
  assert.throws(() => correlate({
    questionId: "question:candidate-only",
    questionRevision: "revision:1",
    questionFingerprint: "fingerprint:candidate",
  }, [shadow()]), /displayed must be the existing runtime fact true/);
});

test("correlation does not recalculate fingerprints or accept text similarity", () => {
  const result = correlate(adopted(), [shadow({
    questionId: "question:other",
    questionRevision: "revision:999",
    questionFingerprint: "fingerprint:other",
    title: "same visible text",
  })]);
  assert.equal(result.correlationStatus, CORRELATION_STATUS.NOT_FOUND);
});

