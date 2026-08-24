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
  assert.equal(snapshot.allEvidence.some((item) => item.currentness === "stale"), true);
  assert.equal(runtime.draftArtifactOutput(session).capabilities.some((item) => item.typeId === "capability.candidate.source"), false);
});

test("schema-invalid answers do not become evidence and duplicate semantic answers do not create another decision head", () => {
  const session = sessionWithPattern();
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "source", kind: "decision", semanticLabel: "source_selection", scopeKey: "core" }).status, "mapped");
  const issued = runtime.issueClarificationQuestion(session, { candidateId: "source" });
  const evidenceBeforeInvalidAnswer = runtime.semanticRuntimeSnapshot(session).evidence.length;
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "invalid", questionId: issued.question.questionId, text: "任意", answerValue: "anything_goes" }).status, "accepted");
  assert.equal(runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "invalid" }).status, "unresolved");
  assert.equal(runtime.semanticRuntimeSnapshot(session).evidence.length, evidenceBeforeInvalidAnswer);
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "valid:a", questionId: issued.question.questionId, text: "embedded_catalog", answerValue: "embedded_catalog" }).status, "accepted");
  assert.equal(runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "valid:a" }).status, "required_candidate");
  assert.equal(runtime.ingestUserAnswer(session, { eventId: "valid:b", questionId: issued.question.questionId, text: "embedded_catalog", answerValue: "embedded_catalog" }).status, "accepted");
  const duplicate = runtime.classifyUserAnswer(session, { candidateId: "source", eventId: "valid:b" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(runtime.semanticRuntimeSnapshot(session).decisions.filter((item) => item.typeId === "decision.source.selection" && item.currentness === "current").length, 1);
});

test("question-specific admission rejects empty and unrelated text but permits schema-valid false and zero values", () => {
  for (const [eventId, text] of [["empty", ""], ["space", " "], ["unrelated", "別の内容"]]) {
    const session = sessionWithPattern();
    assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "source", kind: "decision", semanticLabel: "source_selection", scopeKey: "core" }).status, "mapped");
    const question = runtime.issueClarificationQuestion(session, { candidateId: "source" }).question;
    runtime.ingestUserAnswer(session, { eventId, questionId: question.questionId, text, answerValue: "embedded_catalog" });
    assert.equal(runtime.classifyUserAnswer(session, { candidateId: "source", eventId }).status, "unresolved");
    assert.equal(runtime.draftArtifactOutput(session).decisions.length, 0);
  }
  for (const [candidateId, semanticLabel, answerValue] of [["toggle", "feature_toggle", false], ["limit", "quantity_limit", 0]]) {
    const session = sessionWithPattern();
    assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId, kind: "decision", semanticLabel, scopeKey: "core" }).status, "mapped");
    const question = runtime.issueClarificationQuestion(session, { candidateId }).question;
    runtime.ingestUserAnswer(session, { eventId: candidateId, questionId: question.questionId, text: String(answerValue), answerValue });
    assert.equal(runtime.classifyUserAnswer(session, { candidateId, eventId: candidateId }).status, "required_candidate");
  }
});

test("confirmation admission binds an authority-issued current request to its exact candidate", () => {
  const session = sessionWithPattern();
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "source", kind: "decision", semanticLabel: "source_selection", scopeKey: "core", proposedValue: "embedded_catalog" }).status, "mapped");
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "eligibility", kind: "decision", semanticLabel: "eligibility_policy", scopeKey: "core", proposedValue: "all_constraints_required" }).status, "mapped");
  assert.equal(runtime.ingestUserConfirmation(session, { eventId: "none", text: "confirm", answerValue: "confirm", confirmationRequestId: "never" }).status, "rejected_unissued_confirmation");
  const sourceRequest = runtime.issueConfirmationRequest(session, { candidateId: "source" }).confirmationRequest;
  assert.equal(runtime.ingestUserConfirmation(session, { eventId: "empty", text: "", answerValue: "confirm", confirmationRequestId: sourceRequest.confirmationRequestId }).status, "accepted");
  assert.equal(runtime.classifyUserConfirmation(session, { candidateId: "source", eventId: "empty" }).status, "unresolved");
  assert.equal(runtime.ingestUserConfirmation(session, { eventId: "replay", text: "confirm", answerValue: "confirm", confirmationRequestId: sourceRequest.confirmationRequestId }).status, "accepted");
  assert.equal(runtime.classifyUserConfirmation(session, { candidateId: "eligibility", eventId: "replay" }).status, "unresolved");
  runtime.ingestInitialInput(session, { eventId: "new-core", text: "別の価値" });
  runtime.receiveAiSemanticCandidate(session, { candidateId: "new-pattern", kind: "core_user_value_pattern", semanticLabel: "turn_based_state_progression", scopeKey: "core", sourceEventId: "new-core" });
  assert.equal(runtime.ingestUserConfirmation(session, { eventId: "stale", text: "confirm", answerValue: "confirm", confirmationRequestId: sourceRequest.confirmationRequestId }).status, "rejected_unissued_confirmation");
});

test("a new core user value revision supersedes and stales all A-derived PR1 artifacts atomically", () => {
  const session = sessionWithPattern();
  assert.equal(answerDecision(session, "source", "source_selection", "embedded_catalog").status, "required_candidate");
  assert.equal(answerDecision(session, "eligibility", "eligibility_policy", "all_constraints_required").status, "required_candidate");
  assert.equal(answerDecision(session, "flow", "primary_flow", "delegate_safe_minimum").status, "unresolved");
  runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_source.requires_rule_evaluation", scopeKey: "core" });
  runtime.promoteRequiredDependency(session, { ruleId: "dependency.candidate_evaluation.requires_presentation", scopeKey: "core" });
  assert.equal(runtime.evaluateSafeDefault(session, { ruleId: "safe_default.primary_flow.constrained_candidate_recommendation", scopeKey: "core", decisionCandidateId: "flow" }).status, "safe_default_candidate");
  const before = runtime.semanticRuntimeSnapshot(session);
  const sourceA = before.events.find((event) => event.eventId === "initial").sourceRevisionId;
  runtime.ingestInitialInput(session, { eventId: "initial-b", text: "順番に手を進める将棋" });
  assert.equal(runtime.receiveAiSemanticCandidate(session, { candidateId: "pattern-b", kind: "core_user_value_pattern", semanticLabel: "turn_based_state_progression", scopeKey: "core", sourceEventId: "initial-b" }).status, "mapped");
  const after = runtime.semanticRuntimeSnapshot(session);
  assert.equal(after.revisions.find((revision) => revision.id === sourceA).currentness, "superseded");
  assert.equal(after.allEvidence.filter((edge) => edge.coreSourceRevisionId === sourceA).every((edge) => edge.currentness === "stale"), true);
  assert.equal(after.staleArtifacts.some((artifact) => artifact.coreSourceRevisionId === sourceA && artifact.currentness === "stale"), true);
  assert.equal(after.candidates.filter((item) => item.coreSourceRevisionId === sourceA).every((item) => item.currentness === "stale"), true);
  assert.equal(after.allSafeDefaultEvaluations.filter((item) => item.coreSourceRevisionId === sourceA).every((item) => item.currentness === "stale"), true);
  assert.equal(runtime.draftArtifactOutput(session).evidence.some((edge) => edge.coreSourceRevisionId === sourceA), false);
  assert.equal(runtime.draftArtifactOutput(session).capabilities.some((artifact) => artifact.coreSourceRevisionId === sourceA), false);
  assert.equal(after.pattern.patternId, "core_value.turn_based_state_progression");
  assert.equal(after.pattern.currentness, "current");
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
