// DIAGNOSTIC BUILD ONLY — restore from .\requirements-core.js.before-diag after tracing

/**
 * Domain layer for 仕様太郎 v4.1.
 * It never contains a genre catalogue; only the provider may derive project
 * specific content from the current ProjectContext.
 */
export const SOURCE = Object.freeze({
  INITIAL: "initial_input",
  USER: "user_confirmed",
  AI: "ai_inferred",
});

export const newSessionId = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const uniqueByKey = (items) => [...new Map(items.map((item) => [item.key ?? item.id, item])).values()];

export function createProjectContext(idea) {
  const value = idea.trim();
  return {
    sessionId: newSessionId(), idea: value, analysis: null,
    facts: [{ key: "idea", value, source: SOURCE.INITIAL }], dimensions: [], answers: {}, answeredQuestionKeys: [], answeredDecisionDomains: [], inferredDecisionDomains: [],
    inferredDecisions: {}, implementationProposals: [], futureOptional: [], history: [], coreInvariants: [],
    confirmedFinalDecisions: [], finalConfirmationHistory: [],
    generatedSpec: null, validation: null, status: "analyzing",
    groundedDomainRegistry: [], rejectedDecisionCandidates: [],
  };
}

/** Enables the independent pre-completion coverage audit for live sessions.
 * Kept opt-in so persisted v4.1 contexts and low-level domain tests remain
 * readable; the browser enables it when a new session starts. */
export function enableCriticalDecisionCoverageAudit(context) {
  return { ...context, criticalDecisionCoverageAuditRequired: true, criticalDecisionCoverageAudit: null };
}
export function enableRequirementGrounding(context) { return { ...context, requirementGroundingRequired: true }; }

