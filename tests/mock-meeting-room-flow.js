import assert from "node:assert/strict";
import { buildMarkdown, createProjectContext, planNext, readiness, recordAnswer, recordInference, setDimensions, validateLocally } from "../requirements-core.js";

const productQuestion = (decisionDomain, title, decisionBoundary) => ({
  title, intent: "A product-owner decision that changes the MVP", options: ["Option A", "Option B"], recommended: "Option A", recommendationReason: "MVP fit", decisionDomain, decisionBoundary, informationGain: "high",
  necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
});
const blockedQuestion = (decisionDomain, title, decisionClass, reason) => ({
  title, intent: reason, options: ["A", "B"], recommended: "A", recommendationReason: "AI can safely decide this", decisionDomain, decisionBoundary: "none", informationGain: "low",
  necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: false, clarifiesExplicitUserRequest: false, changesProductBehavior: false, introducesNewFeature: false, implementationDetailOnly: decisionClass === "implementation", derivedOnlyFromAIInference: true, decisionClass, requiresUserDecision: false },
});

let context = setDimensions(createProjectContext("Internal meeting room reservation app"), [
  { id: "users_permissions", label: "User roles and permissions", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion("users_permissions", "Who can reserve and administer rooms?", "roles_permissions") },
  { id: "reservation_policy", label: "Reservation policy", importance: "high", userJudgmentRequired: true, known: false, value: null, question: productQuestion("reservation_policy", "What are the main reservation rules?", "business_rule") },
  { id: "room_definition", label: "Room information", importance: "medium", userJudgmentRequired: true, known: false, value: null, question: productQuestion("room_definition", "What room information matters to employees?", "mvp_feature") },
]);

const displayed = [];
while (true) {
  const next = planNext(context);
  if (!next) break;
  displayed.push({ title: next.question.title, decisionClass: next.question.necessity.decisionClass, decisionDomain: next.question.decisionDomain, requiresUserDecision: next.question.necessity.requiresUserDecision });
  context = recordAnswer(context, next.id, next.question.recommended, true);
}

const rejected = [
  ["timezone", "AI inference: ordinary internal application timezone default"],
  ["timezone_confirmation", "duplicate decisionDomain: timezone"],
  ["timezone_display", "implementation decision: display format"],
  ["room_lifecycle", "AI inference: ordinary administrative lifecycle"],
  ["room_lifecycle_reservations", "edge case: existing reservation handling"],
  ["room_lifecycle_notification", "implementation decision: notification wording"],
];
context = recordInference(context, {
  aiInferredRequirements: [{ key: "timezone_default", value: "Use the organization locale as the reservation time standard", reason: "AI default", decisionDomain: "timezone", necessity: { confirmedDecisionRequired: false, coreUserValueRequired: false, primaryFlowRequired: true, reason: "Reservation flow" } }],
  implementationProposals: [{ key: "room_lifecycle_defaults", title: "Room lifecycle", description: "Use a safe archive/deactivate flow and preserve existing reservations", recommended: true, reason: "Avoids destructive edge-case choices", alternatives: [] }], futureOptional: [],
  clarificationQuestions: [
    { id: "timezone_confirmation", label: "Timezone", importance: "low", question: blockedQuestion("timezone", "Fix to JST?", "implementation", "timezone detail") },
    { id: "timezone_display", label: "Timezone display", importance: "low", question: blockedQuestion("timezone", "Show device-local time?", "implementation", "display detail") },
    { id: "room_reservation_disposal", label: "Existing reservations", importance: "low", question: blockedQuestion("room_lifecycle", "What happens to reservations when a room is deleted?", "edge_case", "non-core edge case") },
    { id: "deletion_notification", label: "Deletion notification", importance: "low", question: blockedQuestion("room_lifecycle", "What should deletion notifications say?", "implementation", "notification wording") },
  ],
});
assert.equal(displayed.length, 3);
assert.equal(planNext(context), null);
assert.equal(readiness(context), 100);
assert.equal(context.dimensions.some((item) => /timezone|room_reservation_disposal|deletion_notification/.test(item.id)), false);
assert.equal(context.implementationProposals.length, 1);

const spec = { projectOverview: "Internal meeting room reservation MVP", coreUserValue: "Employees can reliably find and reserve an appropriate room.", mvpScope: "Roles, rooms, and room reservations.", outOfScope: "External calendar sync.", userFlow: "Sign in, browse rooms, reserve a time slot, and view reservations.", screens: "Reservation list, room details, and administration.", functionalRequirements: "Authorized employees can create and view reservations.", dataModel: "Room, Reservation, and UserRole.", stateTransitions: "Available to reserved to released.", errorHandling: "Show a clear conflict message for unavailable rooms.", implementationRules: "Use the inferred organization time standard consistently.", acceptanceCriteria: "Authorized users can reserve an available room and see the reservation." };
const localValidation = validateLocally(context, spec);
assert.ok(localValidation.valid);
assert.match(buildMarkdown(context, spec), /# SPEC.md/);
console.log(JSON.stringify({ displayedQuestions: displayed, rejectedCandidates: rejected, finalQuestionCount: displayed.length, readiness: readiness(context), specGenerated: true }, null, 2));
