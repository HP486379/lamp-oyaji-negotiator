import test from "node:test";
import assert from "node:assert/strict";
import * as runtime from "../src/requirements-v5/semantic-runtime.js";

const fridgeText = "冷蔵庫にある余り物をもとにその日の夕食メニュー候補を提案する";

function sessionWithPattern(patternLabel = "constrained_candidate_recommendation") {
  const session = runtime.createSemanticRuntimeSession();
  assert.equal(runtime.ingestInitialInput(session, { eventId: "initial", text: fridgeText }).status, "accepted");
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "pattern", kind: "core_user_value_pattern", semanticLabel: patternLabel, scopeKey: "core", sourceEventId: "initial" }).status, "mapped");
  return session;
}

function answerDecision(session, candidateId, semanticLabel, answerValue, eventId = `answer:${candidateId}`) {
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId, kind: "decision", semanticLabel, scopeKey: "core" }).status, "mapped");
  const issued = runtime.issueClarificationQuestion(session, { candidateId });
  assert.equal(issued.status, "issued");
  assert.equal(runtime.ingestUserAnswer(session, { eventId, questionId: issued.question.questionId, text: `選択: ${answerValue}`, answerValue }).status, "accepted");
  return runtime.classifyUserAnswer(session, { candidateId, eventId });
}

function candidate(session, candidateId, semanticLabel) {
  return runtime.receiveAiSemanticCandidate(session, { candidateId, kind: "capability", semanticLabel, scopeKey: "core" });
}

test("raw event provenance is private, idempotent, rejects tampering and refuses unissued answers", () => {
  const session = runtime.createSemanticRuntimeSession();
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "unissued", questionId: "never", text: "x", answerValue: "embedded_catalog" }).status, "rejected_unissued_question");
  assert.equal(runtime.ingestInitialInput(session, { eventId: "same", text: "価値" }).status, "accepted");
  assert.equal(runtime.ingestInitialInput(session, { eventId: "same", text: "価値" }).replay, true);
  assert.equal(runtime.ingestInitialInput(session, { eventId: "same", text: "改変" }).status, "rejected_tampered_replay");
  assert.equal(runtime.semanticRuntimeSnapshot(session).events[0].text, undefined);
});

test("AI candidates are non-authoritative proposals and unknown, ambiguous, malformed mappings do not self-correct", () => {
  const session = sessionWithPattern();
  assert.equal(candidate(session, "persist", "persist_inputs_local").status, "mapped");
  assert.equal(candidate(session, "unknown", "not_a_registry_id").status, "unresolved");
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "ambiguous", kind: "decision", semanticLabel: "candidate_configuration", scopeKey: "core" }).status, "ambiguous_mapping");
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "broken", kind: "decision", semanticLabel: "recipe_source','matching_rules", scopeKey: "core" }).status, "unresolved");
  const snapshot = runtime.semanticRuntimeSnapshot(session);
  assert.equal(snapshot.capabilities.find((item) => item.typeId === "capability.state.persistence"), undefined);
  assert.equal(snapshot.candidates.find((item) => item.candidateId === "persist").classification, "proposal");
});

test("only explicit evidence, registered unique transforms, and registered dependencies promote required candidates", () => {
  const session = sessionWithPattern();
  assert.equal(answerDecision(session, "source", "source_selection", "embedded_catalog").status, "required_candidate");
  assert.equal(answerDecision(session, "eligibility", "eligibility_policy", "all_constraints_required").status, "required_candidate");
  assert.equal(runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_source.requires_rule_evaluation", scopeKey: "core" }).status, "required_candidate");
  assert.equal(runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_evaluation.requires_presentation", scopeKey: "core" }).status, "required_candidate");
  const snapshot = runtime.semanticRuntimeSnapshot(session);
  for (const typeId of ["capability.candidate.source", "capability.candidate.eligibility", "capability.rule.evaluation", "capability.candidate.presentation"]) assert.equal(snapshot.capabilities.find((item) => item.typeId === typeId)?.classification, "required_candidate");
});

test("stale explicit evidence invalidates PR1 decisions and derived required candidates", () => {
  const session = sessionWithPattern();
  assert.equal(answerDecision(session, "source", "source_selection", "embedded_catalog", "source:a").status, "required_candidate");
  assert.equal(answerDecision(session, "source", "source_selection", "external_provider", "source:b").status, "required_candidate");
  const snapshot = runtime.semanticRuntimeSnapshot(session);
  assert.equal(snapshot.decisions.filter((item) => item.typeId === "decision.source.selection" && item.currentness === "current").length, 1);
  assert.equal(snapshot.evidence.some((item) => item.currentness === "stale"), true);
  assert.equal(snapshot.capabilities.some((item) => item.typeId === "capability.candidate.source" && item.currentness === "stale"), true);
});

test("schema-invalid answers do not become evidence and duplicate semantic answers do not create another decision head", () => {
  const session = sessionWithPattern();
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "source", kind: "decision", semanticLabel: "source_selection", scopeKey: "core" }).status, "mapped");
  const issued = runtime.issueClarificationQuestion(session, { candidateId: "source" });
  const evidenceBeforeInvalidAnswer = runtime.semanticRuntimeSnapshot(session).evidence.length;
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "invalid", questionId: issued.question.questionId, text: "任意", answerValue: "anything_goes" }).status, "accepted");
  assert.equal(runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "invalid" }).status, "unresolved");
  assert.equal(runtime.semanticRuntimeSnapshot(session).evidence.length, evidenceBeforeInvalidAnswer);
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "valid:a", questionId: issued.question.questionId, text: "組み込み", answerValue: "embedded_catalog" }).status, "accepted");
  assert.equal(runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "valid:a" }).status, "required_candidate");
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "valid:b", questionId: issued.question.questionId, text: "組み込み", answerValue: "embedded_catalog" }).status, "accepted");
  const duplicate = runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "valid:b" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(runtime.semanticRuntimeSnapshot(session).decisions.filter((item) => item.typeId === "decision.source.selection" && item.currentness === "current").length, 1);
});