export function criticalDecisionCoverageFingerprint(context) {
  return JSON.stringify({
    idea: context?.idea ?? "",
    analysis: context?.analysis ? {
      purpose: context.analysis.purpose ?? null,
      targetUsers: context.analysis.targetUsers ?? null,
      managedObject: context.analysis.managedObject ?? null,
      primaryAction: context.analysis.primaryAction ?? null,
      persistedOutcome: context.analysis.persistedOutcome ?? null,
      successCondition: context.analysis.successCondition ?? null,
    } : null,
    decisions: (context?.facts ?? [])
      .filter((fact) => fact.source === SOURCE.USER || fact.source === SOURCE.AI)
      .map((fact) => ({ key: fact.key, value: fact.value, source: fact.source, decisionDomain: fact.decisionDomain ?? null }))
      .sort((a, b) => `${a.source}:${a.key}`.localeCompare(`${b.source}:${b.key}`)),
    answeredDecisionDomains: [...(context?.answeredDecisionDomains ?? [])].sort(),
    inferredDecisionDomains: [...(context?.inferredDecisionDomains ?? [])].sort(),
    confirmedFinalDecisions: (context?.confirmedFinalDecisions ?? []).map((item) => ({ id: item.id, decisionDomain: item.decisionDomain, fingerprint: item.fingerprint })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function applyAnalysis(context, analysis) {
  const facts = uniqueByKey([...context.facts, ...(analysis.knownFacts ?? []).map((fact) => ({
    key: fact.key, value: fact.value, source: SOURCE.INITIAL, reason: fact.reason ?? "入力内容から確認できる事実",
  }))]);
  const analyzed = { ...context, analysis, facts };
  const next = { ...analyzed, coreInvariants: deriveCoreInvariants(analyzed), status: "questioning" };
  return { ...next, completionGate: completionGate(next) };
}

export function setDimensions(context, dimensions) {
  const withInvariants = { ...context, coreInvariants: deriveCoreInvariants(context) };
  const admitted = admitGroundedCandidates(withInvariants, dimensions, "initial");
  const next = {
    ...admitted.context,
    dimensions: admitted.accepted.map((dimension) => {
      const question = dimension.question ? { ...dimension.question, decisionDomain: dimensionDecisionDomain(dimension) } : null;
      return {
        ...dimension,
        known: !!dimension.known,
        questionDepth: dimension.questionDepth ?? 0,
        question: sanitizeQuestionOptions(question, withInvariants),
      };
    }),
    status: "questioning",
  };
  return { ...next, completionGate: completionGate(next) };
}

export function readiness(context) {
  const gate = completionGate(context);
  if (!gate.complete) return Math.min(99, Math.round((gate.resolvedCriticalDecisionDomains.length / Math.max(1, gate.criticalDecisionDomains.length)) * 100));
  const important = context.dimensions.filter((d) => d.importance !== "low" && (!d.question || questionIsAllowed(d.question, d.questionDepth ?? 0, context)));
  // A primary-flow gap is never an implementation detail.  Do not report
  // readiness while a material, user-owned transition remains unresolved.
  if (hasUnresolvedStateTransitionGaps(context)) return Math.min(99, important.length ? Math.round((important.filter((d) => d.known || d.value != null).length / important.length) * 100) : 0);
  if (!planNext(context)) return 100;
  return important.length ? Math.round((important.filter((d) => d.known || d.value != null).length / important.length) * 100) : 0;
}

/** Conversation progress is user-facing; Completion Gate remains the authority for SPEC generation. */
export function calculatedConversationProgress(context) {
  const gate = completionGate(context);
  const total = gate.criticalDecisionDomains.length;
  if (!total) return gate.complete ? 100 : 0;
  const calculated = Math.round((gate.resolvedCriticalDecisionDomains.length / total) * 100);
  return gate.complete ? 100 : Math.min(99, calculated);
}

export function sourceCounts(context) {
  return context.facts.reduce((counts, fact) => ({ ...counts, [fact.source]: (counts[fact.source] ?? 0) + 1 }), {
    [SOURCE.INITIAL]: 0, [SOURCE.USER]: 0, [SOURCE.AI]: 0,
  });
}

/** Development-only execution trace. It records provenance and state-machine
 * transitions for one browser session; callers decide whether to display it. */
export function buildSessionTrace(context, { generatedSpec = null, validationErrors = [], repairActions = [], retryCount = 0 } = {}) {
  const gate = completionGate(context);
  return {
    session_trace_id: context?.sessionId ?? null,
    initial_input: context?.idea ?? "",
    core_user_value: context?.analysis?.purpose ?? context?.idea ?? "",
    generated_primary_flow: context?.analysis ? {
      actor: context.analysis.targetUsers, managed_object: context.analysis.managedObject,
      primary_action: context.analysis.primaryAction, persisted_outcome: context.analysis.persistedOutcome,
      success_condition: context.analysis.successCondition,
    } : null,
    critical_decision_domains: gate.criticalDecisionDomains,
    resolved_decision_domains: gate.resolvedCriticalDecisionDomains,
    unresolved_critical_product_decisions: gate.unresolvedCriticalProductDecisions,
    primary_flow_coverage: gate.primaryFlowCoverage,
    user_confirmed: (context?.facts ?? []).filter((fact) => fact.source === SOURCE.USER).map((fact) => ({ id: fact.key, decision_domain: fact.decisionDomain ?? null })),
    core_invariants: gate.coreInvariants.map((item) => ({ id: item.id, decision_domain: item.decisionDomain })),
    ai_inferred: (context?.facts ?? []).filter((fact) => fact.source === SOURCE.AI).map((fact) => ({ id: fact.key, source_decision_ids: fact.sourceDecisionIds ?? [], source_initial_input_span: fact.sourceInitialInputSpan ?? null, derivation_depth: fact.derivationDepth ?? null, uniquely_derived: fact.uniquelyDerived === true, provenance_reason: fact.provenanceReason ?? fact.reason ?? "" })),
    optional: (context?.futureOptional ?? []).map((item) => item.key),
    generated_spec: generatedSpec,
    validation_errors: errorIssues(validationErrors).map((issue) => ({ rule_id: errorCodeFor(issue), section: issue.section, reason: issue.message })),
    repair_actions: repairActions,
    retry_count: retryCount,
    completion_gate_result: gate.complete,
    critical_decision_coverage_audit: context?.criticalDecisionCoverageAudit ? {
      complete: context.criticalDecisionCoverageAudit.complete,
      audited_decision_domains: context.criticalDecisionCoverageAudit.auditedDecisionDomains ?? [],
      discovered_decision_domains: context.criticalDecisionCoverageAudit.discoveredDecisionDomains ?? [],
      current: gate.coverageAuditCurrent,
    } : null,
  };
}

function questionDomain(question, fallback = "") { return question?.decisionDomain || fallback; }

const reservationWords = /(?:reservation|booking|appointment|schedule|slot|予約|予約枠|空き枠|時間枠|座席|会議室|駐車場|レンタル|診療)/i;
const reservationExclusivityWords = /(?:overlap|conflict|duplicate|occupied|availability|available|exclusive|double[ -]?book|二重|重複|競合|利用不可|予約済み|空き(?:枠|状況)?|排他)/i;

/**
 * These are not a genre template. They are non-negotiable integrity
 * constraints that arise only when the stated core flow is a reservation.
 */
export function deriveCoreInvariants(context) {
  const source = [context?.idea, context?.analysis?.purpose, ...(context?.facts ?? []).filter((fact) => fact.source === SOURCE.INITIAL || fact.source === SOURCE.USER).map((fact) => `${fact.key} ${fact.value}`)].join(" ");
  if (!reservationWords.test(source)) return [];
  return [
    { id: "reservation_exclusivity", decisionDomain: "reservation_exclusivity", origin: SOURCE.INITIAL, value: "同一の資源・時間枠に重複した確定予約を作成しない。" },
    { id: "confirmed_slot_unavailable", decisionDomain: "reservation_exclusivity", origin: SOURCE.INITIAL, value: "確定済みの予約枠は、他の利用者が予約できない。" },
    { id: "reservation_conflict_recheck", decisionDomain: "reservation_conflict_recheck", origin: SOURCE.INITIAL, value: "予約を確定する直前に、対象枠の競合を再確認する。" },
  ];
}

function canonicalDecisionDomain(question, fallback = "") {
  const candidate = question && typeof question === "object" ? question.decisionDomain : question;
  const raw = String(candidate ?? fallback).trim().toLowerCase();
  if (reservationWords.test(raw) && reservationExclusivityWords.test(raw)) return "reservation_exclusivity";
  if (/(?:availability|occupied|double[ _-]?book|booking[ _-]?(?:conflict|availability)|予約(?:済み|枠|可能)|二重予約|重複予約|競合)/i.test(raw)) return "reservation_exclusivity";
  if (/(?:conflict.*(?:recheck|check)|(?:再)?確認.*競合)/i.test(raw)) return "reservation_conflict_recheck";
  return raw || fallback;
}

const genericDecisionDomainLabels = new Set(["product", "ux", "implementation", "edge_case", "none"]);
function dimensionDecisionDomain(dimension) {
  const declared = canonicalDecisionDomain(dimension?.question, dimension?.id ?? "");
  return !declared || genericDecisionDomainLabels.has(declared)
    ? canonicalDecisionDomain(dimension?.id, dimension?.id ?? "")
    : declared;
}

const decisionDomainNoise = new Set(["q", "question", "decision", "choice", "confirm"]);
function decisionDomainTokens(value) {
  return canonicalDecisionDomain(value, value).split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/i).filter((token) => token && !decisionDomainNoise.has(token));
}

function itemGrounding(item) { return item?.grounding ?? null; }
function groundedDomains(context) { return (context?.groundedDomainRegistry ?? []).map((entry) => canonicalDecisionDomain(entry.decisionDomain, entry.decisionDomain)); }
function exactInitialSpanExists(context, grounding) { const span=String(grounding?.sourceInitialInputSpan ?? "").trim(); return span.length > 0 && String(context?.idea ?? "").includes(span); }
function userAnswerExists(context, answerId) { return Boolean(answerId) && (context?.facts ?? []).some((fact) => fact.source === SOURCE.USER && fact.key === answerId); }
function sourceFactExists(context, sourceRef) { return sourceRef === "idea" || (context?.facts ?? []).some((fact) => fact.key === sourceRef && (fact.source === SOURCE.INITIAL || fact.source === SOURCE.USER)); }
export function evaluateRequirementGrounding(context, item, { phase = "initial" } = {}) {
  if (context?.requirementGroundingRequired !== true) return { accepted: true, legacy: true };
  const grounding = itemGrounding(item); const domain=canonicalDecisionDomain(item?.decisionDomain ?? item?.question?.decisionDomain ?? item?.id, item?.id ?? "");
  if (!grounding || grounding.grounded !== true || !domain || !sourceFactExists(context, grounding.sourceRef)) return { accepted:false, reason:"missing_or_invalid_source", domain };
  if (phase === "initial") {
    if (grounding.sourceType === SOURCE.INITIAL && grounding.sourceRef === "idea" && exactInitialSpanExists(context, grounding)) return { accepted:true, domain };
    if (grounding.sourceType === SOURCE.USER && userAnswerExists(context, grounding.sourceRef)) return { accepted:true, domain };
    return { accepted:false, reason:"invalid_initial_evidence", domain };
  }
  const parent=canonicalDecisionDomain(grounding.parentDomain, grounding.parentDomain ?? ""); const answerId=grounding.answerId;
  const parentExists=Boolean(parent) && groundedDomains(context).some((existing)=>semanticDecisionDomainEquivalent(existing,parent));
  if (grounding.sourceType !== "derived_from_answer" || !userAnswerExists(context, answerId) || grounding.sourceRef !== answerId) return { accepted:false, reason:"invalid_trigger_answer", domain };
  if (!parentExists) return { accepted:false, reason:"invalid_parent_domain", domain };
  if (grounding.directCausalRelation !== true || String(grounding.causalExplanation ?? "").trim().length < 8) return { accepted:false, reason:"missing_direct_causality", domain };
  if (grounding.directlyAffectsPrimaryFlow !== true && grounding.directlyAffectsRequiredData !== true) return { accepted:false, reason:"no_direct_mvp_impact", domain };
  return { accepted:true, domain };
}
function admitGroundedCandidates(context, candidates, phase) {
  const registry=[...(context?.groundedDomainRegistry ?? [])], rejected=[...(context?.rejectedDecisionCandidates ?? [])], accepted=[];
  for (const candidate of candidates ?? []) { const result=evaluateRequirementGrounding({...context,groundedDomainRegistry:registry},candidate,{phase});
    if (!result.accepted) { rejected.push({decisionDomain:result.domain ?? null,reason:result.reason}); continue; }
    accepted.push(candidate); if (!registry.some((entry)=>semanticDecisionDomainEquivalent(entry.decisionDomain,result.domain))) registry.push({decisionDomain:result.domain,grounding:candidate.grounding ? clone(candidate.grounding) : null});
  }
  return {context:{...context,groundedDomainRegistry:registry,rejectedDecisionCandidates:rejected},accepted};
}
function domainHasGrounding(context, domain) { return groundedDomains(context).some((existing)=>semanticDecisionDomainEquivalent(existing,domain)); }

export function semanticDecisionDomainEquivalent(left, right) {
  const a = canonicalDecisionDomain(left, left); const b = canonicalDecisionDomain(right, right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = decisionDomainTokens(a); const bTokens = decisionDomainTokens(b);
  if (!aTokens.length || !bTokens.length) return false;
  const aSet = new Set(aTokens); const bSet = new Set(bTokens);
  const shared = [...aSet].filter((token) => bSet.has(token)).length;
  const smaller = Math.min(aSet.size, bSet.size);
  return smaller >= 2 && shared === smaller;
}

function settledSemanticDomains(context) {
  return [
    ...(context?.answeredDecisionDomains ?? []),
    ...(context?.inferredDecisionDomains ?? []),
    ...invariantDomains(context),
    ...(context?.confirmedFinalDecisions ?? []).map((item) => item.decisionDomain),
  ].filter(Boolean);
}

export function isDecisionDomainSettled(context, domain) {
  return settledSemanticDomains(context).some((settled) => semanticDecisionDomainEquivalent(settled, domain));
}

function normalizedDecisionValue(value) { return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " "); }

export function finalDecisionSnapshot(context) {
  return (context?.facts ?? []).filter((fact) => fact.key !== "idea" && fact.source !== SOURCE.INITIAL).map((fact) => {
    const decisionDomain = canonicalDecisionDomain(fact.decisionDomain ?? fact.key, fact.key);
    return { id: fact.key, decisionDomain, fingerprint: `${decisionDomain}::${normalizedDecisionValue(fact.value)}`, source: fact.source };
  }).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

export function finalConfirmationFingerprint(context) {
  return finalDecisionSnapshot(context).map((item) => item.fingerprint).join("|");
}

export function registerFinalConfirmation(context) {
  const fingerprint = finalConfirmationFingerprint(context);
  const history = context?.finalConfirmationHistory ?? [];
  return {
    context: history.includes(fingerprint) ? context : { ...context, finalConfirmationHistory: [...history, fingerprint] },
    fingerprint,
    loopDetected: history.includes(fingerprint),
  };
}

export function confirmFinalDecisions(context) {
  const snapshot = finalDecisionSnapshot(context);
  return {
    ...context,
    confirmedFinalDecisions: snapshot,
    finalConfirmationFingerprint: snapshot.map((item) => item.fingerprint).join("|"),
    status: "user_confirmed",
  };
}

function invariantDomains(context) {
  return new Set((context?.coreInvariants?.length ? context.coreInvariants : deriveCoreInvariants(context)).map((invariant) => invariant.decisionDomain));
}

const technicalPresentationPattern = /(?:\bnull\b|\bdb\b|database|永続化|レコード|\bschema\b|status\s*field|\btransaction\b|トランザクション|\bapi\b|endpoint|排他制御|\block\b|foreign\s+key|primary\s+key|\bjson\b|\bserver(?:-side)?\b|\bclient-side\b|localstorage|not\s+null|nullable)/i;
const explicitTechnicalIntentPattern = /(?:\bdb\b|database|永続化|schema|\bapi\b|endpoint|排他制御|transaction|トランザクション|localstorage|技術方式|実装方式)/i;

function questionText(question) {
  return [question?.title, question?.intent, question?.recommended, question?.recommendationReason, ...(question?.options ?? []).map(optionLabel)].filter(Boolean).join("\n");
}

function userExplicitlyRequestsTechnicalLanguage(context) {
  return explicitTechnicalIntentPattern.test((context?.facts ?? []).filter((fact) => fact.source === SOURCE.INITIAL || fact.source === SOURCE.USER).map((fact) => `${fact.key} ${fact.value}`).join("\n"));
}

/** A user-facing question must describe an experience, never storage mechanics. */
export function questionPresentationGuard(question, context) {
  const declaredUnsafe = (question?.presentation?.technicalTermsFound ?? []).some((term) => technicalPresentationPattern.test(String(term)));
  const detectedTerms = technicalPresentationPattern.test(questionText(question));
  const allowedByUser = userExplicitlyRequestsTechnicalLanguage(context);
  return { safe: allowedByUser || (!declaredUnsafe && !detectedTerms), technicalLanguageDetected: !allowedByUser && (declaredUnsafe || detectedTerms) };
}

function questionPassesDecisionGate(question, questionDepth = 0) {
  const need = question?.necessity;
  if (!need) return true;
  const clarifies = need.clarifiesExplicitUserRequest ?? need.clarifiesUserRequest ?? false;
  const relevant = need.requiredForCoreValue || need.requiredForPrimaryFlow || clarifies || need.changesProductBehavior;
  const decisionClass = need.decisionClass ?? "product";
  const requiresUserDecision = need.requiresUserDecision ?? true;
  const boundary = question.decisionBoundary ?? "primary_flow";
  const informationGain = question.informationGain ?? "high";
  const architecturalImpact = question.architecturalImpact ?? "major";
  if (!relevant || !requiresUserDecision || boundary === "none" || architecturalImpact !== "major" || need.implementationDetailOnly || need.derivedOnlyFromAIInference || decisionClass === "implementation") return false;
  if (decisionClass === "edge_case" && !(need.requiredForCoreValue || need.requiredForPrimaryFlow)) return false;
  if (informationGain === "low" && !(need.requiredForCoreValue || need.requiredForPrimaryFlow)) return false;
  if (questionDepth >= 2 && !(decisionClass === "product" && (need.requiredForCoreValue || need.requiredForPrimaryFlow))) return false;
  return !need.introducesNewFeature || need.requiredForCoreValue || need.requiredForPrimaryFlow || clarifies;
}

function productDecisionDimensions(context) {
  return (context?.dimensions ?? []).filter((dimension) => {
    const domain = canonicalDecisionDomain(dimension.question, dimension.id);
    return dimension.userJudgmentRequired !== false && dimension.question
      && !invariantDomains(context).has(domain)
      && questionIsAllowed(dimension.question, dimension.questionDepth ?? 0, context);
  });
}

function flowDomainSignal(domain) {
  // A domain name can contain "primary" while describing permissions (for
  // example `primary_share_model`). Treat only a flow/action concept itself
  // as evidence that the primary user operation has been decided.
  return /(?:primary[_ -]?(?:flow|action|operation|workflow)|(?:user[_ -]?)?(?:flow|action|operation|workflow|transaction)|reservation|booking|control|interaction|registration|register|entry|create|update|delete|record|search|view|select|主要操作|中心操作|利用フロー|登録|追加|更新|削除|記録|検索|確認|選択|作成|予約|操作)/i.test(String(domain ?? ""));
}

function answeredPrimaryFlowDomainSignal(context) {
  const answered = new Set(context?.answeredQuestionKeys ?? []);
  return (context?.dimensions ?? []).some((dimension) => {
    if (!answered.has(dimension.id)) return false;
    const boundary = dimension.question?.decisionBoundary ?? "none";
    // A roles/permissions answer may mention edit/update in its domain name,
    // but it only decides who may act, not which product action forms the
    // primary flow.
    if (!["primary_flow", "core_value", "mvp_feature", "business_rule"].includes(boundary)) return false;
    return flowDomainSignal(canonicalDecisionDomain(dimension.question, dimension.id));
  });
}

function actorDomainSignal(domain) { return /(?:actor|audience|user|role|permission|usage|scope|利用者|対象者|利用範囲)/i.test(String(domain ?? "")); }
function managedObjectDomainSignal(domain) { return /(?:object|target|item|asset|inventory|record|managed|対象|管理物|備品)/i.test(String(domain ?? "")); }
function outputSelectionDomainSignal(domain) { return /(?:match|eligib|selection[_ -]?rule|recommendation[_ -]?(?:rule|basis)|strictness|qualification|candidate[_ -]?rule|照合|一致条件|選定基準|提案基準|判定基準)/i.test(String(domain ?? "")); }
const outputSelectionFlowPattern = /(?:recommend|suggest|match|rank|filter|candidate|eligible|提案|推薦|おすすめ|候補|適合|マッチ|絞り込)/i;
const explicitOutputSelectionRulePattern = /(?:complete|exact|partial|substitut|all required|at least|threshold|score|完全一致|部分一致|代替|全(?:て|部|必要).{0,18}(?:満た|揃)|不足.{0,12}許容|閾値|スコア.{0,12}(?:以上|上位))/i;

function coreOutputEligibilityNeedsDecision(context, domains) {
  if (!context?.criticalDecisionCoverageAuditRequired) return false;
  const flowText = [context?.idea, context?.analysis?.purpose, context?.analysis?.primaryAction, context?.analysis?.successCondition].filter(Boolean).join(" ");
  if (!outputSelectionFlowPattern.test(flowText)) return false;
  if (explicitOutputSelectionRulePattern.test(explicitProductSourceText(context))) return false;
  return !domains.some(outputSelectionDomainSignal);
}

/**
 * Provider v4.2 decisions carry the three answers from the Question Necessity
 * Test. Persisted v4.1 contexts have no metadata, so they keep their former
 * user-owned behavior until the next AI reassessment supplies an explicit
 * classification.
 */
const supplementaryDataShapeDecisionPattern = /(?:required[_ -]?(?:field|attribute)|(?:input|item|object|entity|inventory)[_ -]?(?:fields?|attributes?|granularity)|(?:field|attribute)[_ -]?(?:requirement|selection)|(?:data|representation)[_ -]?granularity|metadata|必須項目|必須属性|入力項目|データ粒度|表現粒度)/i;
const explicitSupplementaryDataPattern = /(?:quantity|amount|weight|unit|expiry|expiration|category|metadata|数量|分量|重量|単位|期限|賞味期限|消費期限|カテゴリ|属性)/i;
const actorScopeDecisionPattern = /(?:^|[_ -])(?:actor|user|audience|role)[_ -]?(?:scope|model|type)(?:$|[_ -])|(?:利用者|ユーザー)(?:範囲|種別)|アカウント構造/i;
const multiActorProductPattern = /(?:家族|チーム|社内|会社|組織|共同|共有|管理者|保護者|子ども|子供|出品者|購入者|貸す|借りる|予約|承認|複数人|multi.?user|family|team|company|organization|shared|admin|parent|child|seller|buyer|lend|borrow|book|reserv|approval)/i;
const explicitSingleUserBoundaryPattern = /(?:単一(?:ユーザー|利用者|端末)|個人(?:利用|で使)|1デバイス1ユーザー|アカウント不要|端末単独|single.?user|one.?user|no account)/i;

function explicitProductSourceText(context) {
  return [context?.idea, ...(context?.facts ?? []).filter((fact) => fact.source === SOURCE.INITIAL || fact.source === SOURCE.USER).map((fact) => `${fact.key} ${fact.value}`)].filter(Boolean).join("\n");
}

function contextMakesDecisionNonblocking(context, item) {
  if (!context) return false;
  const candidate = `${item?.decisionDomain ?? item?.key ?? ""} ${item?.reason ?? ""} ${item?.rationale ?? ""}`;
  const source = explicitProductSourceText(context);
  if (supplementaryDataShapeDecisionPattern.test(candidate) && !explicitSupplementaryDataPattern.test(source)) return true;
  // Once the user has explicitly chosen a single-user/no-account boundary,
  // asking again whether the product is multi-user is a duplicate product
  // decision. Conversely, collaboration/transaction ideas still keep actor
  // scope user-owned.
  return actorScopeDecisionPattern.test(candidate)
    && explicitSingleUserBoundaryPattern.test(source)
    && !multiActorProductPattern.test(String(context?.idea ?? ""));
}

export function criticalDecisionRequiresQuestion(item, context = null) {
  const necessity = item?.necessity;
  if (contextMakesDecisionNonblocking(context, item)) return false;
  if (!necessity) return true;
  const hasStructuredMaterialImpact = Object.values(necessity.productImpact ?? {}).some((value) => value === true);
  // A convenience default cannot settle a choice whose alternatives change
  // the product contract.  The provider reports those generic impact axes
  // explicitly so this guard does not depend on an app genre or domain name.
  if (hasStructuredMaterialImpact && necessity.derivableFromConfirmedDecision === false) return true;
  return necessity.requiresUserDecision === true
    && necessity.safeMvpDefaultAvailable === false
    && necessity.materiallyChangesProduct === true
    && necessity.derivableFromConfirmedDecision === false;
}

/**
 * The analysis describes what is already certain; it must not silently turn
 * an ambiguous generic "management" idea into a CRUD or completion flow.
 */
function primaryFlowCompleteness(context) {
  const analysis = context?.analysis;
  // Contexts saved before the flow-skeleton fields existed must retain their
  // established behavior. New Structured Output analysis always includes the
  // fields explicitly (with null for a genuine ambiguity).
  if (!analysis || !Object.hasOwn(analysis, "primaryAction")) return {
    actor: { resolved: true, source: "legacy_context" },
    managedObject: { resolved: true, source: "legacy_context" },
    primaryAction: { resolved: true, source: "legacy_context" },
    persistedOutcome: { resolved: true, source: "legacy_context" },
    successCondition: { resolved: true, source: "legacy_context" },
  };
  const resolvedDomains = new Set([...(context?.answeredDecisionDomains ?? []), ...(context?.inferredDecisionDomains ?? [])]);
  const hasDomain = (signal) => [...resolvedDomains].some(signal);
  // "Manage" alone describes a goal, not an implementable user action. A
  // concrete verb is required unless a flow decision has already been settled.
  const concreteAction = /(?:登録|追加|更新|削除|入力|記録|検索|確認|選択|作成|共有|予約|貸出|返却|移動|回答|撮影|認識|比較|購入|送信|閲覧|edit|add|update|delete|enter|record|search|view|select|create|share|book|reserve|borrow|return|move|answer|capture|recogniz|compare|purchase|send)/i;
  const hasExplicitInitialAction = concreteAction.test(String(context?.idea ?? ""));
  const hasAction = (hasExplicitInitialAction && Boolean(analysis.primaryAction) && concreteAction.test(String(analysis.primaryAction)))
    || answeredPrimaryFlowDomainSignal(context);
  const hasActor = Boolean(analysis.targetUsers) || hasDomain(actorDomainSignal);
  const hasObject = Boolean(analysis.managedObject) || hasDomain(managedObjectDomainSignal);
  return {
    actor: { resolved: hasActor, source: analysis.targetUsers ? "analysis" : hasDomain(actorDomainSignal) ? "decision_domain" : "missing" },
    managedObject: { resolved: hasObject, source: analysis.managedObject ? "analysis" : hasDomain(managedObjectDomainSignal) ? "decision_domain" : "missing" },
    primaryAction: { resolved: hasAction, source: hasExplicitInitialAction && analysis.primaryAction ? "analysis" : answeredPrimaryFlowDomainSignal(context) ? "answered_primary_flow_decision" : "missing" },
    // Saving the result and recognizing a successful primary action are
    // implementation-neutral consequences of an established primary flow.
    persistedOutcome: { resolved: hasAction, source: hasAction ? "primary_flow" : "missing" },
    successCondition: { resolved: Boolean(analysis.successCondition) || hasAction, source: analysis.successCondition ? "analysis" : hasAction ? "primary_flow" : "missing" },
  };
}

/**
 * The analysis records the product-owner decisions that cannot be safely
 * guessed from the initial idea. They are intentionally independent of the
 * first batch of rendered questions: a provider omission must not turn an
 * unresolved product choice into a completed specification.
 */
function analysisCriticalProductDecisions(context) {
  const initial = (context?.analysis?.criticalProductDecisions ?? [])
    .filter((item) => item?.decisionDomain)
    .filter((item) => evaluateRequirementGrounding(context, item, { phase: "initial" }).accepted)
    .filter((item) => criticalDecisionRequiresQuestion(item, context))
    .map((item) => ({
      decisionDomain: canonicalDecisionDomain(item.decisionDomain, item.decisionDomain),
      resolvedByInitialInput: item.resolvedByInitialInput === true,
      reason: item.reason || "主要なプロダクト上の意思決定が未確定です。",
      necessity: item.necessity ?? null,
    }))
    .filter((item) => !invariantDomains(context).has(item.decisionDomain));
  const reevaluated = (context?.reassessedCriticalProductDecisions ?? [])
    .filter((item) => item?.decisionDomain)
    .filter((item) => domainHasGrounding(context, item.decisionDomain))
    .filter((item) => criticalDecisionRequiresQuestion(item, context))
    .map((item) => ({
      decisionDomain: canonicalDecisionDomain(item.decisionDomain, item.decisionDomain),
      resolvedByInitialInput: false,
      reason: item.reason || "主要なプロダクト上の意思決定が未確定です。",
      necessity: item.necessity ?? null,
    }))
    .filter((item) => !invariantDomains(context).has(item.decisionDomain));
  return [...new Map([...initial, ...reevaluated].map((item) => [item.decisionDomain, item])).values()];
}

/**
 * Completion means that user-owned product choices are settled, not merely
 * that every current candidate was filtered out. Invariants and direct
 * inferences count as resolved; implementation and optional choices do not.
 */
export function completionGate(context) {
  const dimensions = productDecisionDimensions(context);
  const reservationFlow = invariantDomains(context).has("reservation_exclusivity");
  const directProductDomains = dimensions.map((dimension) => canonicalDecisionDomain(dimension.question, dimension.id));
  const analysisDecisions = analysisCriticalProductDecisions(context);
  const flowCoverage = primaryFlowCompleteness(context);
  const hasDirectProductDecision = directProductDomains.length > 0 || analysisDecisions.length > 0;
  const fallbackDomain = reservationFlow ? "reservation_primary_flow" : "primary_flow_definition";
  const criticalDecisionDomains = hasDirectProductDecision
    ? [...new Set([...directProductDomains, ...analysisDecisions.map((item) => item.decisionDomain)])]
    : context?.analysis && flowCoverage.primaryAction.resolved ? [] : [fallbackDomain];
  const knownDecisionDomains = [...criticalDecisionDomains, ...(context?.answeredDecisionDomains ?? []), ...(context?.inferredDecisionDomains ?? [])];
  if (coreOutputEligibilityNeedsDecision(context, knownDecisionDomains)) criticalDecisionDomains.push("core_output_eligibility");
  if (!flowCoverage.primaryAction.resolved && !criticalDecisionDomains.includes("primary_flow_definition")) criticalDecisionDomains.push("primary_flow_definition");
  if (!flowCoverage.actor.resolved && !criticalDecisionDomains.some(actorDomainSignal)) criticalDecisionDomains.push("actor_scope");
  if (!flowCoverage.managedObject.resolved && !criticalDecisionDomains.some(managedObjectDomainSignal)) criticalDecisionDomains.push("managed_object_definition");
  const userOwnedCriticalDomains = new Set(criticalDecisionDomains.filter((domain) => !analysisDecisions.some((item) => item.decisionDomain === domain && item.resolvedByInitialInput)));
  const resolvedDomains = new Set([
    ...(context?.answeredDecisionDomains ?? []),
    ...(context?.confirmedFinalDecisions ?? []).map((item) => item.decisionDomain),
    ...analysisDecisions.filter((item) => item.resolvedByInitialInput).map((item) => item.decisionDomain),
    ...(context?.inferredDecisionDomains ?? []).filter((domain) => !userOwnedCriticalDomains.has(canonicalDecisionDomain(domain, domain))),
    ...(context?.facts ?? []).filter((fact) => fact.source === SOURCE.USER || (fact.source === SOURCE.AI && !userOwnedCriticalDomains.has(canonicalDecisionDomain(fact.decisionDomain ?? fact.key, fact.key)))).map((fact) => canonicalDecisionDomain(fact.decisionDomain ?? fact.key, fact.key)),
  ].map((domain) => canonicalDecisionDomain(domain, domain)));
  const resolvedCriticalDecisionDomains = criticalDecisionDomains.filter((domain) => resolvedDomains.has(domain));
  const unresolvedCriticalProductDecisions = criticalDecisionDomains
    .filter((domain) => !resolvedDomains.has(domain))
    .map((decisionDomain) => {
      const analysisReason = analysisDecisions.find((item) => item.decisionDomain === decisionDomain)?.reason;
      return {
        decisionDomain,
        reason: decisionDomain === "actor_scope" ? "主な利用者が未定義です。"
          : decisionDomain === "managed_object_definition" ? "主に管理・操作する対象が未定義です。"
            : analysisReason ?? (reservationFlow ? "予約する対象と確定までの主要フローが未定義です。" : "主要な利用者操作が未定義です。"),
      };
    });
  const coverageAuditRequired = context?.criticalDecisionCoverageAuditRequired === true;
  const coverageAuditCurrent = !coverageAuditRequired || (
    context?.criticalDecisionCoverageAudit?.fingerprint === criticalDecisionCoverageFingerprint(context)
    && context?.criticalDecisionCoverageAudit?.complete === true
  );
    console.group("[DIAG] completionGate");
  console.log("criticalDecisionDomains", criticalDecisionDomains);
  console.log("resolvedDomains", [...resolvedDomains]);
  console.log("resolvedCriticalDecisionDomains", resolvedCriticalDecisionDomains);
  console.log("unresolvedCriticalProductDecisions", unresolvedCriticalProductDecisions.map((x) => ({ decisionDomain: x.decisionDomain, reason: x.reason })));
  console.log("primaryFlowCoverage", flowCoverage);
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.groupEnd();
  return {
    complete: unresolvedCriticalProductDecisions.length === 0 && !hasUnresolvedStateTransitionGaps(context) && coverageAuditCurrent,
    criticalDecisionDomains,
    resolvedCriticalDecisionDomains,
    unresolvedCriticalProductDecisions,
    primaryFlowCoverage: flowCoverage,
    coreInvariants: context?.coreInvariants?.length ? context.coreInvariants : deriveCoreInvariants(context),
    coverageAuditRequired,
    coverageAuditCurrent,
    coverageAuditPending: coverageAuditRequired && !coverageAuditCurrent && unresolvedCriticalProductDecisions.length === 0 && !hasUnresolvedStateTransitionGaps(context),
  };
}

function genericDecisionQuestionText(missing) {
  const domain = String(missing?.decisionDomain ?? "").trim();
  const reason = String(missing?.reason ?? "").trim();
  const meaningfulDomain = domain
    .replace(/^(?:core_value|primary_flow|mvp_feature|business_rule|roles_permissions)\s*[:/_-]\s*/i, "")
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subject = meaningfulDomain || reason.replace(/[。.!?！？]+$/u, "") || "未確定のプロダクト判断";
  return {
    label: subject,
    title: `${subject}について、どの方針にしますか？`,
    intent: reason || `${subject}を実装可能な形で確定します。`,
  };
}

function completionQuestion(context, missing) {
  console.group("[DIAG] completionQuestion input");
  console.log("missing", { decisionDomain: missing?.decisionDomain ?? null, reason: missing?.reason ?? null });
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.log("all dimensions before generation", (context?.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value })));
  console.groupEnd();
  const reservationFlow = invariantDomains(context).has("reservation_exclusivity");
  const domain = String(missing.decisionDomain ?? "");
  const asksCustomerInformationTiming = /(?:customer|contact|identity|information|profile).*(?:reservation|booking|creation)?|(?:reservation|booking).*(?:customer|contact|identity|information|profile)/i.test(domain);
  if (asksCustomerInformationTiming) {
    const options = ["予約するときに名前・連絡先を入力する", "予約後でも名前・連絡先を入力できるようにする", "その他・自由回答"];
    return {
      id: missing.decisionDomain, label: "予約する人の情報", importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: 0,
      question: {
        title: "予約する人の情報は、いつ入力する形にしますか？", intent: "予約時にどこまで入力してもらうかを決めます。", options,
        recommended: options[0], recommendationReason: "予約が確定した時点で誰の予約か分かると、利用者にもお店にも分かりやすいためです。",
        decisionDomain: missing.decisionDomain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
        necessity: { requiredForCoreValue: false, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
      },
    };
  }
  if (domain === "actor_scope") {
    const options = ["個人または単一端末で使う", "チームや複数人で使う", "その他・自由回答"];
    return {
      id: domain, label: "主な利用者", importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: 0,
      question: {
        title: "主に誰が使うアプリにしますか？", intent: "利用者ごとの操作や共有の必要性を決めます。", options,
        recommended: options[0], recommendationReason: "まずは利用者の範囲を絞ると、MVPの中心を決めやすいためです。",
        decisionDomain: domain, decisionBoundary: "roles_permissions", informationGain: "high", architecturalImpact: "major",
        necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
      },
    };
  }
  if (domain === "managed_object_definition") {
    const options = ["対象の一覧と基本情報を管理する", "対象の利用状況を中心に管理する", "その他・自由回答"];
    return {
      id: domain, label: "主に管理する対象", importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: 0,
      question: {
        title: "このアプリでは、対象の何を中心に管理しますか？", intent: "主要な画面と扱う情報の中心を決めます。", options,
        recommended: options[0], recommendationReason: "まずは管理対象の基本情報を整理すると、最小のMVPを作りやすいためです。",
        decisionDomain: domain, decisionBoundary: "primary_flow", informationGain: "high", architecturalImpact: "major",
        necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
      },
    };
  }
  if (domain === "core_output_eligibility") {
    const options = ["条件をすべて満たす候補だけを含める", "一部の条件を満たす候補も理由付きで含める", "その他・自由回答"];
    return {
      id: domain, label: "候補に含める基準", importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: 0,
      question: {
        title: "どの条件を満たす候補を結果に含めますか？", intent: "結果として提示する候補の範囲を決めます。", options,
        recommended: options[0], recommendationReason: "条件を満たす候補だけに絞ると、結果の意味が明確になるためです。",
        decisionDomain: domain, decisionBoundary: "core_value", informationGain: "high", architecturalImpact: "major",
        necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
      },
    };
  }
  if (/(?:content|catalog|dataset|knowledge|recipe)[_ -]?(?:source|coverage|collection)|(?:source|coverage)[_ -]?(?:content|catalog|dataset|recipe)/i.test(domain)) {
    const options = ["必要な候補データをアプリに内蔵する", "外部サービスから候補データを取得する", "その他・自由回答"];
    return {
      id: domain, label: "候補データの用意方法", importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: 0,
      question: {
        title: "提案に使う候補データは、どのように用意しますか？", intent: "候補の範囲と、外部サービスへの依存有無を決めます。", options,
        recommended: options[0], recommendationReason: "小規模なMVPでは、必要な候補を内蔵すると外部サービスなしで動かせるためです。",
        decisionDomain: domain, decisionBoundary: "mvp_feature", informationGain: "high", architecturalImpact: "major",
        necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
      },
    };
  }
  const generic = genericDecisionQuestionText(missing);
  const options = ["推奨される最小方針で進める", "別の方針を指定する", "その他・自由回答"];
  return {
    id: missing.decisionDomain,
    label: generic.label,
    importance: "high",
    userJudgmentRequired: true,
    known: false,
    value: null,
    questionDepth: 0,
    question: {
      title: generic.title,
      intent: generic.intent,
      options,
      recommended: options[0],
      recommendationReason: "未確定のプロダクト判断を、元の意味を保ったまま具体化するためです。",
      decisionDomain: missing.decisionDomain,
      decisionBoundary: "primary_flow",
      informationGain: "high",
      architecturalImpact: "major",
      necessity: { requiredForCoreValue: true, requiredForPrimaryFlow: true, clarifiesExplicitUserRequest: true, changesProductBehavior: true, introducesNewFeature: false, implementationDetailOnly: false, derivedOnlyFromAIInference: false, decisionClass: "product", requiresUserDecision: true },
    },
  };
}

/** Supplies one generic, flow-derived question only when the provider has no valid product candidate. */
function addCompletionQuestion(context) {
  const gate = completionGate(context);
  console.group("[DIAG] addCompletionQuestion gate");
  console.log("gate.complete", gate.complete);
  console.log("gate.coverageAuditPending", gate.coverageAuditPending);
  console.log("unresolved", (gate.unresolvedCriticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain, reason: x.reason })));
  console.log("all dimensions entering addCompletionQuestion", (context.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value })));
  console.groupEnd();
  if (gate.complete || planNext(context)) return { ...context, completionGate: gate };
  // Coverage is an independent AI review, not a synthetic Product Decision.
  // The UI invokes it before review; only decisions found by that audit are
  // converted into questions.
  if (gate.coverageAuditPending) return { ...context, completionGate: gate };
  const missing = gate.unresolvedCriticalProductDecisions[0];
  if (!missing) return { ...context, completionGate: gate };
  const fallback = completionQuestion(context, missing);
  console.group("[DIAG] completionQuestion generated");
  console.log({
    missingDecisionDomain: missing?.decisionDomain ?? null,
    generatedId: fallback?.id ?? null,
    generatedQuestionDomain: fallback?.question?.decisionDomain ?? null,
    generatedTitle: fallback?.question?.title ?? null,
    generatedOptions: fallback?.question?.options ?? [],
  });
  console.groupEnd();
  const hasInvalidCandidate = (context.dimensions ?? []).some((dimension) => canonicalDecisionDomain(dimension.question, dimension.id) === missing.decisionDomain);
  const dimensions = hasInvalidCandidate
    ? context.dimensions.map((dimension) => canonicalDecisionDomain(dimension.question, dimension.id) === missing.decisionDomain ? fallback : dimension)
    : [...(context.dimensions ?? []), fallback];
  const next = { ...context, dimensions };
  console.group("[DIAG] merged clarification dimensions");
  console.log("hasInvalidCandidate", hasInvalidCandidate);
  console.log("missingDecisionDomain", missing?.decisionDomain ?? null);
  console.log("dimensions after merge", dimensions.map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value, title: d.question?.title ?? null })));
  console.groupEnd();
  return { ...next, completionGate: completionGate(next) };
}

