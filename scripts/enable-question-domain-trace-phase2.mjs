import fs from "node:fs";

const target = process.argv[2] ?? "requirements-core.js";
let source = fs.readFileSync(target, "utf8");

if (!source.includes("[DIAG] recordAnswer")) {
  throw new Error("Phase 1 diagnostics are not enabled. Run enable-question-domain-trace.mjs first.");
}
if (source.includes("[DIAG] completionQuestion input")) {
  console.log("Phase 2 diagnostics already enabled.");
  process.exit(0);
}

function functionRange(name) {
  const markers = [`function ${name}(`, `export function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    const candidate = source.indexOf(marker);
    if (candidate >= 0 && (start < 0 || candidate < start)) start = candidate;
  }
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`Could not find function end: ${name}`);
}

function insertAfterInFunction(name, label, needle, code) {
  const { start, end } = functionRange(name);
  const block = source.slice(start, end);
  const count = block.split(needle).length - 1;
  if (count !== 1) throw new Error(`[${label}] expected exactly 1 match in ${name}, found ${count}`);
  const local = block.indexOf(needle) + needle.length;
  const pos = start + local;
  source = source.slice(0, pos) + "\n" + code + source.slice(pos);
}

insertAfterInFunction(
  "completionQuestion",
  "completionQuestion input",
  "function completionQuestion(context, missing) {",
  `  console.group("[DIAG] completionQuestion input");
  console.log("missing", { decisionDomain: missing?.decisionDomain ?? null, reason: missing?.reason ?? null });
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.log("all dimensions before generation", (context?.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value })));
  console.groupEnd();`
);

insertAfterInFunction(
  "addCompletionQuestion",
  "addCompletionQuestion gate",
  "  const gate = completionGate(context);",
  `  console.group("[DIAG] addCompletionQuestion gate");
  console.log("gate.complete", gate.complete);
  console.log("gate.coverageAuditPending", gate.coverageAuditPending);
  console.log("unresolved", (gate.unresolvedCriticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain, reason: x.reason })));
  console.log("all dimensions entering addCompletionQuestion", (context.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value })));
  console.groupEnd();`
);

insertAfterInFunction(
  "addCompletionQuestion",
  "completionQuestion generated",
  "  const fallback = completionQuestion(context, missing);",
  `  console.group("[DIAG] completionQuestion generated");
  console.log({
    missingDecisionDomain: missing?.decisionDomain ?? null,
    generatedId: fallback?.id ?? null,
    generatedQuestionDomain: fallback?.question?.decisionDomain ?? null,
    generatedTitle: fallback?.question?.title ?? null,
    generatedOptions: fallback?.question?.options ?? [],
  });
  console.groupEnd();`
);

insertAfterInFunction(
  "addCompletionQuestion",
  "merged clarification dimensions",
  "  const next = { ...context, dimensions };",
  `  console.group("[DIAG] merged clarification dimensions");
  console.log("hasInvalidCandidate", hasInvalidCandidate);
  console.log("missingDecisionDomain", missing?.decisionDomain ?? null);
  console.log("dimensions after merge", dimensions.map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, known: d.known, value: d.value, title: d.question?.title ?? null })));
  console.groupEnd();`
);

insertAfterInFunction(
  "planNext",
  "planNext all dimensions",
  "  console.group(\"[DIAG] planNext\");",
  `  console.log("all dimensions", (context.dimensions ?? []).map((d) => ({
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
  })));`
);

fs.writeFileSync(target, source, "utf8");
console.log(`Phase 2 diagnostics enabled in ${target}`);
console.log("Reproduce the issue and filter the browser console for [DIAG].");
