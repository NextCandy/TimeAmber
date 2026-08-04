import assert from "node:assert/strict";
import test from "node:test";

import { HOME_PAGE_SIZE, homePageMeta, normalizeHomePage } from "../src/lib/home.functions";

test("首页页码只接受有限的正整数", () => {
  assert.equal(normalizeHomePage(undefined), 1);
  assert.equal(normalizeHomePage(""), 1);
  assert.equal(normalizeHomePage("2"), 2);
  assert.equal(normalizeHomePage(3), 3);
  assert.equal(normalizeHomePage(0), 1);
  assert.equal(normalizeHomePage(-1), 1);
  assert.equal(normalizeHomePage(1.5), 1);
  assert.equal(normalizeHomePage("not-a-page"), 1);
  assert.equal(normalizeHomePage(10_001), 1);
});

test("首页分页元数据覆盖空集、边界页和超出范围页码", () => {
  assert.deepEqual(homePageMeta(1, 0), {
    page: 1,
    pageSize: HOME_PAGE_SIZE,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  assert.equal(homePageMeta(1, 5).totalPages, 1);
  assert.equal(homePageMeta(1, 6).totalPages, 2);
  assert.equal(homePageMeta(2, 6).page, 2);
  assert.equal(homePageMeta(1, 11).hasNextPage, true);
  assert.equal(homePageMeta(999, 11).page, 3);
  assert.equal(homePageMeta(2, -1).totalPages, 1);
});
