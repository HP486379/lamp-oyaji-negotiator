import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_ADMISSION_AUTHORITY_TYPES,
  evaluateQuestionAuthority,
  shadowEvaluateQuestion,
  validateCapabilityAdmission,
} from "../src/requirements-v5/question-authority.js";

const base = () => ({
  requirementFingerprint: "reqfp:1",
  registeredCapabilityTypeIds: ["capability.location.search", "capability.reservation"],
  registeredDecisionTypeIds: ["decision.location.method", "decision.reservation.customer_information"],
  registeredMaterialityRuleIds: ["materiality.input.choice"],
  capabilities: [{ id: "cap:location", typeId: "capability.location.search", scopeKey: "core", currentness: "current" }],
  capabilityAdmissions: [{ capabilityInstanceId: "cap:location", capabilityTypeId: "capability.location.search", authorityType: "explicit_user_evidence", authorityRefId: "ev:idea", currentness: "current" }],
  decisions: [{ id: "dec:location", typeId: "decision.location.method", scopeKey: "core", status: "unresolved", currentness: "current" }],
  evidence: [{ id: "ev:idea", currentness: "current" }],
  materialityProofs: [{ proofId: "mat:location", targetDecisionInstanceId: "dec:location", evaluatedRuleIds: ["materiality.input.choice"], affectedMvpFieldIds: ["input"], complete: true, requirementFingerprint: "reqfp:1", currentness: "current" }],
});

const locationQuestion = () => ({
  questionCandidateId: "q:location",
  targetDecisionInstanceId: "dec:location",
  targetCapabilityInstanceId: "cap:location",
  decisionTypeId: "decision.location.method",
  capabilityTypeId: "capability.location.search",
  scopeKey: "core",
  sourceEvidenceIds: ["ev:idea"],
  materialityProofId: "mat:location",
  affectedMvpFieldId: "input",
  delegationStatus: "not_delegated",
  presentation: { templateKind: "registered_template", templateId: "question.location.method.v1", containsInternalId: false },
});

test("only the four registered capability admission authority types are accepted", () => {
  for (const authorityType of CAPABILITY_ADMISSION_AUTHORITY_TYPES) {
    assert.equal(validateCapabilityAdmission({ capabilityInstanceId: "cap:x", capabilityTypeId: "capability.x", authorityType, authorityRefId: "ref:x", currentness: "current" }).approved, true);
  }
  for (const authorityType of ["trusted_source", "system_inferred", "implementation_convenience", "legacy_source", "pr1_accepted"]) {
    assert.equal(validateCapabilityAdmission({ capabilityInstanceId: "cap:x", capabilityTypeId: "capability.x", authorityType, authorityRefId: "ref:x", currentness: "current" }).reasonCode, "INVALID_CAPABILITY_ADMISSION_AUTHORITY");
  }
});

test("grounded registered unresolved decision with deterministic materiality proof passes shadow gate", () => {
  assert.equal(evaluateQuestionAuthority(locationQuestion(), base()).approved, true);
});

test("playground reservation laundering is rejected when reservation capability was never admitted", () => {
  const context = base();
  context.decisions.push({ id: "dec:reservation", typeId: "decision.reservation.customer_information", scopeKey: "core", status: "unresolved", currentness: "current" });
  context.materialityProofs.push({ proofId: "mat:reservation", targetDecisionInstanceId: "dec:reservation", evaluatedRuleIds: ["materiality.input.choice"], affectedMvpFieldIds: ["input"], complete: true, requirementFingerprint: "reqfp:1", currentness: "current" });
  const result = evaluateQuestionAuthority({ ...locationQuestion(), questionCandidateId: "q:reservation", targetDecisionInstanceId: "dec:reservation", targetCapabilityInstanceId: "cap:reservation", decisionTypeId: "decision.reservation.customer_information", capabilityTypeId: "capability.reservation", materialityProofId: "mat:reservation" }, context);
  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "QUESTION_ASSUMES_UNADMITTED_CAPABILITY");
});

test("question candidate cannot create or substitute a missing unresolved decision", () => {
  const context = base();
  context.decisions = [];
  assert.equal(evaluateQuestionAuthority(locationQuestion(), context).reasonCode, "QUESTION_ASSUMES_UNADMITTED_DECISION");
  assert.equal(context.decisions.length, 0);
});

test("AI self-declared product impact cannot replace registered MaterialityProof", () => {
  const context = base();
  context.materialityProofs = [];
  const candidate = { ...locationQuestion(), materialAlternatives: [{ value: "gps", productImpact: "materially_changes_product" }] };
  assert.equal(evaluateQuestionAuthority(candidate, context).reasonCode, "MISSING_OR_STALE_MATERIALITY_PROOF");
});

test("stale evidence, decision, materiality proof, or fingerprint fail closed", () => {
  let context = base();
  context.evidence[0] = { ...context.evidence[0], currentness: "stale" };
  assert.equal(evaluateQuestionAuthority(locationQuestion(), context).reasonCode, "QUESTION_MISSING_OR_STALE_GROUNDING");

  context = base();
  context.decisions[0] = { ...context.decisions[0], currentness: "stale" };
  assert.equal(evaluateQuestionAuthority(locationQuestion(), context).reasonCode, "QUESTION_ASSUMES_UNADMITTED_DECISION");

  context = base();
  context.materialityProofs[0] = { ...context.materialityProofs[0], currentness: "stale" };
  assert.equal(evaluateQuestionAuthority(locationQuestion(), context).reasonCode, "MISSING_OR_STALE_MATERIALITY_PROOF");

  context = base();
  context.materialityProofs[0] = { ...context.materialityProofs[0], requirementFingerprint: "old" };
  assert.equal(evaluateQuestionAuthority(locationQuestion(), context).reasonCode, "STALE_MATERIALITY_FINGERPRINT");
});

test("unknown Decision Type never reaches template-missing fallback", () => {
  const candidate = { ...locationQuestion(), decisionTypeId: "decision.unknown", presentation: { templateKind: "template_missing_fallback", containsInternalId: false } };
  assert.equal(evaluateQuestionAuthority(candidate, base()).reasonCode, "UNKNOWN_DECISION_TYPE");
});

test("shadow evaluation is diagnostic-only and explicitly does not enforce UI", () => {
  const result = shadowEvaluateQuestion(locationQuestion(), base());
  assert.equal(result.mode, "shadow");
  assert.equal(result.enforceUi, false);
  assert.equal(result.approved, true);
});