/**
 * Public boundary for the UI: it must never enter review while the Completion
 * Gate still has a user-owned decision without a question to present.
 */
export function ensureCompletionQuestion(context) {
  return addCompletionQuestion(context);
}

function optionLabel(option) { return typeof option === "string" ? option : String(option?.label ?? ""); }

function violatesReservationInvariant(option, context) {
  if (!invariantDomains(context).has("reservation_exclusivity")) return false;
  const label = optionLabel(option);
  // A device-local reservation marker would leave the same real slot bookable
  // by another user. This is an invariant violation, not a product choice.
  return /(?:同一端末|この端末|端末内|same\s+device|local(?:\s+device)?\s+only)/i.test(label)
    && /(?:予約済み|利用不可|排他|occupied|unavailable|exclusive|booked)/i.test(label);
}

/**
 * The provider returns audit metadata for every option.  The UI intentionally
 * receives only safe labels, keeping its existing string-based interaction.
 */
export function sanitizeQuestionOptions(question, context) {
  if (!question) return question;
  const options = (question.options ?? []).filter((option) => {
    const unsafe = option && typeof option === "object"
      && (option.violatesCoreInvariant === true || option.violatesConfirmedDecision === true);
    return !unsafe && !violatesReservationInvariant(option, context);
  }).map(optionLabel).filter(Boolean);
  const recommended = options.includes(question.recommended) ? question.recommended : options[0] ?? "";
  const presentation = questionPresentationGuard({ ...question, options, recommended }, context);
  return { ...question, options, recommended, presentationUnsafe: presentation.technicalLanguageDetected };
}

function questionIsAllowed(question, questionDepth = 0, context = null) {
  if (!questionPassesDecisionGate(question, questionDepth)) return false;
  if (context) {
    const domain = canonicalDecisionDomain(question, questionDomain(question));
    if (invariantDomains(context).has(domain)) return false;
    if (contextMakesDecisionNonblocking(context, { decisionDomain: domain, reason: questionText(question) })) return false;
    const sanitized = sanitizeQuestionOptions(question, context);
    if (sanitized.options.length < 2 || sanitized.presentationUnsafe) return false;
  }
  return true;
}

/** Display progress is deliberately independent from the Completion Gate. */
export function monotonicDisplayProgress(previousDisplayProgress, calculatedProgress, genuineCriticalDecisionDiscovered = false) {
  const next = Math.min(100, Math.max(0, Number(calculatedProgress) || 0));
  // A genuinely new, Question-Necessity-tested domain changes the denominator.
  // Only that event may lower the conversational coverage indicator. Ordinary
  // provider re-ranking and duplicate discoveries remain monotonic.
  return genuineCriticalDecisionDiscovered ? next : Math.max(Number(previousDisplayProgress) || 0, next);
}

export function planNext(context, detailMode = false) {
  const weight = { high: 3, medium: 2, low: 1 };
  const settledDomains = new Set([...(context.answeredDecisionDomains ?? []), ...(context.inferredDecisionDomains ?? []), ...invariantDomains(context)].map((domain) => canonicalDecisionDomain(domain, domain)));
  const selected = context.dimensions
    .filter((d) => !d.known && d.value == null && d.question && !(context.answeredQuestionKeys ?? []).includes(d.id) && !settledDomains.has(canonicalDecisionDomain(d.question, d.id)) && questionIsAllowed(d.question, d.questionDepth ?? 0, context) && (detailMode || d.userJudgmentRequired))
    .sort((a, b) => {
      const aNeed = a.question?.necessity; const bNeed = b.question?.necessity;
      const score = (need) => Number(need?.clarifiesUserRequest) * 3 + Number(need?.requiredForCoreValue) * 2 + Number(need?.requiredForPrimaryFlow);
      return score(bNeed) - score(aNeed) || weight[b.importance] - weight[a.importance];
    })[0] ?? null;
  console.group("[DIAG] planNext");
  console.log("all dimensions", (context.dimensions ?? []).map((d) => ({
    id: d.id,
    decisionDomain: d.question?.decisionDomain ?? null,
    canonicalDomain: canonicalDecisionDomain(d.question, d.id),
    title: d.question?.title ?? null,
    known: d.known,
    value: d.value,
    answeredQuestion: (context.answeredQuestionKeys ?? []).includes(d.id),
    settledExact: settledDomains.has(canonicalDecisionDomain(d.question, d.id)),
    settledSemantic: isDecisionDomainSettled(context, canonicalDecisionDomain(d.question, d.id)),
    questionAllowed: d.question ? questionIsAllowed(d.question, d.questionDepth ?? 0, context) : false,
    userJudgmentRequired: d.userJudgmentRequired,
  })));
  console.log("candidate dimensions", (context.dimensions ?? []).filter((d) => !d.known && d.value == null && d.question).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, canonicalDomain: canonicalDecisionDomain(d.question, d.id), title: d.question?.title ?? null, answeredQuestion: (context.answeredQuestionKeys ?? []).includes(d.id), settledExact: settledDomains.has(canonicalDecisionDomain(d.question, d.id)), settledSemantic: isDecisionDomainSettled(context, canonicalDecisionDomain(d.question, d.id)) })));
  console.log("answeredDecisionDomains", context.answeredDecisionDomains ?? []);
  console.log("selected", selected ? { id: selected.id, decisionDomain: selected.question?.decisionDomain ?? null, canonicalDomain: canonicalDecisionDomain(selected.question, selected.id), title: selected.question?.title ?? null } : null);
  console.groupEnd();
  return selected;
}

export function recordAnswer(context, dimensionId, value, usedRecommendation = false) {
  const dimension = context.dimensions.find((item) => item.id === dimensionId);
  if (!dimension) throw new Error(`Unknown specification dimension: ${dimensionId}`);
  if ((context.answeredQuestionKeys ?? []).includes(dimensionId) || context.answers[dimensionId] !== undefined) return context;
  const dimensions = context.dimensions.map((item) => item.id === dimensionId ? { ...item, known: true, value } : item);
  const fact = {
    key: dimensionId, value, source: SOURCE.USER,
    decisionDomain: canonicalDecisionDomain(dimension.question, dimensionId),
    reason: usedRecommendation ? "AI推奨をユーザーが採用" : "ユーザーが自由回答で決定",
  };
  const next = {
    ...context, dimensions, answers: { ...context.answers, [dimensionId]: value },
    facts: uniqueByKey([...context.facts, fact]), answeredQuestionKeys: [...(context.answeredQuestionKeys ?? []), dimensionId],
    answeredDecisionDomains: [...new Set([...(context.answeredDecisionDomains ?? []), canonicalDecisionDomain(dimension.question, dimensionId)])],
    history: [...context.history, { dimensionId, value, questionDepth: dimension.questionDepth ?? 0, source: SOURCE.USER, at: new Date().toISOString() }],
  };
    console.group("[DIAG] recordAnswer");
  console.log("dimension.id", dimension.id);
  console.log("question.decisionDomain", dimension.question?.decisionDomain ?? null);
  console.log("canonical answered domain", canonicalDecisionDomain(dimension.question, dimensionId));
  console.log("answeredDecisionDomains", next.answeredDecisionDomains);
  console.log("user confirmed facts", next.facts.filter((f) => f.source === SOURCE.USER).map((f) => ({ key: f.key, decisionDomain: f.decisionDomain ?? null, value: f.value })));
  console.groupEnd();
  return { ...next, completionGate: completionGate(next) };
}

function normaliseInference(inference) {
  if (inference?.decisions) return {
    requirements: Object.entries(inference.decisions).map(([key, decision]) => ({ key, value: decision?.value ?? decision, reason: decision?.reason ?? "MVPとしてAIが合理的に補完" })),
    implementationProposals: [], futureOptional: [], clarificationQuestions: [], stateTransitionGaps: [], criticalProductDecisions: [],
  };
  return {
    requirements: inference?.aiInferredRequirements ?? [],
    implementationProposals: inference?.implementationProposals ?? [], futureOptional: inference?.futureOptional ?? [],
    clarificationQuestions: inference?.clarificationQuestions ?? [],
    stateTransitionGaps: inference?.stateTransitionGaps ?? [],
    criticalProductDecisions: inference?.criticalProductDecisions ?? [],
  };
}

const optionalIntentPattern = /(?:任意|optional|あってもよい|なくてもよい|将来|後で|可能なら|してもよい)/i;
const meaningfulFeatureTerms = (value) => String(value ?? "").toLowerCase()
  .match(/[a-z][a-z0-9_-]{2,}|[ァ-ヶー]{2,}|[一-龠]{2,}/g)?.map((term) => term.replace(/(?:化|する|機能|対応)$/u, "")).filter((term) => term.length >= 2 && !optionalIntentPattern.test(term)) ?? [];

function explicitlyOptionalFor(context, item) {
  const inferredTerms = meaningfulFeatureTerms(`${item?.key ?? ""} ${item?.value ?? ""}`);
  if (!inferredTerms.length) return false;
  return context.facts.filter((fact) => fact.source === SOURCE.USER || fact.source === SOURCE.INITIAL)
    .filter((fact) => optionalIntentPattern.test(`${fact.key} ${fact.value}`))
    .some((fact) => String(fact.value ?? "").split(/[。.!?\n]+/)
      .filter((sentence) => optionalIntentPattern.test(sentence))
      .some((sentence) => meaningfulFeatureTerms(sentence).some((sourceTerm) => inferredTerms.some((term) => term.includes(sourceTerm) || sourceTerm.includes(term)))));
}

const ungroundedProductConcepts = /(?:\b(?:complete|completion|archive|delete|status|approval|approved|history|notification|loan|return|disposal|consume|consumption)\b|完了|アーカイブ|削除|ステータス|承認|履歴|通知|貸出|返却|廃棄|消費)/i;

const productActionPatterns = Object.freeze([
  ["create", /(?:\b(?:add|create|register)\b|追加|登録|作成)/i],
  ["edit", /(?:\b(?:edit|update|modify)\b|編集|更新|変更)/i],
  ["delete", /(?:\b(?:delete|remove|discard|dispose)\b|削除|廃棄|破棄)/i],
  ["consume", /(?:\b(?:consume|consumption|use\s+up)\b|消費|使い切)/i],
  ["complete", /(?:\b(?:complete|completion|finish)\b|完了)/i],
  ["approve", /(?:\b(?:approve|approval)\b|承認)/i],
  ["borrow", /(?:\b(?:borrow|loan)\b|貸出|借り)/i],
  ["return", /(?:\breturn\b|返却)/i],
]);

function productActionsIn(value) {
  return productActionPatterns.filter(([, pattern]) => pattern.test(String(value ?? ""))).map(([id]) => id);
}

function introducesUngroundedProductAction(context, item) {
  const inferredActions = productActionsIn(`${item?.key ?? ""} ${item?.value ?? ""}`);
  if (!inferredActions.length) return false;
  const sourceActions = new Set(productActionsIn(sourceTextForInference(context, item)));
  return inferredActions.some((action) => !sourceActions.has(action));
}

function inferenceSourceDecisionIds(context, item) {
  const eligibility = item?.eligibility ?? {};
  const explicit = eligibility.sourceDecisionIds ?? item?.sourceDecisionIds ?? [];
  if (explicit.length) return explicit.filter((id) => context.facts.some((fact) => fact.source === SOURCE.USER && fact.key === id));
  // Compatibility for in-memory contexts created before sourceDecisionIds was
  // introduced. A sourceKey that names an actual confirmed decision remains a
  // traceable source; new provider outputs must send sourceDecisionIds.
  return context.facts.some((fact) => fact.source === SOURCE.USER && fact.key === eligibility.sourceKey) ? [eligibility.sourceKey] : [];
}

function validInitialInputSpan(context, item) {
  const span = String(item?.eligibility?.sourceInitialInputSpan ?? item?.sourceInitialInputSpan ?? "").trim();
  return span.length >= 2 && String(context.idea ?? "").includes(span);
}

function sourceTextForInference(context, item) {
  const ids = new Set(inferenceSourceDecisionIds(context, item));
  const sourceFacts = context.facts.filter((fact) => (fact.source === SOURCE.USER && ids.has(fact.key)) || fact.source === SOURCE.INITIAL);
  const span = item?.eligibility?.sourceInitialInputSpan ?? item?.sourceInitialInputSpan;
  return [...sourceFacts.map((fact) => `${fact.key} ${fact.value}`), span].filter(Boolean).join("\n");
}

function introducesUngroundedProductConcept(context, item) {
  const inferredText = `${item?.key ?? ""} ${item?.value ?? ""}`;
  const concepts = inferredText.match(new RegExp(ungroundedProductConcepts.source, "gi")) ?? [];
  if (!concepts.length) return false;
  const source = sourceTextForInference(context, item);
  return concepts.some((concept) => !new RegExp(concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source));
}

function inferenceProvenance(context, item) {
  const eligibility = item?.eligibility ?? {};
  const sourceKey = eligibility.sourceKey;
  const sourceDecisionIds = inferenceSourceDecisionIds(context, item);
  const hasDecisionSource = sourceDecisionIds.length > 0;
  const hasInitialSpan = validInitialInputSpan(context, item);
  const sourceExists = hasDecisionSource || hasInitialSpan || (sourceKey === "core_user_value" && hasInitialSpan) || (sourceKey === "primary_flow" && hasDecisionSource);
  return {
    sourceKey, sourceDecisionIds, sourceInitialInputSpan: hasInitialSpan ? eligibility.sourceInitialInputSpan : null, sourceExists,
    introducesUngroundedProductConcept: introducesUngroundedProductConcept(context, item),
    introducesUngroundedProductAction: introducesUngroundedProductAction(context, item),
  };
}

