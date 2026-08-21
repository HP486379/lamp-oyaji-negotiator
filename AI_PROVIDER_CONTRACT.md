# AI Provider contract

`SpecTaroV40` accepts any object implementing the following asynchronous methods:

- `analyzeIdea(idea)` → `{ projectType, platform?, genre?, purpose, targetUsers?, knownFacts: [], criticalProductDecisions: [{ decisionDomain, reason, resolvedByInitialInput }] }`
- `generateDimensions(context)` → `SpecificationDimension[]`
- `inferMvp(context)` → `{ aiInferredRequirements, implementationProposals, futureOptional, clarificationQuestions, stateTransitionGaps, criticalProductDecisions: [{ decisionDomain, reason }] }`
- `generateSpec(context)` → `{ spec: GeneratedSpec }`
- `validateSpec(context, spec)` → `{ valid: boolean, issues: ValidationIssue[] }`

The supplied `HttpRequirementsAI` sends these methods to these server-only routes:

- `POST /api/requirements/analyze`
- `POST /api/requirements/dimensions`
- `POST /api/requirements/infer-mvp`
- `POST /api/requirements/generate-spec`
- `POST /api/requirements/validate`

Validate each provider response with a JSON Schema on the server and return only the structured JSON to the browser. Store the provider credential in the server environment; do not use a `VITE_*`, `NEXT_PUBLIC_*`, or other client-exposed variable.

`criticalProductDecisions` is the Completion Gate input. It includes only independent user-facing Product Decisions needed to make the core value or primary flow implementable. Core Invariants, technical implementation choices, and optional/future items are excluded. A decision is `resolvedByInitialInput` only when the initial user text actually determines it; an unresolved user-owned decision remains in the gate until the user confirms a matching decision.

`inferMvp` re-evaluates the same boundary after every user answer. Its `criticalProductDecisions` array contains still-unresolved Product Decisions only; each requires a matching clarification question before the conversation can finish. AI-Inferred Requirements cannot by themselves resolve a user-owned critical decision.

`validate` must check the generated specification against the received `ProjectContext`, report section-level issues, and reject unrelated concepts semantically. The UI retries generation with those issues at most twice and never substitutes a sample specification after an AI error.
