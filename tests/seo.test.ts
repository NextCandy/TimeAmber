import assert from "node:assert/strict";
import test from "node:test";

import { categoryRedirectTarget, SITE_JSON_LD } from "../src/lib/seo";

test("旧语义分类映射到剪藏并保留未知分类", () => {
  assert.equal(categoryRedirectTarget("VS.DO 剪藏"), "剪藏");
  assert.equal(categoryRedirectTarget("VS.DO"), "剪藏");
  assert.equal(categoryRedirectTarget("树洞"), "剪藏");
  assert.equal(categoryRedirectTarget("未配置分类"), null);
  assert.equal(categoryRedirectTarget(undefined), null);
});

test("站点 JSON-LD 同时声明 WebSite 与 Organization", () => {
  assert.equal(SITE_JSON_LD["@context"], "https://schema.org");
  assert.deepEqual(
    SITE_JSON_LD["@graph"].map((item) => item["@type"]),
    ["WebSite", "Organization"],
  );
  assert.ok(SITE_JSON_LD["@graph"].every((item) => item.url.startsWith("https://")));
});