/**
 * New providers send eligibility metadata.  Older persisted sessions do not,
 * so their existing explicit true/false metadata remains backward compatible.
 */
function mayBecomeMandatoryInferred(context, item) {
  if (item?.uniquelyDerived !== true || item?.hasMultipleReasonableImplementations !== false) return false;
  const eligibility = item?.eligibility;
  if (!eligibility) return !introducesUngroundedProductConcept(context, item) && !introducesUngroundedProductAction(context, item);
  const provenance = inferenceProvenance(context, item);
  const necessity = item.necessity ?? {};
  const indispensable = necessity.confirmedDecisionRequired || necessity.coreUserValueRequired || necessity.primaryFlowRequired || eligibility.acceptanceCriteriaRequired;
  return provenance.sourceExists && eligibility.directDerivation === true && eligibility.derivationDepth === 1
    && eligibility.introducesNewProductValue === false && !provenance.introducesUngroundedProductConcept && !provenance.introducesUngroundedProductAction
    && indispensable && !explicitlyOptionalFor(context, item);
}

/** Records AI data in exactly one of the three non-user categories. */
export function recordInference(context, inference) {
  const withInvariants = { ...context, coreInvariants: deriveCoreInvariants(context) };
  let grouped = normaliseInference(inference);
  console.group("[DIAG] inferMvp");
  console.log("criticalProductDecisions", (grouped.criticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("clarificationQuestions", (grouped.clarificationQuestions ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, title: x.question?.title ?? null })));
  console.log("stateTransitionGaps", (grouped.stateTransitionGaps ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, requiresProductDecision: x.requiresProductDecision ?? null })));
  console.log("answeredDecisionDomains", withInvariants.answeredDecisionDomains ?? []);
  console.groupEnd();
  const decisionCandidates = [...(grouped.criticalProductDecisions ?? []), ...(grouped.clarificationQuestions ?? []), ...(grouped.stateTransitionGaps ?? []).filter((gap) => gap.requiresProductDecision)];
  const admitted = admitGroundedCandidates(withInvariants, decisionCandidates, "after_answer");
  const admittedDomains = admitted.accepted.map((item) => canonicalDecisionDomain(item?.decisionDomain ?? item?.question?.decisionDomain ?? item?.id, item?.id ?? ""));
  const isAdmitted = (item) => admittedDomains.some((domain) => semanticDecisionDomainEquivalent(domain, canonicalDecisionDomain(item?.decisionDomain ?? item?.question?.decisionDomain ?? item?.id, item?.id ?? "")));
  grouped = { ...grouped, criticalProductDecisions: (grouped.criticalProductDecisions ?? []).filter(isAdmitted), clarificationQuestions: (grouped.clarificationQuestions ?? []).filter(isAdmitted), stateTransitionGaps: (grouped.stateTransitionGaps ?? []).filter((gap) => !gap.requiresProductDecision || isAdmitted(gap)) };
  const groundedContext = admitted.context;
  const userKeys = new Set(groundedContext.facts.filter((fact) => fact.source === SOURCE.USER).map((fact) => fact.key));
  const requirementMetadata = new Map((grouped.requirements ?? []).map((item) => [item.key, item]));
  const requirementDomains = new Map((grouped.requirements ?? []).map((item) => [item.key, item.decisionDomain ?? null]));
  let requirements = uniqueByKey(grouped.requirements)
    .filter((item) => item?.key && !userKeys.has(item.key))
    .map((item) => ({ key: item.key, value: String(item.value), reason: item.reason || "MVPとしてAIが合理的に補完" }));
  for (const item of requirements) {
    const metadata = requirementMetadata.get(item.key) ?? {};
    item.decisionDomain = requirementDomains.get(item.key) ?? null;
    item.uniquelyDerived = metadata.uniquelyDerived ?? true;
    item.hasMultipleReasonableImplementations = metadata.hasMultipleReasonableImplementations ?? false;
    item.necessity = metadata.necessity ?? null;
    item.eligibility = metadata.eligibility ?? null;
    item.sourceDecisionIds = inferenceSourceDecisionIds(withInvariants, { ...item, eligibility: item.eligibility });
    item.sourceInitialInputSpan = item.eligibility?.sourceInitialInputSpan ?? null;
    item.derivationDepth = item.eligibility?.derivationDepth ?? null;
    item.provenanceReason = metadata.provenanceReason ?? item.reason;
  }
  const optionalRequirements = requirements.filter((item) => explicitlyOptionalFor(withInvariants, item));
  const invariantRequirement = (item) => invariantDomains(withInvariants).has(canonicalDecisionDomain(item.decisionDomain, item.key));
  const uncertainRequirements = requirements.filter((item) => !optionalRequirements.includes(item) && !invariantRequirement(item) && !mayBecomeMandatoryInferred(withInvariants, item));
  requirements = requirements.filter((item) => !invariantRequirement(item) && mayBecomeMandatoryInferred(withInvariants, item));
  const inferredKeys = new Set(requirements.map((item) => item.key));
  const dimensions = withInvariants.dimensions.map((dimension) => {
    const decision = requirements.find((item) => item.key === dimension.id);
    return !decision || dimension.known || dimension.userJudgmentRequired !== false ? dimension : { ...dimension, known: true, value: decision.value };
  });
  const facts = uniqueByKey([...groundedContext.facts, ...requirements.map((item) => ({ ...item, source: SOURCE.AI }))]);
  const inferredProposals = uncertainRequirements.map((item) => ({ key: item.key, title: item.key, description: item.value, recommended: false, reason: item.reason, alternatives: [] }));
  const proposals = uniqueByKey([...inferredProposals, ...grouped.implementationProposals])
    .filter((item) => item?.key && !userKeys.has(item.key) && !inferredKeys.has(item.key));
  const proposalKeys = new Set(proposals.map((item) => item.key));
  const futureOptional = uniqueByKey([...grouped.futureOptional, ...optionalRequirements.map((item) => ({ key: item.key, value: item.value, reason: item.reason }))])
    .filter((item) => item?.key && !userKeys.has(item.key) && !inferredKeys.has(item.key) && !proposalKeys.has(item.key));
  const answeredFollowupDepth = Math.max(-1, ...(withInvariants.history ?? []).filter((entry) => entry.source === SOURCE.USER).map((entry) => entry.questionDepth ?? 0));
  const nextQuestionDepth = Math.max(1, answeredFollowupDepth + 1);
  const settledDomains = new Set([...(withInvariants.answeredDecisionDomains ?? []), ...(withInvariants.inferredDecisionDomains ?? []), ...requirements.map((item) => item.decisionDomain).filter(Boolean), ...invariantDomains(withInvariants)].map((domain) => canonicalDecisionDomain(domain, domain)));
  const rejectedCriticalDomains = (grouped.criticalProductDecisions ?? [])
    .filter((item) => item?.decisionDomain && !criticalDecisionRequiresQuestion(item, withInvariants))
    .map((item) => canonicalDecisionDomain(item.decisionDomain, item.decisionDomain));
  const clarificationDimensions = uniqueByKey(grouped.clarificationQuestions ?? [])
    .filter((item) => {
      const domain = canonicalDecisionDomain(item?.question, item?.id);
      return item?.id && !rejectedCriticalDomains.some((rejected) => semanticDecisionDomainEquivalent(rejected, domain))
        && !withInvariants.dimensions.some((dimension) => dimension.id === item.id) && !(withInvariants.answeredQuestionKeys ?? []).includes(item.id)
        && !settledDomains.has(domain) && !invariantDomains(withInvariants).has(domain) && questionPassesDecisionGate(item.question, nextQuestionDepth);
    })
    .map((item) => {
      const domain = canonicalDecisionDomain(item.question, item.id);
      const question = sanitizeQuestionOptions(item.question, withInvariants);
      if (question.presentationUnsafe) {
        const replacement = completionQuestion(withInvariants, { decisionDomain: domain, reason: item.question?.intent ?? item.label });
        return { ...replacement, id: item.id, questionDepth: nextQuestionDepth };
      }
      return { id: item.id, label: item.label, importance: item.importance, userJudgmentRequired: true, known: false, value: null, questionDepth: nextQuestionDepth, question };
    });
  const stateTransitionGaps = uniqueByKey(grouped.stateTransitionGaps ?? []).filter((gap) => gap?.id);
  const stateGapDimensions = stateTransitionGaps
    .filter((gap) => gap.requiresProductDecision && gap.question && !withInvariants.dimensions.some((dimension) => dimension.id === gap.id) && !(withInvariants.answeredQuestionKeys ?? []).includes(gap.id))
    .filter((gap) => !settledDomains.has(canonicalDecisionDomain(gap.question, gap.id)) && !invariantDomains(withInvariants).has(canonicalDecisionDomain(gap.question, gap.id)) && questionPassesDecisionGate(gap.question, nextQuestionDepth))
    .map((gap) => ({ id: gap.id, label: gap.trigger || gap.id, importance: "high", userJudgmentRequired: true, known: false, value: null, questionDepth: nextQuestionDepth, question: sanitizeQuestionOptions(gap.question, withInvariants) }));
  const next = {
    ...groundedContext, dimensions, facts,
    inferredDecisions: Object.fromEntries(requirements.map((item) => [item.key, clone(item)])),
    inferredDecisionDomains: [...new Set([...(withInvariants.inferredDecisionDomains ?? []), ...requirements.map((item) => canonicalDecisionDomain(item.decisionDomain, item.key)).filter(Boolean)])],
    implementationProposals: proposals, futureOptional, stateTransitionGaps,
    reassessedCriticalProductDecisions: uniqueByKey([...(withInvariants.reassessedCriticalProductDecisions ?? []), ...(grouped.criticalProductDecisions ?? [])]
      .filter((item) => item?.decisionDomain)
      .filter((item) => criticalDecisionRequiresQuestion(item, withInvariants))
      .filter((item) => !isDecisionDomainSettled(withInvariants, item.decisionDomain))
      .map((item) => ({
        ...item,
        key: canonicalDecisionDomain(item.decisionDomain, item.decisionDomain),
        decisionDomain: canonicalDecisionDomain(item.decisionDomain, item.decisionDomain),
        reason: item.reason || "主要なプロダクト上の意思決定が未確定です。",
      }))),
    dimensions: [...dimensions, ...clarificationDimensions, ...stateGapDimensions],
  };
    console.group("[DIAG] reassessed");
  console.log("reassessedCriticalProductDecisions", (next.reassessedCriticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("dimensions", (next.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, title: d.question?.title ?? null, known: d.known, value: d.value })));
  console.log("answeredDecisionDomains", next.answeredDecisionDomains ?? []);
  console.groupEnd();
  return addCompletionQuestion(next);
}

/** Applies one independent coverage audit. Missing product decisions flow
 * through the same inference/question guards as ordinary reassessment. */
export function applyCriticalDecisionCoverageAudit(context, audit) {

  console.group("[DIAG] coverage-audit");
  console.log("criticalProductDecisions", (audit?.criticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("clarificationQuestions", (audit?.clarificationQuestions ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, title: x.question?.title ?? null })));
  console.log("stateTransitionGaps", (audit?.stateTransitionGaps ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, requiresProductDecision: x.requiresProductDecision ?? null })));
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.groupEnd();
  const auditCandidates = [...(audit?.criticalProductDecisions ?? []), ...(audit?.clarificationQuestions ?? []), ...(audit?.stateTransitionGaps ?? []).filter((gap) => gap.requiresProductDecision)];
  const auditAdmission = admitGroundedCandidates(context, auditCandidates, "after_answer");
  const auditDomains = auditAdmission.accepted.map((item) => canonicalDecisionDomain(item?.decisionDomain ?? item?.question?.decisionDomain ?? item?.id, item?.id ?? ""));
  const auditAdmitted = (item) => auditDomains.some((domain) => semanticDecisionDomainEquivalent(domain, canonicalDecisionDomain(item?.decisionDomain ?? item?.question?.decisionDomain ?? item?.id, item?.id ?? "")));
  context = auditAdmission.context;
  const returnedCriticalProductDecisions = (audit?.criticalProductDecisions ?? []).filter(auditAdmitted);
  const rejectedNonCriticalDecisions = returnedCriticalProductDecisions.filter((item) => !criticalDecisionRequiresQuestion(item, context));
  const criticalProductDecisions = returnedCriticalProductDecisions
    .filter((item) => criticalDecisionRequiresQuestion(item, context))
    .filter((item) => !isDecisionDomainSettled(context, item.decisionDomain));
  const criticalDomains = criticalProductDecisions.map((item) => item.decisionDomain);
  const clarificationQuestions = (audit?.clarificationQuestions ?? []).filter(auditAdmitted).filter((item) => {
    const domain = item?.question?.decisionDomain ?? item?.id;
    return !isDecisionDomainSettled(context, domain) && criticalDomains.some((critical) => semanticDecisionDomainEquivalent(critical, domain));
  });
  const stateTransitionGaps = (audit?.stateTransitionGaps ?? []).filter((gap) => !gap?.requiresProductDecision || auditAdmitted(gap)).filter((gap) => {
    const domain = gap?.question?.decisionDomain ?? gap?.id;
    return !gap?.requiresProductDecision || !isDecisionDomainSettled(context, domain);
  });
  const result = recordInference(context, {
    aiInferredRequirements: audit?.aiInferredRequirements ?? [],
    implementationProposals: audit?.implementationProposals ?? [],
    futureOptional: [],
    clarificationQuestions,
    stateTransitionGaps,
    criticalProductDecisions,
  });
  const discoveredCritical = criticalProductDecisions.length > 0;
  const discoveredStateGap = stateTransitionGaps.some((gap) => gap?.requiresProductDecision);
  const audited = {
    ...result,
    criticalDecisionCoverageAudit: {
      fingerprint: criticalDecisionCoverageFingerprint(result),
      complete: !discoveredCritical && !discoveredStateGap,
      summary: audit?.coverageSummary ?? "",
      auditedDecisionDomains: audit?.auditedDecisionDomains ?? [],
      discoveredDecisionDomains: criticalProductDecisions.map((item) => canonicalDecisionDomain(item.decisionDomain, item.decisionDomain)),
      nonBlockingDecisionDomains: rejectedNonCriticalDecisions.map((item) => canonicalDecisionDomain(item.decisionDomain, item.decisionDomain)),
    },
  };
  return addCompletionQuestion({ ...audited, completionGate: completionGate(audited) });
}

export function hasUnresolvedStateTransitionGaps(context) {
  return (context.stateTransitionGaps ?? []).some((gap) => gap.requiresProductDecision && context.answers?.[gap.id] === undefined);
}

export function majorDecisions(context) { return context.facts.filter((fact) => fact.key !== "idea" && fact.source !== SOURCE.INITIAL); }

const section = (name, content) => `## ${name}\n\n${content?.trim() || "- 未決定"}`;
const rows = (items, formatter) => items.length ? items.map(formatter).join("\n") : "- なし";
const factRows = (facts) => rows(facts, (fact) => `- **${fact.key}**: ${String(fact.value)}${fact.reason ? `（${fact.reason}）` : ""}`);

/**
 * Internal representations may intentionally overlap.  The public SPEC model
 * is resolved here using one stable precedence order, rather than rejecting
 * that useful provenance information as an error.
 */
const semanticAliases = Object.freeze({
  photo: "image", image: "image", "画像": "image", "写真": "image",
  dish: "item", meal: "item", food: "item", item: "item", "料理": "item", "食材": "item",
  detection: "identify", detect: "identify", recognition: "identify", extraction: "identify", extract: "identify", mapping: "identify", map: "identify", "検出": "identify", "抽出": "identify", "認識": "identify", "対応付け": "identify",
});
const meaningfulTokens = (item) => String([item?.key, item?.value, item?.reason, item?.title, item?.description].filter(Boolean).join(" "))
  .replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  .split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/).map((token) => semanticAliases[token] ?? token).filter((token) => token.length > 2 && !["requirement", "requirements", "basic", "system", "user", "管理", "機能"].includes(token));

function semanticConcept(item) {
  const text = meaningfulTokens(item).join(" ");
  if (/(account|アカウント|プロフィール).*(parent|child|親|子|link|連携)|(parent|child|親|子).*(account|アカウント|プロフィール)/.test(text)) return "account_relationship";
  if (/(history|履歴).*(category|カテゴリ|filter|フィルタ)|(category|カテゴリ|filter|フィルタ).*(history|履歴)/.test(text)) return "categorized_history";
  if (/(edit|編集).*(proposal|提案|approval|承認)|(proposal|提案|approval|承認).*(edit|編集)/.test(text)) return "approval_edit_proposal";
  return null;
}

function semanticallySame(left, right) {
  if (left?.decisionDomain && left.decisionDomain === right?.decisionDomain) return true;
  const leftConcept = semanticConcept(left); const rightConcept = semanticConcept(right);
  if (leftConcept && leftConcept === rightConcept) return true;
  const leftTokens = new Set(meaningfulTokens(left)); const rightTokens = new Set(meaningfulTokens(right));
  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common += 1;
  return common >= 2 && common / Math.min(leftTokens.size || 1, rightTokens.size || 1) >= 0.5;
}

function deduplicateSemantic(items, claimed = []) {
  const kept = []; const duplicates = [];
  for (const item of items) {
    if (claimed.some((other) => semanticallySame(item, other)) || kept.some((other) => semanticallySame(item, other))) duplicates.push(item);
    else kept.push(item);
  }
  return { kept, duplicates };
}

function confirmedThresholdOperator(context) {
  const text = context.facts.filter((fact) => fact.source === SOURCE.USER).map((fact) => String(fact.value)).join("\n");
  if (!/(?:quantity|inventory|stock|在庫量|数量).{0,80}(?:threshold|閾値)|(?:threshold|閾値).{0,80}(?:quantity|inventory|stock|在庫量|数量)/i.test(text)) return null;
  if (/(?:<=|以下|less than or equal)/i.test(text)) return "<=";
  if (/(?:\bquantity\s*<\s*threshold\b|未満|less than)/i.test(text)) return "<";
  return null;
}

function normalizeThresholdComparison(context, value) {
  if (confirmedThresholdOperator(context) !== "<=") return String(value ?? "");
  const text = String(value ?? "");
  if (!/(?:quantity|inventory|stock|在庫量|数量).{0,80}(?:threshold|閾値)|(?:threshold|閾値).{0,80}(?:quantity|inventory|stock|在庫量|数量)/i.test(text)) return text;
  return text
    .replace(/(quantity\s*)<(?![=])/gi, "$1<=")
    .replace(/(在庫量|数量)([^\n。]{0,48})(閾値)([^\n。]{0,24})未満/g, "$1$2$3$4以下")
    .replace(/(inventory|stock)([^.\n]{0,48})(threshold)([^.\n]{0,24})\bbelow\b/gi, "$1$2$3$4 at or below");
}

