import assert from "node:assert/strict";
import test from "node:test";

import { completeAskTimeAmber, getAIProviderStatus } from "../src/lib/ask-provider.server";

const ORIGINAL_ENV = {
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("reports a graceful unconfigured provider state", () => {
  delete process.env.AI_BASE_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  try {
    const status = getAIProviderStatus();
    assert.equal(status.configured, false);
    assert.deepEqual(status.missing.sort(), ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"]);
  } finally {
    restoreEnvironment();
  }
});

test("uses an OpenAI-compatible chat completion endpoint server-side", async () => {
  process.env.AI_BASE_URL = "https://ai.example.test/v1";
  process.env.AI_API_KEY = "test-only-key";
  process.env.AI_MODEL = "test-model";
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let authorization = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "仅依据资料回答。[S1]" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const answer = await completeAskTimeAmber({
      question: "如何部署？",
      evidence: '<source id="S1"><content>使用反向代理。</content></source>',
    });
    assert.equal(answer, "仅依据资料回答。[S1]");
    assert.equal(requestUrl, "https://ai.example.test/v1/chat/completions");
    assert.equal(authorization, "Bearer test-only-key");
    assert.equal(requestBody.model, "test-model");
    assert.equal(requestBody.stream, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});
