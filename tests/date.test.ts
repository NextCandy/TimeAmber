import assert from "node:assert/strict";
import test from "node:test";

import { formatChineseDate, formatDateKey } from "../src/lib/date";

test("文章日期固定使用上海时区，避免服务端与浏览器水合不一致", () => {
  const lateUtc = "2026-07-26T23:10:43.000Z";
  assert.equal(formatDateKey(lateUtc), "2026-07-27");
  assert.equal(formatChineseDate(lateUtc), "2026 年 7 月 27 日");
});

test("无效日期保持可预测的降级文本", () => {
  assert.equal(formatDateKey("not-a-date"), "not-a-date");
  assert.equal(formatChineseDate("not-a-date"), "not-a-date");
});
