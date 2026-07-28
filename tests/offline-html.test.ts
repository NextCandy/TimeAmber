import assert from "node:assert/strict";
import test from "node:test";

import { getOfflineHtmlUrl } from "../src/lib/offline-html";

test("解析旧剪藏正文中的站内 HTML 地址", () => {
  assert.equal(
    getOfflineHtmlUrl(
      "<!-- timeamber-offline-html:v1 source:vsdo id:616 url:/cdn/vsdo-html/616/index.html -->",
    ),
    "/cdn/vsdo-html/616/index.html",
  );
});

test("拒绝普通正文和站外地址", () => {
  assert.equal(getOfflineHtmlUrl("普通 Markdown 正文"), undefined);
  assert.equal(
    getOfflineHtmlUrl(
      "<!-- timeamber-offline-html:v1 source:vsdo id:616 url:https://example.com/x.html -->",
    ),
    undefined,
  );
});
