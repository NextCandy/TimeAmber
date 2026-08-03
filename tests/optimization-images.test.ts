import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/lib/markdown.server";

test("markdown images keep a lazy loading contract and intrinsic dimensions", async () => {
  const html = await renderMarkdown("![示例图](https://cdn.example.com/example.png)");

  assert.match(html, /<img[^>]+alt=\"示例图\"/);
  assert.match(html, /loading=\"lazy\"/);
  assert.match(html, /decoding=\"async\"/);
  assert.match(html, /width=\"1200\"/);
  assert.match(html, /height=\"675\"/);
});