function hasQuantityThresholdBasis(context) {
  const text = context.facts.map((fact) => `${fact.key} ${fact.value}`).join("\n");
  return /(?:quantity|inventory|stock|在庫量|数量).{0,80}(?:min(?:imum)?_?quantity|threshold|閾値|最小数量)|(?:min(?:imum)?_?quantity|threshold|閾値|最小数量).{0,80}(?:quantity|inventory|stock|在庫量|数量)/i.test(text);
}

function isDerivedLowStockFlagProposal(context, item) {
  return hasQuantityThresholdBasis(context) && /(?:low_?stock|is_?low_?stock)\s*[:=]?\s*(?:bool|boolean)/i.test(`${item?.key ?? ""} ${item?.title ?? ""} ${item?.description ?? ""}`);
}

function unconfirmedMinQuantityDefault(context, text) {
  const match = /(?:min_?quantity|minimum_?quantity|最小数量)[^,}\n]{0,72}(?:(?:default|既定値|デフォルト)\s*(?:=|:|is)?\s*|=\s*)\d+/i.exec(String(text ?? ""));
  return Boolean(match) && !sourceProvesNumber(context, match[0].match(/\d+/)?.[0] ?? "", String(text), match.index);
}

function removeDerivedLowStockFields(context, text) {
  if (!hasQuantityThresholdBasis(context)) return String(text ?? "");
  return String(text ?? "")
    .replace(/\s*,?\s*(?:low_?stock|is_?low_?stock)\s*:\s*(?:bool|boolean)\s*/gi, "")
    .replace(/\{\s*,/g, "{").replace(/,\s*}/g, " }");
}

export function canonicalizeContext(context) {
  const coreInvariants = deriveCoreInvariants(context);
  const claimed = new Set();
  const select = (items) => items.filter((item) => {
    if (!item?.key || claimed.has(item.key)) return false;
    claimed.add(item.key); return true;
  });
  const userConfirmed = select(context.facts.filter((fact) => fact.source === SOURCE.USER));
  const normalizedInferredFacts = context.facts.filter((fact) => fact.source === SOURCE.AI)
    .map((fact) => ({ ...fact, value: normalizeThresholdComparison(context, fact.value), reason: normalizeThresholdComparison(context, fact.reason) }));
  const ungroundedConceptInferences = normalizedInferredFacts.filter((fact) => introducesUngroundedProductConcept(context, fact));
  const ungroundedConceptResult = deduplicateSemantic(ungroundedConceptInferences);
  const inferredResult = deduplicateSemantic(select(normalizedInferredFacts.filter((fact) => !ungroundedConceptInferences.includes(fact))), userConfirmed);
  const aiInferredRequirements = inferredResult.kept;
  const removedDerivedFlags = (context.implementationProposals ?? []).filter((item) => isDerivedLowStockFlagProposal(context, item));
  const conflictingScopeProposals = (context.implementationProposals ?? []).filter((item) => proposalConflictsWithConfirmedScope(context, item));
  const implementationProposals = select([
    ...ungroundedConceptResult.kept.map((item) => ({ key: item.key, title: item.key, description: item.value, reason: item.provenanceReason ?? item.reason ?? "導出元のない新しいプロダクト概念のため、MVP必須にはしない。", recommended: false, alternatives: [] })),
    ...(context.implementationProposals ?? []).filter((item) => !isDerivedLowStockFlagProposal(context, item) && !conflictingScopeProposals.includes(item)),
  ]);
  const futureOptional = select(context.futureOptional ?? []);
  const warnings = [];
  const internalGroups = [
    context.facts.filter((fact) => fact.source === SOURCE.USER), context.facts.filter((fact) => fact.source === SOURCE.AI),
    context.implementationProposals ?? [], context.futureOptional ?? [],
  ];
  const allKeys = internalGroups.flat().map((item) => item.key).filter(Boolean);
  if (new Set(allKeys).size !== allKeys.length) warnings.push({ section: "classification", severity: "warning", message: "重複した内部情報は優先順位に従って自動整理しました。", suggestedFix: "User Confirmedを優先して最終SPECへ出力します。" });
  if ((context.implementationProposals ?? []).filter((item) => item.recommended).length > 1) warnings.push({ section: "Implementation Proposal", severity: "warning", message: "複数の推奨候補を一つの推奨として自動整理しました。", suggestedFix: "最初の推奨候補だけを最終SPECへ表示します。" });
  if (inferredResult.duplicates.length) warnings.push({ section: "AI-Inferred Requirements", severity: "warning", message: "意味的に重複するAI推論要件を一つに統合しました。", suggestedFix: "最終SPECには独立した要件だけを表示します。" });
  if (ungroundedConceptInferences.length) warnings.push({ section: "AI-Inferred Requirements", severity: "warning", message: "出所を追跡できない新しいプロダクト概念をImplementation Proposalへ移しました。", suggestedFix: "明示的な決定またはPrimary Flowの根拠が得られるまで、MVP必須にはしません。" });
  if (removedDerivedFlags.length) warnings.push({ section: "Implementation Proposal", severity: "warning", message: "Derived low-stock flags were removed from the implementation proposal.", suggestedFix: "Derive low-stock state from quantity and min_quantity/threshold instead of persisting it." });
  if (conflictingScopeProposals.length) warnings.push({ section: "Implementation Proposal", severity: "warning", message: "User Confirmed Decisionより適用範囲を狭める実装提案を削除しました。", suggestedFix: "確定済みの対象範囲をすべての重複判定へ適用します。" });
  return { ...context, coreInvariants, userConfirmed, aiInferredRequirements, implementationProposals, futureOptional, normalizationWarnings: warnings };
}

const protectedSpecSections = ["mvpScope", "functionalRequirements", "implementationRules", "acceptanceCriteria", "errorHandling"];
const explicitFacts = (context) => context.facts.filter((fact) => fact.source === SOURCE.USER || fact.source === SOURCE.INITIAL);
// Analysis knownFacts are AI interpretations tagged as INITIAL for category
// rendering compatibility. They must not establish a storage/network boundary;
// only the raw idea and explicit user answers can do that.
const explicitSourceText = (context) => JSON.stringify({ idea: context.idea, userConfirmed: context.facts.filter((fact) => fact.source === SOURCE.USER) }).toLowerCase();
// "ローカルユーザーデータへ反映"というAIの実装表現は、ネットワークを使わないという
// ユーザー制約ではない。保存・処理の境界は初期入力またはユーザー確定事項だけから決める。
const localOnly = (context) => /\blocal[ -]?(?:only|storage|device)\b|\boffline\b|端末(?:内|単独(?:利用)?|のみ)|ローカル(?:端末|デバイス)?(?:内|のみ|保存|処理)|オフライン/i.test(explicitSourceText(context));
const deviceOnlyProcessing = (context) => /photo_processing_privacy_and_storage|端末内|on[- ]device|device[- ]local/i.test(JSON.stringify(context.facts.filter((fact) => fact.source === SOURCE.USER)));
const cloudDependent = (item) => /cloud|クラウド|external\s*ai|外部AI|remote\s*api/i.test(`${item?.key ?? ""} ${item?.value ?? ""} ${item?.title ?? ""} ${item?.description ?? ""} ${item?.reason ?? ""}`);

function dataBoundary(context) {
  if (!localOnly(context)) return { mode: "unspecified", source: "not_confirmed", instruction: "Storage and network topology are not confirmed; do not imply synchronization unless it is explicitly required." };
  return {
    mode: "local_only",
    source: explicitFacts(context).some((fact) => fact.source === SOURCE.USER) ? "user_confirmed" : "initial_input",
    instruction: "Use only local/on-device data for this MVP. This means screens reflect the same local data immediately; it does not imply cloud, server, multi-device, or network synchronization.",
  };
}

// Validators must inspect asserted MVP behavior, not words that appear only in
// an explicit exclusion such as "除外: クラウド同期" or "通知は行わない".
// Keeping this scope-aware projection in one place prevents every feature
// validator from independently mistaking a negative statement for a mandate.
const exclusionMarker = /(?:除外|対象外|実装外|将来候補|MVP(?:必須)?(?:の)?(?:範囲)?外|future\s*\/\s*optional)\s*[:：]?|(?:含めない|含まれない|含まない)|(?:不要|なし|無し|無い)(?:で(?:ある)?|とする|ものとする)?|(?:行わない|実施しない|使用しない|存在しない)|\b(?:not\s+(?:included|required|used|supported)|without)\b/i;

function assertedRequirementText(value) {
  return String(value ?? "")
    .split(/(?<=[。.!?！？])|[\n；;]/)
    .flatMap((sentence) => sentence.split(/(?:除外|対象外|実装外|将来候補|MVP(?:必須)?(?:の)?(?:範囲)?外|future\s*\/\s*optional)\s*[:：]/i).slice(0, 1))
    .map((sentence) => sentence.replace(/[（(][^（）()]*?(?:不要|なし|無し|無い|行わない|実施しない|使用しない|存在しない|not\s+(?:included|required|used|supported)|without)[^（）()]*?[）)]/gi, ""))
    .filter((sentence) => !exclusionMarker.test(sentence))
    .join("\n");
}

function hasAffirmativeNetworkSync(value) {
  return /(?:real[ -]?time\s+)?(?:sync|synchronization)|(?:リアルタイム)?同期/i.test(assertedRequirementText(value));
}

function normalizeLocalOnlySyncText(value) {
  return String(value ?? "").split(/(?<=[。.!?！？])|(?=\n)/).map((sentence) => {
    if (exclusionMarker.test(sentence)) return sentence;
    return sentence.replace(/(?:real[ -]?time\s+)?(?:sync|synchronization)|(?:リアルタイム)?同期(?:される)?/gi, "同一ローカルデータを参照する画面へ即時反映");
  }).join("");
}

function repairConstraintFor(issue) {
  const message = issue?.message ?? "";
  if (/比較条件/.test(message)) return { code: "confirmed_business_rule_operator", instruction: "Copy every User Confirmed business-rule comparison operator and condition unchanged across all generated SPEC sections." };
  if (/主要状態遷移|直前の状態/.test(message)) return { code: "complete_primary_state_transition", instruction: "For each major flow transition, define trigger, before/after state, persisted data change, and the next automatic evaluation. Do not allow completion to recreate the previous state immediately." };
  if (/具体値・閾値/.test(message)) return { code: "no_unconfirmed_concrete_values", instruction: "Required sections must express any unconfirmed threshold, duration, retry count, amount, or numeric limit qualitatively, or leave it as an Implementation Proposal." };
  if (/ネットワーク同期/.test(message)) return { code: "local_data_is_not_network_sync", instruction: "The confirmed local-only boundary forbids cloud, server, multi-device, and network synchronization. Describe immediate reflection of the same local data instead." };
  if (/クラウド依存/.test(message)) return { code: "on_device_processing_only", instruction: "The confirmed on-device processing constraint forbids cloud AI, remote APIs, and cloud storage in required MVP behavior." };
  if (/根拠のない新しいプロダクト概念/.test(message)) return { code: "no_ungrounded_product_concepts", instruction: "Do not generate a completion, archive, deletion, status, approval, history, notification, loan, return, or disposal concept unless it is present in Canonical Requirements with traceable provenance." };
  if (/確定済みの具体値|プレースホルダー表現/.test(message)) return { code: "preserve_confirmed_concrete_values", instruction: "Copy every confirmed numeric value together with its unit exactly into every related SPEC section. Never replace a confirmed value with a placeholder or qualitative wording." };
  if (/確定済みの適用範囲/.test(message)) return { code: "preserve_confirmed_scope", instruction: "Apply the full scope and quantifier of each User Confirmed Decision consistently. A rule that applies regardless of same or different grouping must never be narrowed to the same group only." };
  if (/未確定の.+MVP必須|実装提案が必須|Implementation Proposalが必須|Future \/ Optional.+必須/.test(message)) return { code: "no_nonmandatory_promotion", instruction: "Never expand an Implementation Proposal, Future Optional item, or non-unique inference into MVP Scope, Functional Requirements, Data Model, State Transitions, Implementation Rules, Error Handling, or Acceptance Criteria." };
  return null;
}

const uniqueConstraints = (constraints) => [...new Map(constraints.filter(Boolean).map((constraint) => [constraint.code, constraint])).values()];

const numericToken = /(?:\+\/?-?)?\s*\d+(?:\.\d+)?\s*(?:seconds?|minutes?|hours?|days?|times?|attempts?|items?|records?|回|秒|分|時間|日|桁|円|件|個|枚)?/gi;
const numericUnits = /(?:seconds?|minutes?|hours?|days?|times?|attempts?|items?|records?|回|秒|分|時間|日|桁|円|件|個|枚)$/i;
const sourceFactsForNumbers = (context) => context.facts.filter((fact) => fact.source === SOURCE.USER || fact.source === SOURCE.INITIAL || (fact.source === SOURCE.AI && fact.uniquelyDerived !== false && !fact.hasMultipleReasonableImplementations));

function normalizedNumericClaim(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "")
    .replace(/hours?$/, "時間").replace(/minutes?$/, "分").replace(/seconds?$/, "秒").replace(/days?$/, "日")
    .replace(/(?:times?|attempts?)$/, "回").replace(/items?$/, "個").replace(/records?$/, "件");
}

function numericClaimsIn(value) {
  return [...String(value ?? "").matchAll(new RegExp(numericToken.source, numericToken.flags))]
    .map((match) => normalizedNumericClaim(match[0])).filter(Boolean);
}

function surroundingText(text, start, width = 44) { return String(text).slice(Math.max(0, start - width), start + width).toLowerCase(); }
function isRequirementIdentifier(text, start) { return /(?:^|[^a-z0-9_])(?:fr|ir|ac|uc|req|dm|st|er)[_-]?$/i.test(String(text).slice(Math.max(0, start - 12), start)); }
function isDataTypeNumber(text, start) { return /(?:int|uint|float|decimal|varchar|char|uuid|v)$/i.test(String(text).slice(Math.max(0, start - 12), start)); }
function isLogicalCardinality(text, start) {
  const before = String(text).slice(Math.max(0, start - 32), start);
  const after = String(text).slice(start, start + 64);
  return /^\s*\d+\s*(?:画像|写真|image|record|レコード|item|アイテム).{0,18}(?:につき|ごと|per).{0,18}\d+\s*(?:画像|写真|image|record|レコード|item|アイテム)/i.test(after)
    || /(?:画像|写真|image|record|レコード|item|アイテム).{0,18}(?:につき|ごと|per)\s*$/i.test(before) && /^\s*\d+\s*(?:画像|写真|image|record|レコード|item|アイテム)/i.test(after)
    || /(?:同一|same).{0,24}$/i.test(before) && /^\s*\d+\s*(?:件|個|items?|records?).{0,16}(?:のみ|だけ|only|unique)/i.test(after);
}
function sourceProvesNumber(context, value, text, start) {
  const number = String(value).match(/\d+(?:\.\d+)?/)?.[0];
  if (!number) return false;
  const targetClaim = normalizedNumericClaim(value);
  // A confirmed number and unit are immutable even when the generated
  // sentence uses different surrounding words. This is the primary guard for
  // values such as "1時間単位" expanding into another SPEC section.
  if (sourceFactsForNumbers(context).some((fact) => numericClaimsIn(`${fact.key} ${fact.value}`).includes(targetClaim))) return true;
  const aroundTokens = new Set(surroundingText(text, start).split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/).filter((token) => token.length > 2));
  return sourceFactsForNumbers(context).some((fact) => {
    const source = `${fact.key} ${fact.value}`.toLowerCase();
    const sourceHasNumber = new RegExp(`\\b${number.replace(".", "\\.")}\\b`).test(source) || source.includes(number);
    if (!sourceHasNumber) return false;
    if (source.split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/).some((token) => token.length > 2 && aroundTokens.has(token))) return true;

    // A capacity of one for one resource and one time slot is a confirmed
    // business rule, not an arbitrary AI threshold. Japanese text often has
    // no token boundary around the digit, so retain it when both the source
    // decision and the expansion describe the same capacity rule.
    const capacityRule = /(?:最大|only|のみ|だけ|at\s+most).{0,18}(?:1|one).{0,12}(?:件|予約|reservation)?|(?:1|one).{0,12}(?:件|予約|reservation).{0,18}(?:のみ|だけ|only)/i;
    const timeScope = /(?:時間枠|時間帯|time\s*slot|slot|同じ時間|同一時間)/i;
    return number === "1" && capacityRule.test(source) && capacityRule.test(surroundingText(text, start, 90)) && timeScope.test(source) && timeScope.test(surroundingText(text, start, 90));
  });
}
function numericProvenance(context, text, value, start) {
  const trimmed = String(value).trim(); const around = surroundingText(text, start);
  if (isRequirementIdentifier(text, start)) return "structural_identifier";
  if (isDataTypeNumber(text, start)) return "data_type";
  if (isLogicalCardinality(text, start)) return "logical_cardinality";
  if (sourceProvesNumber(context, trimmed, text, start)) return "source_derived";
  const thresholdContext = /(?:timeout|retry|lock|attempt|max(?:imum)?|minimum|limit|threshold|interval|after|within|タイムアウト|再試行|ロック|上限|下限|閾値|間隔|以内|以上|未満)/i.test(around);
  if (numericUnits.test(trimmed) || thresholdContext) return "ai_arbitrary";
  return "structural_or_descriptive";
}
function arbitraryNumericOccurrences(context, text) {
  const source = String(text ?? ""); const occurrences = [];
  for (const match of source.matchAll(numericToken)) {
    if (numericProvenance(context, source, match[0], match.index) === "ai_arbitrary") occurrences.push({ value: match[0], index: match.index });
  }
  return occurrences;
}

function generalizeUnconfirmedNumbers(context, text) {
  const source = String(text ?? "");
  return source.replace(numericToken, (value, offset) => numericProvenance(context, source, value, offset) === "ai_arbitrary" ? qualitativeNumericValue(value) : value);
}

function qualitativeNumericValue(value) {
  const token = String(value ?? "").trim();
  if (/(?:seconds?|minutes?|hours?|days?|秒|分|時間|日)$/i.test(token)) return "設定で定める時間";
  if (/(?:times?|attempts?|回)$/i.test(token)) return "設定で定める回数";
  if (/(?:円)$/i.test(token)) return "設定で定める金額";
  if (/(?:桁)$/i.test(token)) return "設定で定める桁数";
  if (/(?:items?|records?|件|個|枚)$/i.test(token)) return "仕様で定める件数";
  return "仕様で定める値";
}

function confirmedCrossScopeRules(context) {
  return context.facts.filter((fact) => fact.source === SOURCE.USER).flatMap((fact) => {
    const text = `${fact.key} ${fact.value}`;
    const japanese = /同(?:じ|一)([一-龠ぁ-んァ-ヶーA-Za-z_]{1,16})(?:か|と)別(?:の)?\1(?:か)?を問わず/.exec(text);
    if (japanese) return [{ decisionId: fact.key, entity: japanese[1], value: fact.value }];
    const english = /regardless of (?:the )?(?:same or different|different or same) ([a-z][a-z _-]{1,24})/i.exec(text);
    return english ? [{ decisionId: fact.key, entity: english[1].trim(), value: fact.value }] : [];
  });
}

function narrowsConfirmedCrossScope(text, rule) {
  const source = String(text ?? "");
  const entity = rule.entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sameScope = new RegExp(`(?:同じ|同一)${entity}(?:内)?(?:だけ|のみ)?|same\\s+${entity}(?:\\s+only)?`, "i").test(source);
  const keepsCrossScope = new RegExp(`別(?:の)?${entity}|${entity}(?:を)?(?:またいで|問わず)|different\\s+${entity}|regardless`, "i").test(source);
  return sameScope && !keepsCrossScope;
}

