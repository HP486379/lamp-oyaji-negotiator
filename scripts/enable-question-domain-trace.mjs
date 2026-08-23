import fs from "node:fs";

const target = process.argv[2] ?? "requirements-core.js";
let source = fs.readFileSync(target, "utf8");
const backup = `${target}.before-diag`;
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
if (source.includes("[DIAG] recordAnswer")) {
  console.log("Diagnostics already enabled.");
  process.exit(0);
}

function functionRange(name) {
  const marker = `export function ${name}(`;
  const start = source.indexOf(marker);
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
      if (depth === 0) return { start, brace, end: i + 1 };
    }
  }
  throw new Error(`Could not find function end: ${name}`);
}

function insertBeforeLastReturn(name, code) {
  const { start, end } = functionRange(name);
  const block = source.slice(start, end);
  const idx = block.lastIndexOf("return ");
  if (idx < 0) throw new Error(`Return not found: ${name}`);
  source = source.slice(0, start + idx) + code + "\n  " + source.slice(start + idx);
}

function insertAfter(name, needle, code) {
  const { start, end } = functionRange(name);
  const block = source.slice(start, end);
  const idx = block.indexOf(needle);
  if (idx < 0) throw new Error(`Anchor not found in ${name}: ${needle}`);
  const pos = start + idx + needle.length;
  source = source.slice(0, pos) + "\n" + code + source.slice(pos);
}

insertBeforeLastReturn("recordAnswer", `  console.group("[DIAG] recordAnswer");
  console.log("dimension.id", dimension.id);
  console.log("question.decisionDomain", dimension.question?.decisionDomain ?? null);
  console.log("canonical answered domain", canonicalDecisionDomain(dimension.question, dimensionId));
  console.log("answeredDecisionDomains", next.answeredDecisionDomains);
  console.log("user confirmed facts", next.facts.filter((f) => f.source === SOURCE.USER).map((f) => ({ key: f.key, decisionDomain: f.decisionDomain ?? null, value: f.value })));
  console.groupEnd();`);

insertAfter("recordInference", "  let grouped = normaliseInference(inference);", `  console.group("[DIAG] inferMvp");
  console.log("criticalProductDecisions", (grouped.criticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("clarificationQuestions", (grouped.clarificationQuestions ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, title: x.question?.title ?? null })));
  console.log("stateTransitionGaps", (grouped.stateTransitionGaps ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, requiresProductDecision: x.requiresProductDecision ?? null })));
  console.log("answeredDecisionDomains", withInvariants.answeredDecisionDomains ?? []);
  console.groupEnd();`);

insertBeforeLastReturn("recordInference", `  console.group("[DIAG] reassessed");
  console.log("reassessedCriticalProductDecisions", (next.reassessedCriticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("dimensions", (next.dimensions ?? []).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, title: d.question?.title ?? null, known: d.known, value: d.value })));
  console.log("answeredDecisionDomains", next.answeredDecisionDomains ?? []);
  console.groupEnd();`);

insertAfter("applyCriticalDecisionCoverageAudit", "export function applyCriticalDecisionCoverageAudit(context, audit) {", `
  console.group("[DIAG] coverage-audit");
  console.log("criticalProductDecisions", (audit?.criticalProductDecisions ?? []).map((x) => ({ decisionDomain: x.decisionDomain ?? null, reason: x.reason ?? null })));
  console.log("clarificationQuestions", (audit?.clarificationQuestions ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, title: x.question?.title ?? null })));
  console.log("stateTransitionGaps", (audit?.stateTransitionGaps ?? []).map((x) => ({ id: x.id ?? null, decisionDomain: x.question?.decisionDomain ?? null, requiresProductDecision: x.requiresProductDecision ?? null })));
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.groupEnd();`);

insertBeforeLastReturn("completionGate", `  console.group("[DIAG] completionGate");
  console.log("criticalDecisionDomains", criticalDecisionDomains);
  console.log("resolvedDomains", [...resolvedDomains]);
  console.log("resolvedCriticalDecisionDomains", resolvedCriticalDecisionDomains);
  console.log("unresolvedCriticalProductDecisions", unresolvedCriticalProductDecisions.map((x) => ({ decisionDomain: x.decisionDomain, reason: x.reason })));
  console.log("primaryFlowCoverage", flowCoverage);
  console.log("answeredDecisionDomains", context?.answeredDecisionDomains ?? []);
  console.groupEnd();`);

const plan = functionRange("planNext");
let planBlock = source.slice(plan.start, plan.end);
const oldTail = ") [0] ?? null;";
if (planBlock.includes(oldTail)) {
  throw new Error("Unexpected planNext formatting; tracer refuses to guess.");
}
const exactTail = "    })[0] ?? null;";
if (!planBlock.includes(exactTail)) throw new Error("planNext selection tail not found");
planBlock = planBlock.replace("  return context.dimensions", "  const selected = context.dimensions")
  .replace(exactTail, `    })[0] ?? null;
  console.group("[DIAG] planNext");
  console.log("candidate dimensions", (context.dimensions ?? []).filter((d) => !d.known && d.value == null && d.question).map((d) => ({ id: d.id, decisionDomain: d.question?.decisionDomain ?? null, canonicalDomain: canonicalDecisionDomain(d.question, d.id), title: d.question?.title ?? null, answeredQuestion: (context.answeredQuestionKeys ?? []).includes(d.id), settledExact: settledDomains.has(canonicalDecisionDomain(d.question, d.id)), settledSemantic: isDecisionDomainSettled(context, canonicalDecisionDomain(d.question, d.id)) })));
  console.log("answeredDecisionDomains", context.answeredDecisionDomains ?? []);
  console.log("selected", selected ? { id: selected.id, decisionDomain: selected.question?.decisionDomain ?? null, canonicalDomain: canonicalDecisionDomain(selected.question, selected.id), title: selected.question?.title ?? null } : null);
  console.groupEnd();
  return selected;`);
source = source.slice(0, plan.start) + planBlock + source.slice(plan.end);

source = `// DIAGNOSTIC BUILD ONLY — restore from ${backup} after tracing\n` + source;
fs.writeFileSync(target, source, "utf8");
console.log(`Diagnostics enabled in ${target}`);
console.log(`Backup: ${backup}`);
console.log("Run the app, reproduce the issue, and filter the browser console for [DIAG].");
