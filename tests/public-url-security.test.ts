import assert from "node:assert/strict";
import test from "node:test";

import { safePublicHref } from "../src/lib/public-site-settings";

test("拒绝会被浏览器规范化为外部地址的反斜杠路径", () => {
  assert.equal(safePublicHref("/\\evil.example"), undefined);
  assert.equal(safePublicHref("\\\\evil.example"), undefined);
  assert.equal(safePublicHref("javascript:alert(1)"), undefined);
});
