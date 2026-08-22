import express from "express";

const DEFAULT_MAX_IDEA_CHARS = 8000;
const DEFAULT_JSON_BODY_LIMIT = "256kb";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeBodyLimit(value) {
  const normalized = String(value ?? DEFAULT_JSON_BODY_LIMIT).trim().toLowerCase();
  return /^\d+(?:b|kb|mb)$/.test(normalized) ? normalized : DEFAULT_JSON_BODY_LIMIT;
}

export function requestSafetyConfig(env = process.env) {
  return {
    maxIdeaChars: positiveInteger(env.AI_MAX_IDEA_CHARS, DEFAULT_MAX_IDEA_CHARS),
    jsonBodyLimit: safeBodyLimit(env.HTTP_JSON_BODY_LIMIT),
  };
}

export class RequestInputError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RequestInputError";
    this.status = status;
    this.code = code;
  }
}

export function validateRequirementsInput(operation, body, config = requestSafetyConfig()) {
  const idea = operation === "analyze" ? body?.idea : body?.context?.idea;
  if (operation === "analyze" && typeof idea !== "string") throw new RequestInputError(400, "AI_IDEA_REQUIRED", "作りたい内容を入力してください。");
  if (idea == null) return;
  if (typeof idea !== "string") throw new RequestInputError(400, "AI_IDEA_INVALID", "入力内容を確認してください。");
  if (idea.length > config.maxIdeaChars) {
    throw new RequestInputError(413, "AI_IDEA_TOO_LARGE", `入力内容が長すぎます。${config.maxIdeaChars}文字以内に短くしてお試しください。`);
  }
}

export function createJsonBodyParser(limit) {
  return express.json({ limit });
}

export function jsonBodyLimitErrorHandler(error, _req, res, next) {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    return res.status(413).json({ error: { code: "HTTP_JSON_BODY_TOO_LARGE", message: "送信内容が大きすぎます。内容を短くしてお試しください。" } });
  }
  return next(error);
}

