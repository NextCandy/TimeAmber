import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTHOR_PROFILE,
  getAuthorInitial,
  resolveAuthorProfile,
} from "../src/lib/author-profile";

test("旧配置会补齐默认个人资料", () => {
  assert.deepEqual(resolveAuthorProfile({}), DEFAULT_AUTHOR_PROFILE);
});

test("个人资料会清理首尾空白，同时允许隐藏简介", () => {
  assert.deepEqual(
    resolveAuthorProfile({
      authorName: "  小王  ",
      authorAvatar: "  /avatar.png  ",
      authorBio: "   ",
    }),
    {
      authorName: "小王",
      authorAvatar: "/avatar.png",
      authorBio: "",
    },
  );
});

test("头像占位符支持中文和空用户名", () => {
  assert.equal(getAuthorInitial(" 小王 "), "小");
  assert.equal(getAuthorInitial(""), "T");
});