function proposalConflictsWithConfirmedScope(context, item) {
  const text = `${item?.key ?? ""} ${item?.title ?? ""} ${item?.description ?? ""} ${item?.reason ?? ""}`;
  return confirmedCrossScopeRules(context).some((rule) => narrowsConfirmedCrossScope(text, rule));
}

function confirmedEditPolicy(context) {
  const text = context.facts.filter((fact) => fact.source === SOURCE.USER && /edit|editable|correction|編集|変更|修正/i.test(`${fact.key} ${fact.value}`)).map((fact) => `${fact.key} ${fact.value}`).join("\n");
  const mustVisitEditor = /(?:保存前|before saving).{0,24}(?:編集画面|editor|edit).{0,24}(?:必ず|must|required)|(?:編集画面|editor|edit).{0,24}(?:必ず|must|required).{0,24}(?:保存前|before saving)/i.test(text);
  const nameCanChange = /(?:料理名|name).{0,24}(?:変更可能|編集可能|can change|editable)/i.test(text);
  const changeOptional = /(?:変更|change|編集).{0,24}(?:必須ではない|必須としない|任意|不要|not required|optional)/i.test(text);
  return mustVisitEditor && nameCanChange && changeOptional ? "保存前に編集画面を必ず経由する。料理名は変更可能だが、変更自体は必須としない。" : null;
}

function balancedDataModel(text) {
  const closeFor = { "{": "}", "[": "]", "(": ")" }; const stack = [];
  for (const character of String(text ?? "")) {
    if (closeFor[character]) stack.push(closeFor[character]);
    else if (["}", "]", ")"].includes(character) && stack.pop() !== character) return false;
  }
  return stack.length === 0;
}

function looksTruncatedRequirementText(text) {
  const value = String(text ?? "").trim();
  if (!value || /[。！？.!?）)}\]】]$/.test(value)) return false;
  // Complete English labels are often intentionally written without a period.
  // Flag only a likely field-limit cutoff or an incomplete terminal stem.
  return value.length >= 120 || /(?:最|基|addedToPl)$/i.test(value);
}

/** The only source used to generate every final SPEC section. */
export function buildCanonicalRequirements(context) {
  const model = canonicalizeContext(context);
  const uniquelyDerived = model.aiInferredRequirements.filter((item) => mayBecomeMandatoryInferred(context, item));
  const primaryFlowInputs = [
    ...model.userConfirmed.map((item) => ({ key: item.key, value: item.value, origin: SOURCE.USER })),
    ...uniquelyDerived.map((item) => ({ key: item.key, value: item.value, origin: SOURCE.AI })),
  ];
  return {
    version: "v4.1",
    idea: context.idea,
    coreUserValue: { value: context.analysis?.purpose ?? context.idea, origin: SOURCE.INITIAL },
    coreInvariants: model.coreInvariants.map((item) => ({ id: item.id, decisionDomain: item.decisionDomain, value: item.value, origin: item.origin })),
    primaryFlowInputs,
    userConfirmedDecisions: model.userConfirmed.map((item) => ({ key: item.key, value: item.value, origin: SOURCE.USER })),
    uniquelyDerivedAiRequirements: uniquelyDerived.map((item) => ({
      key: item.key, value: item.value, reason: item.reason, provenanceReason: item.provenanceReason,
      sourceDecisionIds: item.sourceDecisionIds ?? [], sourceInitialInputSpan: item.sourceInitialInputSpan ?? null,
      derivationDepth: item.derivationDepth ?? item.eligibility?.derivationDepth ?? null, origin: SOURCE.AI,
    })),
    implementationProposals: model.implementationProposals.map((item) => ({ key: item.key, description: item.description, reason: item.reason })),
    futureOptional: model.futureOptional.map((item) => ({ key: item.key, value: item.value, reason: item.reason })),
    stateTransitionGaps: (model.stateTransitionGaps ?? []).map((gap) => ({
      id: gap.id, trigger: gap.trigger, stateBefore: gap.stateBefore, stateAfter: gap.stateAfter,
      persistedDataChange: gap.persistedDataChange, nextAutomaticRuleEvaluation: gap.nextAutomaticRuleEvaluation,
      uniquelyResolvable: gap.uniquelyResolvable, requiresProductDecision: gap.requiresProductDecision,
    })),
    dataBoundary: dataBoundary(context),
    generationConstraints: uniqueConstraints([...(context.generationConstraints ?? []), localOnly(context) ? { code: "local_data_boundary", instruction: dataBoundary(context).instruction } : null]),
  };
}

/** Creates the only context shape that may enter final SPEC generation. */
export function prepareCanonicalContext(context) {
  const normalized = canonicalizeContext(context);
  return { ...normalized, canonicalRequirements: buildCanonicalRequirements(normalized) };
}

function appendUniqueLine(text, line) {
  const source = String(text ?? "").trim();
  return source.includes(line) ? source : [source, line].filter(Boolean).join("\n");
}

/**
 * Expands reservation invariants from Canonical Requirements. This is not a
 * product-specific patch: every reservation flow has the same integrity
 * boundary, regardless of whether the resource is a staff member, room, seat,
 * vehicle, or any other bookable resource.
 */
function expandReservationInvariants(context, spec, issues) {
  const errorMessages = errorIssues(issues).map((issue) => issue.message).join("\n");
  if (!/予約(?:のコア不変条件|確定時の競合再確認)/.test(errorMessages)) return { spec, actions: [] };
  const repaired = { ...spec };
  const actions = [];
  if (/二重確定防止/.test(errorMessages)) {
    repaired.functionalRequirements = appendUniqueLine(repaired.functionalRequirements, "予約を確定する際、同一の予約資源・時間枠には最大1件の確定予約のみを許可する。");
    repaired.acceptanceCriteria = appendUniqueLine(repaired.acceptanceCriteria, "同一の予約資源・時間枠で重複する予約を同時に確定できない。");
    actions.push("canonical_reservation_exclusivity_expansion");
  }
  if (/競合再確認/.test(errorMessages)) {
    repaired.stateTransitions = appendUniqueLine(repaired.stateTransitions, "「確定する」操作時、予約を保存する直前に対象の予約資源・時間枠の競合を再確認し、競合時は予約を確定しない。");
    repaired.errorHandling = appendUniqueLine(repaired.errorHandling, "予約確定直前に競合が見つかった場合は保存せず、利用者に空き状況の再確認を案内する。");
    actions.push("canonical_reservation_conflict_recheck_expansion");
  }
  return { spec: repaired, actions };
}

function removeUngroundedConcepts(spec, issues) {
  const concepts = issues
    .filter((issue) => issue.ruleId === "ungrounded_product_concept")
    .map((issue) => /概念「([^」]+)」/.exec(String(issue.message ?? ""))?.[1])
    .filter(Boolean);
  if (!concepts.length) return { spec, actions: [] };
  const repaired = { ...spec };
  for (const key of Object.keys(repaired)) {
    let text = String(repaired[key] ?? "");
    for (const concept of concepts) {
      const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text
        .replace(new RegExp(`(?:[・/／、]|および|または)?${escaped}(?:操作)?`, "gi"), "")
        .replace(/[・/／、]{2,}/g, "・")
        .replace(/([（(])\s*[）)]/g, "")
        .replace(/\s{2,}/g, " ");
    }
    repaired[key] = text;
  }
  return { spec: repaired, actions: concepts.map((concept) => `remove_ungrounded_concept:${concept}`) };
}

/** Applies the immutable-source precedence before asking the provider to regenerate a failed SPEC. */
export function repairConsistency(context, spec, issues = []) {
  const confirmed = context.facts.filter((fact) => fact.source === SOURCE.USER);
  const deviceOnly = deviceOnlyProcessing(context);
  const canonical = canonicalizeContext(context);
  const keepFact = (fact) => fact.source !== SOURCE.AI || !deviceOnly || !cloudDependent(fact);
  const preservedFacts = context.facts.filter((fact) => fact.source !== SOURCE.AI && fact.source !== SOURCE.USER);
  const facts = [...preservedFacts, ...canonical.userConfirmed, ...canonical.aiInferredRequirements].filter(keepFact);
  const inferredDecisions = Object.fromEntries(Object.entries(context.inferredDecisions ?? {}).filter(([, item]) => !deviceOnly || !cloudDependent(item)));
  const nonMandatoryLeakIds = new Set(issues.flatMap((issue) => issue.offendingRequirementIds ?? []));
  const implementationProposals = (context.implementationProposals ?? []).filter((item) => (!deviceOnly || !cloudDependent(item)) && !nonMandatoryLeakIds.has(item.key));
  const futureOptional = (context.futureOptional ?? []).filter((item) => (!deviceOnly || !cloudDependent(item)) && !nonMandatoryLeakIds.has(item.key));
  const invariantExpansion = expandReservationInvariants(context, spec, issues);
  const ungroundedRepair = removeUngroundedConcepts(invariantExpansion.spec, issues);
  const repairedSpec = { ...ungroundedRepair.spec };
  for (const key of Object.keys(repairedSpec)) {
    let text = String(repairedSpec[key] ?? "");
    text = generalizeUnconfirmedNumbers(context, text);
    if (deviceOnly) text = text.replace(/cloud\s*(?:ai|storage|processing)?|external\s*ai|remote\s*api|クラウド(?:AI|保存|処理)?|外部AI/gi, "on-device processing");
    repairedSpec[key] = text;
  }
  const repairDirectives = [
    "Preserve every User Confirmed Decision exactly.",
    "Preserve the Core User Value and Primary User Flow before AI-derived details.",
    "Remove or generalize lower-priority AI-derived content that conflicts with confirmed decisions.",
    "Move non-unique numeric, technical, threshold, or provider choices to Implementation Proposal or mark them undecided.",
    ...issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
  ];
  if (deviceOnly) repairDirectives.push("The confirmed photo processing and storage constraint is on-device only. Remove cloud AI, remote API, and cloud storage from MVP requirements and proposals.");
  const generationConstraints = uniqueConstraints([...(context.generationConstraints ?? []), ...issues.map(repairConstraintFor)]);
  const repairedContext = { ...context, facts, inferredDecisions, implementationProposals, futureOptional, generationConstraints };
  const preparedContext = prepareCanonicalContext(repairedContext);
  const normalizedSpec = canonicalizeSpec(preparedContext, repairedSpec);
  const canonicalChanged = JSON.stringify(context.canonicalRequirements ?? buildCanonicalRequirements(context)) !== JSON.stringify(preparedContext.canonicalRequirements);
  return {
    context: preparedContext, spec: normalizedSpec, repairDirectives, canonicalChanged,
    repairActions: [...invariantExpansion.actions, ...ungroundedRepair.actions],
    removedCloudItems: deviceOnly ? context.facts.length - facts.length : 0,
    removedSemanticDuplicates: context.facts.filter((fact) => fact.source === SOURCE.AI).length - canonical.aiInferredRequirements.length,
    confirmed,
  };
}

/** Removes only objectively unsafe wording; remaining provenance violations are blocked and regenerated. */
export function canonicalizeSpec(context, spec) {
  const normalized = { ...spec };
  for (const key of Object.keys(normalized)) normalized[key] = normalizeThresholdComparison(context, normalized[key]);
  if (localOnly(context)) {
    for (const key of Object.keys(normalized)) {
      if (key !== "outOfScope") normalized[key] = normalizeLocalOnlySyncText(normalized[key]);
    }
  }
  for (const key of Object.keys(normalized)) normalized[key] = generalizeUnconfirmedNumbers(context, normalized[key]);
  if (unconfirmedMinQuantityDefault(context, normalized.dataModel)) {
    normalized.dataModel = String(normalized.dataModel ?? "")
      .replace(/(\b(?:min_?quantity|minimum_?quantity)\b\s*:\s*[^,}\n=]+?)\s*(?:=\s*|(?:default|既定値|デフォルト)\s*(?:=|:|is)?\s*)\d+/gi, "$1 | null (unset: excluded from automatic low-stock evaluation)")
      .replace(/((?:最小数量)\s*:\s*[^,}\n=]+?)\s*(?:=\s*|(?:default|既定値|デフォルト)\s*(?:=|:|is)?\s*)\d+/gi, "$1 | null（未設定時は自動低在庫判定の対象外）");
  }
  normalized.dataModel = removeDerivedLowStockFields(context, normalized.dataModel);
  const allowedSource = JSON.stringify({ idea: context.idea, facts: context.facts, analysis: context.analysis }).toLowerCase();
  if (!/email|eメール|メールアドレス/.test(allowedSource)) normalized.dataModel = String(normalized.dataModel ?? "").replace(/\s*,?\s*(?:email|e-mail|メールアドレス)\s*(?::\s*[^,}\n]+)?/gi, "");
  const editPolicy = confirmedEditPolicy(context);
  if (editPolicy) {
    const policySections = ["userFlow", "functionalRequirements", "implementationRules", "acceptanceCriteria"];
    for (const key of policySections) {
      const text = String(normalized[key] ?? "").replace(/(?:料理名(?:の)?変更|name change).{0,20}(?:必須|must|required)/gi, "料理名は変更可能");
      normalized[key] = text.includes(editPolicy) ? text : `${text}\n${editPolicy}`.trim();
    }
  }
  return normalized;
}

export function buildMarkdown(context, spec) {
  const model = canonicalizeContext(context);
  return [
    "# SPEC.md",
    section("Project Overview", spec.projectOverview || context.analysis?.purpose || context.idea),
    section("Core User Value", spec.coreUserValue),
    section("User Confirmed Decisions", factRows(model.userConfirmed)),
    section("AI-Inferred Requirements", factRows(model.aiInferredRequirements)),
    section("MVP Scope", spec.mvpScope),
    section("Future / Optional", rows(model.futureOptional, (item) => `- **${item.key}**: ${item.value}${item.reason ? `（${item.reason}）` : ""}`)),
    section("User Flow", spec.userFlow), section("Screens", spec.screens), section("Functional Requirements", spec.functionalRequirements),
    section("Data Model", spec.dataModel), section("State Transitions", spec.stateTransitions), section("Error Handling", spec.errorHandling),
    section("Implementation Proposal", rows(model.implementationProposals.map((item, index) => ({ ...item, recommended: item.recommended && index === model.implementationProposals.findIndex((proposal) => proposal.recommended) })), (item) => `- **${item.title || item.key}**${item.recommended ? "（推奨）" : ""}: ${item.description}\n  - 理由: ${item.reason}`)),
    section("Implementation Rules", spec.implementationRules), section("Acceptance Criteria", spec.acceptanceCriteria),
  ].join("\n\n");
}

function thresholdComparisonMismatch(context, text) {
  const operator = confirmedThresholdOperator(context);
  if (!operator) return false;
  const value = String(text ?? "");
  const ruleMentioned = /(?:quantity|inventory|stock|在庫量|数量).{0,80}(?:threshold|閾値)|(?:threshold|閾値).{0,80}(?:quantity|inventory|stock|在庫量|数量)/i.test(value);
  if (!ruleMentioned) return false;
  return operator === "<="
    ? /(?:quantity\s*<(?![=])\s*threshold|(?:在庫量|数量)[^\n。]{0,48}(?:閾値)[^\n。]{0,24}未満|(?:inventory|stock)[^.\n]{0,48}threshold[^.\n]{0,24}\bbelow\b)/i.test(value)
    : /(?:quantity\s*<=\s*threshold|(?:在庫量|数量)[^\n。]{0,48}(?:閾値)[^\n。]{0,24}以下|(?:inventory|stock)[^.\n]{0,48}threshold[^.\n]{0,24}(?:at or below|less than or equal))/i.test(value);
}

function confirmedEntryIncludesExpiry(context) {
  return context.facts.some((fact) => fact.source === SOURCE.USER && /(?:item.*entry|entry.*method|入力|登録)/i.test(fact.key) && /(?:expiry|期限)/i.test(String(fact.value)));
}

function inferredExpiryOptional(model) {
  return model.aiInferredRequirements.some((item) => /(?:expiry|期限)/i.test(`${item.key} ${item.value}`) && /(?:optional|任意)/i.test(String(item.value)) && String(item.reason ?? "").trim());
}

function hasPurchaseCompletionTransitionGap(context, spec) {
  const confirmedRule = confirmedThresholdOperator(context);
  if (!confirmedRule) return false;
  const text = Object.values(spec).join("\n");
  if (!/(?:purchase complete|mark(?:ed)? as purchased|購入完了)/i.test(text)) return false;
  // Any of these makes the post-completion state explicit: update inventory,
  // intentionally suppress repeat evaluation, or make replenishment a separate action.
  const resolvesInventory = /(?:purchase(?:d)?\s+quantity|購入数量).{0,80}(?:update|reflect|increase|更新|反映|加算)|(?:quantity|在庫量|数量).{0,80}(?:update|reflect|increase|更新|反映|加算)|(?:suppress|prevent).{0,80}(?:re-?add|再追加)|(?:re-?add|再追加).{0,80}(?:suppress|prevent|抑制)|(?:separate|別)(?:\s+action|操作).{0,80}(?:replenish|補充|inventory|在庫)/i.test(text);
  return !resolvesInventory;
}

function dataModelFieldNames(dataModel) {
  const fields = new Set();
  for (const match of String(dataModel ?? "").matchAll(/(?:^|[,{\n]\s*)([a-zA-Z_][\w]*|状態|フラグ)\s*(?:\([^)]*\))?\s*:/g)) fields.add(match[1].toLowerCase());
  return fields;
}

function transitionFieldReferences(stateTransitions) {
  const fields = new Set();
  const source = String(stateTransitions ?? "");
  for (const match of source.matchAll(/\b(status|state|flag|low_?stock|is_?completed|completed|状態|フラグ)\s*(?:=|:|is|を)\s*(?:true|false|[a-z_]+|完了|未完了)/gi)) fields.add(match[1].toLowerCase());
  return fields;
}

function transitionFieldIsDerived(stateTransitions, field) {
  return new RegExp(`${field}[^\\n。]{0,80}(?:derived|calculate|non-persisted|派生|算出|保存しない)|(?:derived|calculate|non-persisted|派生|算出|保存しない)[^\\n。]{0,80}${field}`, "i").test(String(stateTransitions ?? ""));
}

function shoppingCompletionSemantics(spec) {
  const text = `${spec.userFlow ?? ""}\n${spec.functionalRequirements ?? ""}\n${spec.stateTransitions ?? ""}\n${spec.acceptanceCriteria ?? ""}`;
  if (!/(?:shopping\s*list|shoppinglist|買い物リスト)/i.test(text) || !/(?:purchase complete|purchased|購入完了|購入済み)/i.test(text)) return { applies: false };
  const removed = /(?:(?:shopping\s*list|shoppinglist|買い物リスト).{0,48}(?:delete|remove|削除|消去)|(?:delete|remove|削除|消去).{0,48}(?:shopping\s*list|shoppinglist|買い物リスト))/i.test(text);
  const retained = /(?:status|state|completed|完了状態|完了フラグ).{0,36}(?:completed|purchased|完了|購入済み)|(?:completed|purchased|完了|購入済み).{0,36}(?:status|state|状態|flag|フラグ)/i.test(text);
  return { applies: true, removed, retained };
}

