import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules", "SpecTaroV40.jsx", "requirements-core.js", "requirements-ai-client.js"] },
  js.configs.recommended,
  { files: ["src/**/*.{js,jsx}", "server/**/*.js", "tests/**/*.js"], languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { console: "readonly", process: "readonly", document: "readonly", window: "readonly", navigator: "readonly", Blob: "readonly", URL: "readonly", fetch: "readonly", crypto: "readonly", AbortController: "readonly", performance: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } }, plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, "react-refresh/only-export-components": ["warn", { allowConstantExport: true }], "no-unused-vars": ["error", { argsIgnorePattern: "^_" }], "preserve-caught-error": "off" } },
];