test("safe default only references pre-existing capabilities and never promotes, blocks, or expands boundaries", () => {
  const session = sessionWithPattern();
  assert.equal(answerDecision(session, "flow", "primary_flow", "delegate_safe_minimum").status, "unresolved");
  const before = runtime.semanticRuntimeSnapshot(session);
  const result = runtime.evaluateSafeDefault(session, { ruleId: "safe_default.primary_flow.constrained_candidate_recommendation", scopeKey: "core", decisionCandidateId: "flow" });
  assert.equal(result.status, "safe_default_candidate");
  const after = runtime.semanticRuntimeSnapshot(session);
  assert.equal(after.capabilities.length, before.capabilities.length);
  assert.equal(after.capabilities.every((item) => item.classification !== "required_candidate"), true);
  assert.equal(result.evaluation.createsCapabilities, false);
  assert.equal(result.evaluation.promotesRequired, false);
  assert.equal(result.evaluation.createsBlocking, false);
  assert.equal(result.evaluation.expandsDataBoundary, false);
  assert.equal(result.evaluation.expandsExternalConsequence, false);
  const noUniverse = runtime.createSemanticRuntimeSession();
  assert.equal(runtime.ingestInitialInput(noUniverse, { eventId: "initial", text: fridgeText }).status, "accepted");
  assert.equal(runtime.receiveAiSemanticCandidate(noUniverse, { candidateId: "flow", kind: "decision", semanticLabel: "primary_flow", scopeKey: "core" }).status, "mapped");
  assert.equal(answerDecision(noUniverse, "flow", "primary_flow", "delegate_safe_minimum").status, "unresolved");
  assert.equal(runtime.evaluateSafeDefault(noUniverse, { ruleId: "safe_default.primary_flow.constrained_candidate_recommendation", scopeKey: "core", decisionCandidateId: "flow" }).status, "unresolved");
});

test("refrigerator fixture keeps persistence as a proposal while grounded source and eligibility become required candidates", () => {
  const session = sessionWithPattern();
  assert.equal(answerDecision(session, "recipe-source", "source_selection", "embedded_catalog").status, "required_candidate");
  assert.equal(answerDecision(session, "eligibility", "eligibility_policy", "all_constraints_required").status, "required_candidate");
  assert.equal(answerDecision(session, "flow", "primary_flow", "delegate_safe_minimum").status, "unresolved");
  assert.equal(candidate(session, "persist", "persist_inputs_local").status, "mapped");
  assert.equal(runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_source.requires_rule_evaluation", scopeKey: "core" }).status, "required_candidate");
  assert.equal(runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_evaluation.requires_presentation", scopeKey: "core" }).status, "required_candidate");
  assert.equal(runtime.evaluateSafeDefault(session, { ruleId: "safe_default.primary_flow.constrained_candidate_recommendation", scopeKey: "core", decisionCandidateId: "flow" }).status, "safe_default_candidate");
  const draft = runtime.draftArtifactOutput(session);
  assert.equal(draft.status, "blocked_missing_authority");
  assert.equal(draft.capabilities.some((item) => item.typeId === "capability.state.persistence"), false);
  assert.equal(runtime.semanticRuntimeSnapshot(session).candidates.find((item) => item.candidateId === "persist").classification, "proposal");
});

test("shogi AI-only persistence, online play, ranking, and cloud sync remain proposals rather than required candidates", () => {
  const session = sessionWithPattern("turn_based_state_progression");
  for (const [candidateId, semanticLabel] of [["records", "persist_inputs_local"], ["online", "not_registered_online_play"], ["ranking", "not_registered_ranking"], ["cloud", "state_persistence"]]) candidate(session, candidateId, semanticLabel);
  const snapshot = runtime.semanticRuntimeSnapshot(session);
  assert.equal(snapshot.capabilities.some((item) => item.typeId === "capability.state.persistence" && item.classification === "required_candidate"), false);
  assert.equal(snapshot.candidates.filter((item) => ["records", "online", "ranking", "cloud"].includes(item.candidateId)).every((item) => item.classification === "proposal"), true);
});
