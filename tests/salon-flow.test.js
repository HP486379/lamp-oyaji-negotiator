import test from "node:test";
import { runSalonCompletionGateFlow, runSalonFlow, runSalonProductLanguageAndProgressFlow } from "./salon-flow.js";

test("salon reservation mock E2E filters destructive options and stops after product decisions", () => {
  runSalonFlow();
});

test("salon completion gate recovers from zero initial questions before declaring readiness", () => {
  runSalonCompletionGateFlow();
});

test("salon technical question is replaced with product language and display progress never regresses", () => {
  runSalonProductLanguageAndProgressFlow();
});
