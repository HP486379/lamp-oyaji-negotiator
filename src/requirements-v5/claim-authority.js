const AUTHORITY_TYPES = Object.freeze([
  "explicit_user_evidence",
  "registered_transform",
  "registered_required_dependency",
]);

const CURRENT = "current";

function stableArray(values = []) {
  return [...new Set(values)].sort();
}

function normalizeAuthority(candidate) {
  const authority = candidate?.authority;
  if (!authority || !AUTHORITY_TYPES.includes(authority.type)) return null;
  return {
    type: authority.type,
    authorityId: authority.authorityId ?? null,
    sourceIds: stableArray(authority.sourceIds),
    transformId: authority.transformId ?? null,
    dependencyRuleId: authority.dependencyRuleId ?? null,
    currentness: authority.currentness ?? null,
  };
}

function validateAuthority(candidate, context) {
  const authority = normalizeAuthority(candidate);
  if (!authority) return { verified: false, reasonCode: "AUTHORITY_TYPE_NOT_ALLOWED" };
  if (authority.currentness !== CURRENT) return { verified: false, reasonCode: "AUTHORITY_NOT_CURRENT" };
  if (!authority.sourceIds.length) return { verified: false, reasonCode: "AUTHORITY_SOURCE_MISSING" };

  const currentSources = new Set(context.currentSourceIds ?? []);
  if (!authority.sourceIds.every((id) => currentSources.has(id))) {
    return { verified: false, reasonCode: "AUTHORITY_SOURCE_NOT_CURRENT" };
  }

  if (authority.type === "explicit_user_evidence") {
    const evidence = context.explicitUserEvidenceById?.[authority.authorityId];
    if (!evidence || evidence.currentness !== CURRENT) {
      return { verified: false, reasonCode: "EXPLICIT_USER_EVIDENCE_NOT_FOUND" };
    }
    if (!authority.sourceIds.includes(evidence.sourceId)) {
      return { verified: false, reasonCode: "EXPLICIT_USER_EVIDENCE_BINDING_MISMATCH" };
    }
  }

  if (authority.type === "registered_transform") {
    if (!authority.transformId) return { verified: false, reasonCode: "TRANSFORM_ID_MISSING" };
    const transform = context.registeredTransformsById?.[authority.transformId];
    if (!transform || transform.currentness !== CURRENT) {
      return { verified: false, reasonCode: "REGISTERED_TRANSFORM_NOT_FOUND" };
    }
    if (transform.outputClaimKey !== candidate.claimKey) {
      return { verified: false, reasonCode: "TRANSFORM_OUTPUT_BINDING_MISMATCH" };
    }
    if (!stableArray(transform.requiredSourceIds).every((id) => authority.sourceIds.includes(id))) {
      return { verified: false, reasonCode: "TRANSFORM_SOURCE_BINDING_MISMATCH" };
    }
  }

  if (authority.type === "registered_required_dependency") {
    if (!authority.dependencyRuleId) return { verified: false, reasonCode: "DEPENDENCY_RULE_ID_MISSING" };
    const dependency = context.registeredDependenciesById?.[authority.dependencyRuleId];
    if (!dependency || dependency.currentness !== CURRENT) {
      return { verified: false, reasonCode: "REGISTERED_DEPENDENCY_NOT_FOUND" };
    }
    if (dependency.outputClaimKey !== candidate.claimKey) {
      return { verified: false, reasonCode: "DEPENDENCY_OUTPUT_BINDING_MISMATCH" };
    }
    if (!stableArray(dependency.requiredSourceIds).every((id) => authority.sourceIds.includes(id))) {
      return { verified: false, reasonCode: "DEPENDENCY_SOURCE_BINDING_MISMATCH" };
    }
  }

  return { verified: true, authority };
}

function evaluateConflict(candidate, verifiedClaims, context) {
  const matches = [];
  for (const rule of context.registeredConflictRules ?? []) {
    if (rule.currentness !== CURRENT) continue;
    if (rule.candidateClaimKey !== candidate.claimKey) continue;
    for (const claim of verifiedClaims) {
      if (claim.claimKey !== rule.authoritativeClaimKey) continue;
      const conflict = rule.evaluate({ candidate, authoritativeClaim: claim }) === true;
      if (conflict) {
        matches.push({
          ruleId: rule.ruleId,
          candidateClaimKey: candidate.claimKey,
          authoritativeClaimKey: claim.claimKey,
          authoritativeClaimId: claim.claimId,
        });
      }
    }
  }
  return matches;
}

export function evaluateClaimAuthority(candidate, context) {
  const authorityResult = validateAuthority(candidate, context);
  if (!authorityResult.verified) {
    return {
      claimId: candidate.claimId,
      claimKey: candidate.claimKey,
      authorityStatus: "UNVERIFIED",
      conflictStatus: "NOT_EVALUATED",
      reasonCodes: [authorityResult.reasonCode],
      conflicts: [],
    };
  }
  return {
    claimId: candidate.claimId,
    claimKey: candidate.claimKey,
    authorityStatus: "VERIFIED",
    conflictStatus: "CLEAR",
    reasonCodes: [],
    conflicts: [],
  };
}

export function auditClaimsShadow({ claimCandidates, context }) {
  const authorityResults = claimCandidates.map((candidate) => ({
    candidate,
    result: evaluateClaimAuthority(candidate, context),
  }));
  const verifiedClaims = authorityResults
    .filter(({ result }) => result.authorityStatus === "VERIFIED")
    .map(({ candidate }) => candidate);

  const diagnostics = authorityResults.map(({ candidate, result }) => {
    const conflicts = evaluateConflict(candidate, verifiedClaims, context);
    return {
      ...result,
      conflictStatus: conflicts.length ? "CONFLICT" : result.conflictStatus,
      conflicts,
      reasonCodes: conflicts.length
        ? [...result.reasonCodes, "CONFLICTS_WITH_AUTHORITATIVE_CLAIM"]
        : result.reasonCodes,
    };
  });

  return {
    mode: "shadow",
    mutatesUi: false,
    mutatesRequirementState: false,
    verifiedClaims: diagnostics.filter((item) => item.authorityStatus === "VERIFIED"),
    unverifiedClaims: diagnostics.filter((item) => item.authorityStatus === "UNVERIFIED"),
    conflictingClaims: diagnostics.filter((item) => item.conflictStatus === "CONFLICT"),
    diagnostics,
  };
}

export { AUTHORITY_TYPES };
