import { runSalonCompletionGateFlow, runSalonFlow, runSalonProductLanguageAndProgressFlow } from "./salon-flow.js";

runSalonFlow();
runSalonProductLanguageAndProgressFlow();
const result = runSalonCompletionGateFlow();
console.log(`Salon reservation mocked E2E: PASS (${result.questionCount} question: ${result.questions.join(" / ")})`);
