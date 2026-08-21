import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { zodTextFormat } from "openai/helpers/zod";
import { structuredOutputSchemas } from "../server/ai.js";

function inspectSchema(node, path = "$") {
  if (!node || typeof node !== "object") return;
  if (node.type === "object") {
    assert.equal(node.additionalProperties, false, `${path}: object must set additionalProperties=false`);
    const propertyNames = Object.keys(node.properties ?? {}).sort();
    const requiredNames = [...(node.required ?? [])].sort();
    assert.deepEqual(requiredNames, propertyNames, `${path}: every property must be required`);
    Object.entries(node.properties ?? {}).forEach(([key, value]) => inspectSchema(value, `${path}.properties.${key}`));
  }
  if (node.type === "array") inspectSchema(node.items, `${path}.items`);
  if (Array.isArray(node.anyOf)) node.anyOf.forEach((value, index) => inspectSchema(value, `${path}.anyOf[${index}]`));
  if (Array.isArray(node.oneOf)) node.oneOf.forEach((value, index) => inspectSchema(value, `${path}.oneOf[${index}]`));
  if (Array.isArray(node.allOf)) node.allOf.forEach((value, index) => inspectSchema(value, `${path}.allOf[${index}]`));
  Object.entries(node.$defs ?? {}).forEach(([key, value]) => inspectSchema(value, `${path}.$defs.${key}`));
}

test("every OpenAI Structured Outputs schema is an API-compatible object schema", () => {
  for (const [name, zodSchema] of Object.entries(structuredOutputSchemas)) {
    const jsonSchema = zodTextFormat(zodSchema, name).schema;
    assert.equal(jsonSchema.type, "object", `${name}: root schema must be an object`);
    inspectSchema(jsonSchema, name);
  }
});

test("Structured Outputs definitions do not use Zod optional properties or records", async () => {
  const source = await readFile(new URL("../server/ai.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.optional\(/);
  assert.doesNotMatch(source, /z\.record\(/);
});
