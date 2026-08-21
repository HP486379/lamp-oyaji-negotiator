import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const logFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "logs", "requirements-api.log");

/** Writes only phase metadata; never pass prompts, user input, API keys, or model text. */
export function diagnostic(event, fields = {}) {
  const entry = JSON.stringify({ at: new Date().toISOString(), event, ...fields });
  console.info(`[requirements] ${entry}`);
  if (process.env.NODE_ENV !== "production") {
    void mkdir(path.dirname(logFile), { recursive: true })
      .then(() => appendFile(logFile, `${entry}\n`, "utf8"))
      .catch(() => undefined);
  }
}
