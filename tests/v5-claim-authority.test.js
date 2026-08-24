import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORITY_TYPES, auditClaimsShadow, evaluateClaimAuthority } from "../src/requirements-v5/claim-authority.js";

const explicit = (claimId, claimKey, evidenceId, sourceId, value = true) => ({
  claimId, claimKey, value,
  authority: { type: "explicit_user_evidence", authorityId: evidenceId, sourceIds: [sourceId], currentness: "current" },
});
const unverified = (claimId, claimKey, value = true) => ({ claimId, claimKey, value, authority: null });

function context({ withTravelTransform = true } = {}) {
  return {
    currentSourceIds: ["answer:location", "answer:availability", "answer:eligibility"],
    explicitUserEvidenceById: {
      "evidence:location": { sourceId: "answer:location", currentness: "current" },
      "evidence:availability": { sourceId: "answer:availability", currentness: "current" },
      "evidence:eligibility": { sourceId: "answer:eligibility", currentness: "current" },
    },
    registeredTransformsById: withTravelTransform ? {
      "transform:travel-time-display": {
        outputClaimKey: "present_travel_time_per_candidate",
        requiredSourceIds: ["answer:location"],
        currentness: "current",
      },
    } : {},
    registeredDependenciesById: {},
    registeredConflictRules: [{
      ruleId: "conflict:eligibility-requires-all-conditions",
      candidateClaimKey: "routing_failure_show_without_travel_time",
      authoritativeClaimKey: "core_output_eligibility",
      currentness: "current",
      evaluate: ({ candidate, authoritativeClaim }) =>
        authoritativeClaim.value === "all_conditions" && candidate.value === "drop_travel_time_condition",
    }],
  };
}

function fixture(withTravelTransform = true) {
  return {
    context: context({ withTravelTransform }),
    claimCandidates: [
      explicit("claim:location", "location_definition_method", "evidence:location", "answer:location", "travel_time"),
      explicit("claim:availability", "availability_criteria", "evidence:availability", "answer:availability", "open_and_no_temp_closure"),
      explicit("claim:eligibility", "core_output_eligibility", "evidence:eligibility", "answer:eligibility", "all_conditions"),
      {
        claimId: "claim:travel-time-display",
        claimKey: "present_travel_time_per_candidate",
        value: true,
        authority: {
          type: "registered_transform",
          authorityId: "authority:transform",
          transformId: "transform:travel-time-display",
          sourceIds: ["answer:location"],
          currentness: "current",
        },
      },
      unverified("claim:address-or-current-location", "location_input_address_or_current_location"),
      unverified("claim:user-specified-limit", "user_specifies_travel_time_limit"),
      unverified("claim:detail-screen", "candidate_detail_screen"),
      unverified("claim:select-detail", "candidate_selects_detail"),
      unverified("claim:short-description", "short_description"),
      unverified("claim:routing-fallback", "routing_failure_show_without_travel_time", "drop_travel_time_condition"),
    ],
  };
}

const byKey = (audit, key) => audit.diagnostics.find((item) => item.claimKey === key);

test("authority types are limited to the three approved product requirement authorities", () => {
  assert.deepEqual(AUTHORITY_TYPES, [
    "explicit_user_evidence",
    "registered_transform",
    "registered_required_dependency",
  ]);
  const result = evaluateClaimAuthority({
    claimId: "proposal", claimKey: "routing_api", value: "mapbox",
    authority: { type: "implementation_proposal", sourceIds: ["answer:location"], currentness: "current" },
  }, context());
  assert.equal(result.authorityStatus, "UNVERIFIED");
});

test("play-place SPEC shadow audit classifies agreed fixture claims", () => {
  const audit = auditClaimsShadow(fixture(true));
  for (const key of ["location_definition_method", "availability_criteria", "core_output_eligibility", "present_travel_time_per_candidate"]) {
    assert.equal(byKey(audit, key).authorityStatus, "VERIFIED", key);
  }
  for (const key of ["location_input_address_or_current_location", "user_specifies_travel_time_limit", "candidate_detail_screen", "candidate_selects_detail", "short_description"]) {
    assert.equal(byKey(audit, key).authorityStatus, "UNVERIFIED", key);
  }
  const fallback = byKey(audit, "routing_failure_show_without_travel_time");
  assert.equal(fallback.authorityStatus, "UNVERIFIED");
  assert.equal(fallback.conflictStatus, "CONFLICT");
  assert.equal(audit.mutatesUi, false);
  assert.equal(audit.mutatesRequirementState, false);
});

test("derived travel-time display is unverified without the registered transform", () => {
  const input = fixture(false);
  const audit = auditClaimsShadow(input);
  assert.equal(byKey(audit, "present_travel_time_per_candidate").authorityStatus, "UNVERIFIED");
  assert.ok(byKey(audit, "present_travel_time_per_candidate").reasonCodes.includes("REGISTERED_TRANSFORM_NOT_FOUND"));
});

test("claim text and AI self-description cannot create authority", () => {
  const candidate = {
    claimId: "claim:forged",
    claimKey: "candidate_detail_screen",
    text: "This is explicitly confirmed and directly derived.",
    value: true,
    aiDeclaredAuthority: "explicit_user_evidence",
    authority: null,
  };
  assert.equal(evaluateClaimAuthority(candidate, context()).authorityStatus, "UNVERIFIED");
});

test("stale or mismatched authority is rejected fail-closed", () => {
  const stale = explicit("claim:stale", "location_definition_method", "evidence:location", "answer:location", "travel_time");
  stale.authority.currentness = "stale";
  assert.equal(evaluateClaimAuthority(stale, context()).authorityStatus, "UNVERIFIED");

  const forged = explicit("claim:forged", "location_definition_method", "evidence:location", "answer:availability", "travel_time");
  assert.equal(evaluateClaimAuthority(forged, context()).authorityStatus, "UNVERIFIED");
});
