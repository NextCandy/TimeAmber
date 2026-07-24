import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSearchTerms,
  safeKnowledgeUrl,
  sanitizeAIAnswer,
  selectEvidence,
} from "../src/lib/ask-core";

test("extracts useful terms from the suggested Chinese questions", () => {
  assert.deepEqual(buildSearchTerms("我以前保存过哪些关于 Cloudflare 的内容？"), ["cloudflare"]);
  assert.deepEqual(buildSearchTerms("总结我收藏的自托管 AI Agent 相关文章。"), [
    "ai",
    "agent",
    "自托管",
  ]);
  assert.deepEqual(buildSearchTerms("我以前是怎么部署 Hermes Agent 的？"), [
    "hermes",
    "agent",
    "部署",
  ]);
  assert.deepEqual(buildSearchTerms("找出我过去关于域名管理的文章和收藏。"), ["域名管理"]);
});

test("selects matching evidence without returning an entire long document", () => {
  const body = [
    "这是一段与问题无关的开场。".repeat(80),
    "Hermes Agent 部署时使用 Docker Compose，并把配置保存在 NAS。",
    "这是另一段无关内容。".repeat(80),
  ].join("\n\n");
  const evidence = selectEvidence(body, ["hermes", "部署"], 400);
  assert.match(evidence, /Hermes Agent/);
  assert.ok(evidence.length <= 400);
});

test("only allows internal paths and HTTP links as source URLs", () => {
  assert.equal(safeKnowledgeUrl("/posts/example"), "/posts/example");
  assert.equal(safeKnowledgeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeKnowledgeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeKnowledgeUrl("//evil.example/path"), undefined);
});

test("removes citations for sources that were not retrieved", () => {
  assert.equal(
    sanitizeAIAnswer("可确认部署步骤 [S1]，但另一个说法 [S9] 没有依据。", 2),
    "可确认部署步骤 [S1]，但另一个说法  没有依据。",
  );
});