function proposalTypedFields(proposals) {
  const fields = new Set();
  for (const proposal of proposals) {
    for (const match of String(`${proposal.key ?? ""} ${proposal.description ?? ""}`).matchAll(/\b([a-zA-Z_][\w]*)\s*:\s*(?:bool|boolean|integer|number|string|date)\b/gi)) fields.add(match[1].toLowerCase());
  }
  return fields;
}

function nonMandatoryFeatureLeak(model, mandatoryText) {
  const candidates = [
    ...model.implementationProposals.map((item) => ({ key: item.key, text: `${item.key ?? ""} ${item.title ?? ""} ${item.description ?? ""}`, category: "Implementation Proposal" })),
    ...model.futureOptional.map((item) => ({ key: item.key, text: `${item.key ?? ""} ${item.value ?? ""}`, category: "Future / Optional" })),
  ];
  const source = String(mandatoryText ?? "").toLowerCase();
  const grounded = JSON.stringify({
    initial: model.idea ?? "",
    confirmed: model.userConfirmed,
    inferred: model.aiInferredRequirements,
  }).toLowerCase();
  return candidates.find((candidate) => meaningfulFeatureTerms(candidate.text)
    .filter((term) => term.length >= 3)
    // A proposal may discuss a confirmed capability without owning it. Only
    // proposal-specific concepts can prove an improper promotion.
    .filter((term) => !grounded.includes(term.toLowerCase()))
    .some((term) => source.includes(term.toLowerCase()))) ?? null;
}

function reservationInvariantMissing(context, spec) {
  if (!deriveCoreInvariants(context).length) return [];
  const requiredText = [spec.mvpScope, spec.functionalRequirements, spec.stateTransitions, spec.acceptanceCriteria].join("\n");
  const issues = [];
  const hasExplicitConflictRule = /(?:double[ -]?book|overlap(?:ping)?\s+(?:reservation|booking)|reservation\s+conflict|二重予約|重複予約|予約(?:枠|時間帯).{0,24}(?:競合|重複|不可)|競合(?:する)?予約)/i.test(requiredText);
  // "Each staff member has at most one confirmed booking in the same slot" is
  // an equivalent, more specific expression of reservation exclusivity.
  const hasScopedCapacityRule = /(?:各|each|同じ|同一).{0,72}(?:時間枠|時間帯|time\s*slot|slot).{0,72}(?:最大|at\s+most|only|のみ|だけ).{0,24}(?:1|one).{0,16}(?:件|予約|reservation)?|(?:最大|at\s+most|only).{0,24}(?:1|one).{0,16}(?:件|予約|reservation).{0,72}(?:各|each|同じ|同一).{0,72}(?:時間枠|時間帯|time\s*slot|slot)/i.test(requiredText);
  if (!hasExplicitConflictRule && !hasScopedCapacityRule) {
    issues.push({ ruleId: "reservation_conflict_consistency", ruleName: "予約競合の一貫性", section: "Core Invariants", severity: "error", message: "予約のコア不変条件である二重確定防止がSPEC必須要件に反映されていません。", suggestedFix: "同一資源・時間枠への重複確定を防止する要件を、主要フローと受入条件へ反映してください。", offendingRequirementIds: ["reservation_exclusivity", "confirmed_slot_unavailable"] });
  }
  const hasConflictRecheck = /(?:re-?check|revalidate|check.{0,48}(?:before|on).{0,48}(?:confirm|create)|(?:確定|作成|保存).{0,48}(?:直前|時|前).{0,48}(?:再確認|競合確認|空き(?:状況|枠)?(?:を)?確認)|(?:競合|空き(?:状況|枠)?).{0,48}(?:再確認|確認).{0,48}(?:確定|作成|保存))/i.test(requiredText);
  if (!hasConflictRecheck) {
    issues.push({ ruleId: "reservation_conflict_recheck", ruleName: "予約確定直前の競合再確認", section: "Core Invariants", severity: "error", message: "予約確定時の競合再確認がSPEC必須要件に反映されていません。", suggestedFix: "予約作成・確定直前に競合状態を再確認する要件を追加してください。", offendingRequirementIds: ["reservation_conflict_recheck"] });
  }
  return issues;
}

function ungroundedProductConceptInSpec(context, spec) {
  const mandatoryText = assertedRequirementText(protectedSpecSections.map((sectionName) => String(spec?.[sectionName] ?? "")).join("\n"));
  const concepts = mandatoryText.match(/(?:完了(?:操作|状態|フラグ)|アーカイブ|削除|ステータス|承認|履歴|通知|貸出|返却|廃棄|消費|\b(?:archive|delete|status|approval|history|notification|loan|return|disposal|consume|consumption)\b)/gi) ?? [];
  if (!concepts.length) return null;
  const canonical = buildCanonicalRequirements(context);
  const allowedSource = JSON.stringify({
    idea: context.idea,
    confirmed: canonical.userConfirmedDecisions,
    primaryFlow: canonical.primaryFlowInputs,
    inferred: canonical.uniquelyDerivedAiRequirements,
    coreValue: canonical.coreUserValue,
  });
  const ungrounded = concepts.find((concept) => !new RegExp(concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(allowedSource));
  return ungrounded ?? null;
}

function confirmedDecisionConflicts(confirmed) {
  const conflicts = [];
  for (let index = 0; index < confirmed.length; index += 1) {
    for (const other of confirmed.slice(index + 1)) {
      const current = confirmed[index];
      if (current.key === other.key && current.value !== other.value) conflicts.push([current, other]);
    }
  }
  // Confirmation timing is a product decision even when different questions
  // supplied the wording. Immediate confirmation and approval-before-
  // confirmation cannot both describe the same reservation flow.
  const immediate = confirmed.filter((fact) => /(?:即時|immediate(?:ly)?|確定する.{0,16}(?:時点|ボタン|押))/i.test(`${fact.key} ${fact.value}`));
  const approval = confirmed.filter((fact) => /(?:承認|approval|pending|確定しない|店舗.{0,12}(?:確認|承認))/i.test(`${fact.key} ${fact.value}`));
  for (const current of immediate) for (const other of approval) if (current.key !== other.key) conflicts.push([current, other]);
  return conflicts;
}

export function validateSpecConsistency(context, spec) {
  const model = canonicalizeContext(context);
  const issues = [...model.normalizationWarnings];
  const confirmed = context.facts.filter((fact) => fact.source === SOURCE.USER);
  const confirmedConflicts = confirmedDecisionConflicts(confirmed);
  if (confirmedConflicts.length) {
    issues.push({ ruleId: "confirmed_decision_conflict", ruleName: "ユーザー確定事項の矛盾", section: "User Confirmed Decisions", severity: "error", message: "ユーザー確定事項に矛盾があります。", suggestedFix: "該当する質問への回答を確認してください。", offendingDecisionIds: [...new Set(confirmedConflicts.flat().map((fact) => fact.key))], requiresUserResolution: true });
  }
  const mvpText = assertedRequirementText([spec.mvpScope, spec.functionalRequirements, spec.acceptanceCriteria].join("\n"));
  const mandatoryText = assertedRequirementText(protectedSpecSections.map((key) => String(spec[key] ?? "")).join("\n"));
  issues.push(...reservationInvariantMissing(context, spec));
  const ungroundedConcept = ungroundedProductConceptInSpec(context, spec);
  if (ungroundedConcept) issues.push({ ruleId: "ungrounded_product_concept", ruleName: "根拠のない新しいプロダクト概念", section: "SPEC expansion", severity: "error", message: `根拠のない新しいプロダクト概念「${ungroundedConcept}」がMVP必須仕様に含まれています。`, suggestedFix: "Canonical Requirementsに根拠がない概念は削除し、必要ならProduct DecisionまたはImplementation Proposalとして扱ってください。" });
  const explicitlyRequired = /(必須|必ず|必要です|must|required)/i.test(mvpText);
  const leakedFuture = model.futureOptional.find((item) => item.value && mvpText.includes(String(item.value)));
  if (explicitlyRequired && leakedFuture) issues.push({ section: "MVP Scope", severity: "error", message: "Future / Optionalの項目がMVP必須要件として扱われています。", suggestedFix: "将来項目をMVP ScopeとAcceptance Criteriaから外してください。" });
  const leakedProposal = model.implementationProposals.find((item) => item.description && mvpText.includes(String(item.description)));
  if (explicitlyRequired && leakedProposal) issues.push({ section: "Implementation Proposal", severity: "error", message: "実装提案が必須要件として扱われています。", suggestedFix: "提案は任意の実装選択肢として記載してください。" });
  const nonMandatoryLeak = nonMandatoryFeatureLeak(model, mandatoryText);
  if (explicitlyRequired && nonMandatoryLeak) issues.push({ section: nonMandatoryLeak.category, severity: "error", message: `未確定の「${nonMandatoryLeak.key}」がMVP必須仕様へ昇格しています。`, suggestedFix: "直接の根拠がない派生機能はFuture / OptionalまたはImplementation Proposalだけに残してください。", offendingRequirementIds: [nonMandatoryLeak.key] });
  const confirmedText = model.userConfirmed.map((item) => String(item.value)).join("\n");
  const finalText = Object.values(spec).join("\n");
  for (const [sectionName, sectionText] of Object.entries(spec)) {
    if (/適切な値|適切な値単位|仕様で定める値単位/.test(String(sectionText ?? ""))) {
      issues.push({ ruleId: "confirmed_value_placeholder", ruleName: "確定値のプレースホルダー化", section: sectionName, severity: "error", message: "確定済みの具体値がプレースホルダー表現へ退化しています。", suggestedFix: "対応するUser Confirmed Decisionの数値と単位をそのまま復元してください。" });
    }
  }
  const finalNumericClaims = new Set(numericClaimsIn(finalText));
  for (const fact of context.facts.filter((item) => item.source === SOURCE.USER)) {
    for (const claim of numericClaimsIn(fact.value)) {
      if (!finalNumericClaims.has(claim)) issues.push({ ruleId: "confirmed_numeric_value_missing", ruleName: "確定済み具体値の欠落", section: "SPEC expansion", severity: "error", message: `User Confirmed Decision「${fact.key}」の確定済み具体値がSPEC本文に反映されていません。`, suggestedFix: "確定済みの数値と単位を関連セクションへそのまま反映してください。", offendingDecisionIds: [fact.key] });
    }
  }
  for (const rule of confirmedCrossScopeRules(context)) {
    for (const [sectionName, sectionText] of Object.entries(spec)) {
      const conflictingSentence = String(sectionText ?? "").split(/[。\n]/).find((sentence) => narrowsConfirmedCrossScope(sentence, rule));
      if (conflictingSentence) issues.push({ ruleId: "confirmed_scope_narrowing", ruleName: "確定済み適用範囲の一貫性", section: sectionName, severity: "error", message: "確定済みの適用範囲が一部セクションで狭められています。", suggestedFix: "同じグループか別グループかを問わない確定ルールを、そのまま全関連セクションへ適用してください。", offendingDecisionIds: [rule.decisionId] });
    }
  }
  const explicitSource = JSON.stringify({ idea: context.idea, confirmed: model.userConfirmed, facts: context.facts.filter((fact) => fact.source === SOURCE.INITIAL) }).toLowerCase();
  for (const proposal of model.implementationProposals) {
    const proposalText = [proposal.title, proposal.description, proposal.reason].filter(Boolean).join(" ");
    if (proposalText && mandatoryText.includes(proposalText)) issues.push({ section: "Implementation Proposal", severity: "error", message: "未確定のImplementation Proposalが必須仕様へ混入しています。", suggestedFix: "提案はImplementation Proposalだけに残し、ユーザー確認後に必須仕様へ反映してください。" });
  }
  for (const requirement of model.aiInferredRequirements) {
    if (looksTruncatedRequirementText(requirement.value) || looksTruncatedRequirementText(requirement.reason)) issues.push({ section: "AI-Inferred Requirements", severity: "error", message: "AI-Inferred Requirementの文章が途中で切れています。", suggestedFix: `「${requirement.key}」を完結した文として再生成してください。` });
  }
  if (thresholdComparisonMismatch(context, `${finalText}\n${model.aiInferredRequirements.map((item) => `${item.key} ${item.value}`).join("\n")}`)) {
    issues.push({ section: "Business rules", severity: "error", message: "User Confirmed Decision の比較条件とSPEC内の比較条件が一致していません。", suggestedFix: "User Confirmed Decision の演算子を全セクションへそのまま反映してください。" });
  }
  const expiryOptional = /(?:expiry[_ ]?date|期限(?:日)?)[^\n,)}]{0,48}(?:optional|任意)|(?:optional|任意)[^\n,)}]{0,48}(?:expiry[_ ]?date|期限(?:日)?)/i.test(String(spec.dataModel ?? ""));
  if (confirmedEntryIncludesExpiry(context) && expiryOptional && !inferredExpiryOptional(model)) {
    issues.push({ section: "Data Model", severity: "error", message: "User Confirmed Decision から導出されない必須/任意属性が確定仕様になっています。", suggestedFix: "任意入力とする根拠をAI-Inferred Requirementとして明示するか、主要UXを変える場合は質問してください。" });
  }
  if (hasUnresolvedStateTransitionGaps(context)) {
    issues.push({ section: "State Transitions", severity: "error", message: "Primary User Flow の主要状態遷移に未解決のProduct Decisionがあります。", suggestedFix: "状態遷移を大きく分岐させる確認事項を回答してからSPECを生成してください。" });
  }
  if (hasPurchaseCompletionTransitionGap(context, spec)) {
    issues.push({ section: "State Transitions", severity: "error", message: "主要操作の完了後に自動条件で直前の状態へ戻る可能性があります。", suggestedFix: "完了操作後の永続データ更新と次回の自動判定を一意に定義してください。" });
  }
  if (unconfirmedMinQuantityDefault(context, spec.dataModel)) {
    issues.push({ section: "Data Model", severity: "error", message: "ユーザー確認のないmin_quantityの既定値が必須仕様になっています。", suggestedFix: "既定値を削除し、未設定時の自動判定の扱いを明示するか、根拠付きAI-Inferred Requirementとして定義してください。" });
  }
  const modelFields = dataModelFieldNames(spec.dataModel);
  const transitionFields = transitionFieldReferences(spec.stateTransitions);
  for (const field of transitionFields) {
    if (!modelFields.has(field) && !transitionFieldIsDerived(spec.stateTransitions, field)) {
      issues.push({ section: "State Transitions", severity: "error", message: `State Transitionsで使う「${field}」がData Modelで表現できません。`, suggestedFix: "永続化するstatus/flagはData Modelへ追加し、派生値なら保存しないことを状態遷移に明示してください。" });
    }
  }
  const completion = shoppingCompletionSemantics(spec);
  if (completion.applies && (completion.removed === completion.retained)) {
    issues.push({ section: "Shopping list completion", severity: "error", message: "買い物リストの購入完了が削除なのか完了状態の保持なのか一意ではありません。", suggestedFix: "削除または状態保持のどちらか一方を選び、Data Model・User Flow・State Transitions・Acceptance Criteriaへ統一してください。" });
  }
  if (completion.applies && completion.retained && !["status", "state", "completed", "iscompleted", "状態", "フラグ"].some((field) => modelFields.has(field))) {
    issues.push({ section: "Data Model", severity: "error", message: "購入完了状態を保持する仕様ですが、Data Modelに対応するstatus/flagがありません。", suggestedFix: "完了状態を保持するなら対応フィールドを追加し、保持しないならShoppingListItemの削除として統一してください。" });
  }
  for (const field of proposalTypedFields(model.implementationProposals)) {
    if (!modelFields.has(field)) issues.push({ section: "Implementation Proposal", severity: "error", message: `Implementation Proposalが本仕様と異なるData Modelフィールド「${field}」を追加しています。`, suggestedFix: "そのフィールドを根拠付きの正式Data Modelへ昇格するか、Implementation Proposalから削除してください。" });
  }
  for (const occurrence of arbitraryNumericOccurrences(context, mandatoryText)) issues.push({ section: "Specification certainty", severity: "error", message: "ユーザー確認のない具体値・閾値が必須仕様に含まれています。", suggestedFix: `「${occurrence.value.trim()}」はImplementation Proposalへ戻すか、ユーザーに確認してください。` });
  const inferredStatusRules = ["draft", "pending_approval", "pending approval"];
  if (inferredStatusRules.some((status) => mandatoryText.toLowerCase().includes(status) && !explicitSource.includes(status))) issues.push({ section: "Specification certainty", severity: "error", message: "ユーザー確認のない予約ステータスを競合・必須ルールとして確定しています。", suggestedFix: "ステータスの扱いはImplementation Proposalへ戻すか、ユーザーに確認してください。" });
  if (/(alternative\s+(?:room|meeting)|代替(?:会議室|ルーム))/i.test(mandatoryText) && !/(alternative\s+(?:room|meeting)|代替(?:会議室|ルーム))/i.test(explicitSource)) issues.push({ section: "Specification certainty", severity: "error", message: "代替会議室の提示が未確認のMVP必須要件になっています。", suggestedFix: "Implementation Proposalへ戻してください。" });
  const confirmedVisibility = model.userConfirmed.filter((item) => /visibility|privacy|閲覧|公開/i.test(`${item.key} ${item.value}`)).map((item) => String(item.value)).join(" ");
  if (/non.?viewer|非閲覧|非公開|管理者のみ|authorized only/i.test(confirmedVisibility) && /all users|everyone|unauthorized|non.?viewer.*(?:show|display)|全ユーザー|非閲覧.*(?:表示|公開)/i.test(mandatoryText)) issues.push({ section: "Visibility / privacy", severity: "error", message: "User Confirmedの閲覧・公開範囲と矛盾する予約情報の表示があります。", suggestedFix: "非閲覧権限のユーザーには競合予約の非公開情報を表示しないでください。" });
  if (!/email|eメール|メールアドレス/.test(explicitSource) && /\b(?:email|e-mail)\b|メールアドレス/i.test(String(spec.dataModel ?? ""))) issues.push({ section: "Data Model", severity: "error", message: "根拠のないemailフィールドがData Modelに含まれています。", suggestedFix: "明示要求または主要フローに必要なフィールドだけを残してください。" });
  if (!balancedDataModel(spec.dataModel)) issues.push({ section: "Data Model", severity: "error", message: "Data Modelの括弧または中括弧が閉じられておらず構文が壊れています。", suggestedFix: "Data Modelの { }、[ ]、( ) を対応する組で閉じてください。" });
  const editPolicy = confirmedEditPolicy(context);
  if (editPolicy) {
    const editSections = [spec.userFlow, spec.functionalRequirements, spec.implementationRules, spec.acceptanceCriteria].join("\n");
    if (!editSections.includes(editPolicy)) issues.push({ section: "User Confirmed Decisions", severity: "error", message: "User Confirmedの編集方針がSPEC全体へ一意に反映されていません。", suggestedFix: "保存前の編集画面経由と、料理名変更は任意であることを明記してください。" });
    if (/(?:料理名(?:の)?変更|name change).{0,20}(?:必須|must|required)/i.test(editSections)) issues.push({ section: "User Confirmed Decisions", severity: "error", message: "料理名の変更可能と変更必須が混同されています。", suggestedFix: "編集画面への遷移だけを必須にし、変更操作そのものは任意としてください。" });
  }
  if (localOnly(context) && hasAffirmativeNetworkSync(mandatoryText)) issues.push({ section: "Local data", severity: "error", message: "ローカル保存MVPにネットワーク同期を示す表現が含まれています。", suggestedFix: "同一ローカルデータを参照する画面への即時反映として記載してください。" });
  if (deviceOnlyProcessing(context) && /cloud|クラウド|external\s*ai|外部AI|remote\s*api/i.test(mandatoryText)) issues.push({ section: "Photo processing privacy", severity: "error", message: "端末内処理というUser Confirmed Decisionに反するクラウド依存がMVP必須仕様に含まれています。", suggestedFix: "クラウドAI・外部API・クラウド保存を削除し、端末内処理へ整合させてください。" });
  if (/(高度|本格|充実|advanced|comprehensive)/i.test(confirmedText) && /(ゲーム化|ゲーミフィケーション|gamification)/i.test(confirmedText) && /(最小限.*(ゲーム化|ゲーミフィケーション)|バッジだけ|限定.*(バッジ|報酬))/i.test(finalText)) {
    issues.push({ section: "User Confirmed Decisions", severity: "error", message: "ユーザーが求めた高度なゲーム化がAIによって縮小されています。", suggestedFix: "詳細を質問し、ユーザー回答をそのまま仕様へ反映してください。" });
  }
  const indispensableSource = `${confirmedText}\n${model.aiInferredRequirements.map((item) => `${item.key} ${item.value}`).join("\n")}\n${spec.coreUserValue ?? ""}`;
  const unrequestedFeatures = [
    [/(CSV(エクスポート|出力)|CSV export)/i, "CSVエクスポート"], [/(チュートリアル|tutorial)/i, "チュートリアル"],
    [/(バックアップ|backup)/i, "バックアップ"], [/(高度な分析|advanced analytics)/i, "高度なAnalytics"], [/(クラウド同期|cloud sync)/i, "クラウド同期"],
  ];
  for (const [pattern, label] of unrequestedFeatures) {
    if (pattern.test(mvpText) && !pattern.test(indispensableSource)) issues.push({ section: "MVP Scope", severity: "error", message: `${label}が根拠なくMVP必須要件へ追加されています。`, suggestedFix: "提案またはFuture / Optionalへ移してください。" });
  }
  if (!String(spec.mvpScope ?? "").trim()) issues.push({ section: "MVP Scope", severity: "error", message: "MVP Scopeがありません。", suggestedFix: "確認済み事項とAI推論から最小範囲を記載してください。" });
  if (!String(spec.acceptanceCriteria ?? "").trim()) issues.push({ section: "Acceptance Criteria", severity: "error", message: "Acceptance Criteriaがありません。", suggestedFix: "MVPとして検証可能な条件を記載してください。" });
  return issues;
}

export function validateLocally(context, spec) {
  const required = ["projectOverview", "coreUserValue", "mvpScope", "functionalRequirements", "acceptanceCriteria"];
  const issues = required.filter((key) => !String(spec[key] ?? "").trim()).map((key) => ({ section: key, severity: "error", message: "必須セクションが生成されていません。", suggestedFix: "AI providerに完全な仕様を再生成させてください。" }));
  if (!context.idea.trim()) issues.push({ section: "Project Overview", severity: "error", message: "アイデアが空です。", suggestedFix: "アイデアを入力してください。" });
  issues.push(...validateSpecConsistency(context, spec));
  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

const errorIssues = (issues) => issues.filter((issue) => issue.severity === "error");
export const validationSignature = (issues) => [...new Set(errorIssues(issues).map((issue) => `${issue.section}:${issue.message}`))].sort().join("|");

const errorCodeFor = (issue) => {
  if (issue?.ruleId) return issue.ruleId;
  const message = issue?.message ?? "";
  if (/比較条件/.test(message)) return "confirmed_business_rule_operator";
  if (/必須\/任意属性/.test(message)) return "unconfirmed_field_cardinality";
  if (/主要状態遷移|直前の状態/.test(message)) return "state_transition_gap";
  if (/クラウド同期が根拠なくMVP必須要件/.test(message)) return "unrequested_cloud_sync";
  if (/具体値・閾値/.test(message)) return "unconfirmed_concrete_value";
  if (/ネットワーク同期/.test(message)) return "local_only_network_sync";
  if (/クラウド依存/.test(message)) return "on_device_cloud_conflict";
  if (/意味的に重複/.test(message)) return "semantic_duplicate";
  if (/未確定のImplementation Proposal/.test(message)) return "proposal_promoted_to_mvp";
  if (/Future \/ Optional/.test(message)) return "future_promoted_to_mvp";
  if (/ユーザー確定事項に矛盾/.test(message)) return "confirmed_decision_conflict";
  return "validation_error";
};

function validationRuleFor(issue) {
  const id = errorCodeFor(issue);
  const names = {
    reservation_conflict_consistency: "予約競合の一貫性",
    reservation_conflict_recheck: "予約確定直前の競合再確認",
    confirmed_decision_conflict: "ユーザー確定事項の矛盾",
    confirmed_business_rule_operator: "ユーザー確定の業務条件",
    state_transition_gap: "主要状態遷移の完全性",
    unconfirmed_concrete_value: "未確認の具体値・閾値",
  };
  return { id, name: issue?.ruleName ?? names[id] ?? issue?.section ?? "SPEC validation" };
}

function reservationDecisionIds(context) {
  return (context?.facts ?? []).filter((fact) => fact.source === SOURCE.USER && /(?:staff|担当|資源|予約|時間枠|時間帯|confirm|確定|競合|重複)/i.test(`${fact.key} ${fact.value}`)).map((fact) => fact.key);
}

function diagnosticReferences(context, issue) {
  const rule = validationRuleFor(issue);
  if (rule.id === "reservation_conflict_consistency" || rule.id === "reservation_conflict_recheck") {
    return {
      offending_requirement_ids: issue.offendingRequirementIds ?? [rule.id],
      offending_decision_ids: issue.offendingDecisionIds ?? reservationDecisionIds(context),
    };
  }
  return {
    offending_requirement_ids: issue.offendingRequirementIds ?? [],
    offending_decision_ids: issue.offendingDecisionIds ?? [],
  };
}

/**
 * Safe development telemetry for the final SPEC state machine. Deliberately
 * contains IDs and fixed validator messages only — never the idea, answers,
 * prompts, API credentials, or generated SPEC text.
 */
export function buildValidationLogEntries({ context, validationBeforeRepair = [], validationAfterRepair = [], repairAttempted = false, repairAction = "not_attempted", retryCount = 0 } = {}) {
  const beforeCodes = errorIssues(validationBeforeRepair).map((issue) => errorCodeFor(issue));
  const afterCodes = errorIssues(validationAfterRepair).map((issue) => errorCodeFor(issue));
  return errorIssues(validationBeforeRepair).map((issue) => {
    const rule = validationRuleFor(issue);
    return {
      validation_rule_id: rule.id,
      validation_rule_name: rule.name,
      severity: issue.severity,
      ...diagnosticReferences(context, issue),
      offending_spec_sections: [issue.section],
      reason: issue.message,
      repair_attempted: repairAttempted,
      repair_action: repairAction,
      validation_before_repair: beforeCodes,
      validation_after_repair: afterCodes,
      repair_attempt: repairAttempted ? retryCount + 1 : 0,
      before: beforeCodes,
      after: afterCodes,
      retry_count: retryCount,
    };
  });
}

const sourceLabel = (origin) => ({ [SOURCE.USER]: "User Confirmed", [SOURCE.INITIAL]: "Core Value / Initial Input", [SOURCE.AI]: "AI-Inferred" }[origin] ?? "SPEC expansion");
const excerpt = (text, index = 0, size = 100) => String(text ?? "").slice(Math.max(0, index - 24), index + size).replace(/\s+/g, " ").trim();

function sectionsForDiagnostic(spec, code) {
  const entries = Object.entries(spec ?? {});
  if (code === "reservation_conflict_consistency") return ["functionalRequirements", "acceptanceCriteria", "mvpScope"].flatMap((section) => {
    const text = String(spec?.[section] ?? "");
    const match = /(?:最大|at\s+most|only).{0,16}(?:1|one).{0,16}(?:件|予約|reservation)|二重予約|重複予約|競合/i.exec(text);
    return match ? [{ section, excerpt: excerpt(text, match.index) }] : [];
  });
  if (code === "reservation_conflict_recheck") return ["stateTransitions", "functionalRequirements", "acceptanceCriteria"].flatMap((section) => {
    const text = String(spec?.[section] ?? "");
    const match = /(?:確定|保存|confirm).{0,48}(?:再確認|競合|空き)|(?:再確認|競合|空き).{0,48}(?:確定|保存|confirm)/i.exec(text);
    return match ? [{ section, excerpt: excerpt(text, match.index) }] : [];
  });
  if (code === "unconfirmed_concrete_value") return protectedSpecSections.flatMap((sectionName) => {
    const text = String(spec?.[sectionName] ?? "");
    return [...text.matchAll(/\d+(?:\s*(?:秒|分|日|回|桁|円|seconds?|minutes?|days?|times?))?/gi)].map((match) => ({ section: sectionName, excerpt: excerpt(text, match.index) }));
  });
  if (code === "local_only_network_sync") return entries.flatMap(([section, text]) => {
    const match = /(?:real[ -]?time\s+)?(?:sync|synchronization)|(?:リアルタイム)?同期/i.exec(String(text));
    return match ? [{ section, excerpt: excerpt(text, match.index) }] : [];
  });
  if (code === "unrequested_cloud_sync") return entries.flatMap(([section, text]) => {
    const match = /cloud\s*sync|クラウド同期/i.exec(String(text));
    return match ? [{ section, excerpt: excerpt(text, match.index) }] : [];
  });
  return [];
}

function canonicalSourceForDiagnostic(canonical, code, sectionExcerpt = "") {
  if (code === "reservation_conflict_consistency") return { id: "reservation_exclusivity", origin: "Core Value / Initial Input", detail: "同一の資源・時間枠に重複した確定予約を作成しない。" };
  if (code === "reservation_conflict_recheck") return { id: "reservation_conflict_recheck", origin: "Core Value / Initial Input", detail: "予約を確定する直前に、対象枠の競合を再確認する。" };
  if (code === "local_only_network_sync") {
    const boundary = canonical?.dataBoundary;
    return { id: "dataBoundary.local_only", origin: sourceLabel(boundary?.source), detail: boundary?.instruction ?? "" };
  }
  const candidates = [
    ...(canonical?.userConfirmedDecisions ?? []),
    ...(canonical?.uniquelyDerivedAiRequirements ?? []),
    ...(canonical?.primaryFlowInputs ?? []),
    canonical?.coreUserValue ? [{ id: "coreUserValue", key: "coreUserValue", value: canonical.coreUserValue.value ?? canonical.coreUserValue, origin: canonical.coreUserValue.origin ?? SOURCE.INITIAL }] : [],
  ];
  const tokens = new Set(String(sectionExcerpt).toLowerCase().split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/).filter((token) => token.length > 2));
  const matched = candidates.find((candidate) => String(`${candidate.key ?? candidate.id} ${candidate.value ?? ""}`).toLowerCase().split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/).some((token) => token.length > 2 && tokens.has(token)));
  if (!matched) return { id: "spec_expansion", origin: "SPEC expansion", detail: "Canonical Requirementに直接対応しない展開結果" };
  return { id: matched.key ?? matched.id, origin: sourceLabel(matched.origin), detail: String(matched.value ?? "") };
}

function iterationSummary(trace, code) {
  const summary = trace.map((step) => {
    const before = step.validationErrors ?? [];
    const after = step.revalidationErrors ?? [];
    const seenBefore = before.some((issue) => errorCodeFor(issue) === code);
    const seenAfter = after.some((issue) => errorCodeFor(issue) === code);
    const canonicalChanged = step.canonicalAfter != null && JSON.stringify(step.canonicalBefore) !== JSON.stringify(step.canonicalAfter);
    const specChanged = step.specAfter != null && JSON.stringify(step.generatedSpec) !== JSON.stringify(step.specAfter);
    return { iteration: step.iteration, status: seenAfter ? "残存" : seenBefore ? "修復後に解消" : "未検出", canonicalChanged, specChanged, action: step.action };
  });
  while (summary.length < 3) summary.push({ iteration: summary.length + 1, status: "未実行（改善不能のため停止）", canonicalChanged: false, specChanged: false, action: "not_run" });
  return summary;
}

/** Presentation-only diagnostic projection. It does not alter repair or validation behavior. */
export function buildRepairDiagnostics({ context, trace = [], stopMessage = "" } = {}) {
  const last = trace.at(-1) ?? {};
  const finalSpec = last.specAfter ?? last.generatedSpec ?? {};
  const finalIssues = errorIssues(last.revalidationErrors?.length ? last.revalidationErrors : last.validationErrors ?? []);
  const canonical = last.canonicalAfter ?? last.canonicalBefore ?? context?.canonicalRequirements ?? buildCanonicalRequirements(context ?? createProjectContext(""));
  const occurrence = new Map();
  const errors = finalIssues.map((issue) => {
    const code = errorCodeFor(issue);
    const sections = sectionsForDiagnostic(finalSpec, code);
    const index = occurrence.get(code) ?? 0;
    occurrence.set(code, index + 1);
    const location = sections[index] ?? sections[0] ?? { section: issue.section ?? "unknown", excerpt: "該当箇所を特定できませんでした" };
    const canonicalSource = canonicalSourceForDiagnostic(canonical, code, location.excerpt);
    return { code, message: issue.message, section: location.section, excerpt: location.excerpt, canonicalRequirementId: canonicalSource.id, canonicalOrigin: canonicalSource.origin, canonicalDetail: canonicalSource.detail, iterations: iterationSummary(trace, code) };
  });
  const noProgress = trace.some((step) => step.action === "stopped_no_progress");
  const reason = noProgress ? "修復後のCanonical Requirements・SPEC・エラー署名が変化しなかったため、同じAI再生成を繰り返さず停止しました。" : trace.length >= 3 ? "修復iterationの上限（3回）に到達しても最終validation errorが残りました。" : stopMessage || "最終validation errorが残りました。";
  return { errors, reason, iterations: trace.length };
}

async function validateGeneratedSpec(context, spec, validateRemote) {
  const local = validateLocally(context, spec);
  // Remote validation is useful only after deterministic validation accepts the
  // same candidate. This avoids spending another API request on a candidate
  // that is already known to be invalid locally.
  const remote = local.valid && validateRemote ? await validateRemote({ idea: context.idea, canonicalRequirements: context.canonicalRequirements }, spec) : { issues: [] };
  const issues = [...local.issues, ...(remote?.issues ?? [])];
  return { valid: local.valid && !errorIssues(remote?.issues ?? []).length, issues, local, remote };
}

/**
 * The one final-SPEC state machine.  Each entry preserves the relationship
 * canonicalBefore -> generatedSpec -> errors -> canonicalAfter/specAfter.
 * Consumers must use this rather than invoking generation and repair through
 * separate paths.
 */
export async function runSpecRepairPipeline({ context, generateSpec, validateRemote, maxIterations = 3, onPhase, onDiagnostic } = {}) {
  if (!context || !generateSpec) throw new Error("SPEC修復パイプラインの入力が不足しています。");
  let working = prepareCanonicalContext(context);
  const trace = [];

  for (let attempt = 0; attempt < maxIterations; attempt += 1) {
    onPhase?.(attempt === 0 ? "generating" : "repairing", attempt);
    const canonicalBefore = clone(working.canonicalRequirements);
    const generated = await generateSpec({
      idea: working.idea,
      canonicalRequirements: working.canonicalRequirements,
      validationIssues: trace.at(-1)?.revalidationErrors ?? [],
      repairDirectives: working.repairDirectives ?? [],
    });
    const rawSpec = generated?.spec;
    if (!rawSpec) throw new Error("SPEC本文が生成されなかったため最終validationを実行できません。");
    const generatedSpec = canonicalizeSpec(working, rawSpec);
    onPhase?.("validating", attempt);
    const generatedValidation = await validateGeneratedSpec(working, generatedSpec, validateRemote);
    const step = {
      iteration: attempt + 1,
      canonicalBefore,
      generatedSpec,
      validationErrors: errorIssues(generatedValidation.issues),
      canonicalAfter: null,
      specAfter: null,
      revalidationErrors: [],
      action: generatedValidation.valid ? "accepted_generated_spec" : "repairing",
    };
    trace.push(step);

    if (generatedValidation.valid) {
      onDiagnostic?.(buildValidationLogEntries({ context: working, validationBeforeRepair: generatedValidation.issues, retryCount: attempt }));
      return { context: working, spec: generatedSpec, validation: generatedValidation, trace };
    }
    if (attempt === maxIterations - 1) break;

    const repaired = repairConsistency(working, generatedSpec, generatedValidation.issues);
    step.canonicalAfter = clone(repaired.context.canonicalRequirements);
    step.specAfter = repaired.spec;
    onPhase?.("revalidating", attempt);
    const repairedValidation = await validateGeneratedSpec(repaired.context, repaired.spec, validateRemote);
    step.revalidationErrors = errorIssues(repairedValidation.issues);
    const repairAction = repaired.repairActions?.length ? repaired.repairActions.join(",") : repaired.canonicalChanged ? "canonical_normalization" : "no_structural_repair";
    onDiagnostic?.(buildValidationLogEntries({
      context: repaired.context,
      validationBeforeRepair: generatedValidation.issues,
      validationAfterRepair: repairedValidation.issues,
      repairAttempted: true,
      repairAction,
      retryCount: attempt,
    }));

    // A repaired expansion may already be valid.  If the canonical model was
    // changed, regenerate the whole SPEC from it instead of accepting text
    // rendered from the pre-repair model.
    if (repairedValidation.valid && !repaired.canonicalChanged) {
      step.action = "accepted_repaired_spec";
      return { context: repaired.context, spec: repaired.spec, validation: repairedValidation, trace };
    }

    const unchangedErrors = validationSignature(generatedValidation.issues) === validationSignature(repairedValidation.issues);
    if (unchangedErrors && !repaired.canonicalChanged && JSON.stringify(generatedSpec) === JSON.stringify(repaired.spec)) {
      step.action = "stopped_no_progress";
      const error = new Error("自動修復で改善できない整合性エラーが残りました。再生成を繰り返さず停止しました。");
      error.repairTrace = trace;
      error.context = repaired.context;
      throw error;
    }

    step.action = repaired.canonicalChanged ? "canonical_changed_regenerate" : "spec_repaired_regenerate";
    working = { ...repaired.context, repairDirectives: repaired.repairDirectives };
  }

  const finalStep = trace.at(-1);
  if (finalStep) {
    onDiagnostic?.(buildValidationLogEntries({
      context: working,
      validationBeforeRepair: finalStep.validationErrors,
      validationAfterRepair: finalStep.revalidationErrors,
      repairAttempted: false,
      repairAction: "iteration_limit_reached",
      retryCount: Math.max(0, trace.length - 1),
    }));
  }
  const error = new Error("仕様の自動修復後も整合性を確認できませんでした。");
  error.repairTrace = trace;
  error.context = working;
  throw error;
}
