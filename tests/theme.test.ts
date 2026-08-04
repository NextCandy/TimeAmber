import assert from "node:assert/strict";
import test from "node:test";
import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COOKIE_MAX_AGE,
  buildThemeCookie,
  migrateThemePreference,
  parseThemePreference,
  readThemePreferenceFromCookie,
  resolveTheme,
} from "../src/lib/theme";

test("只接受明暗两档，system 已不再是合法偏好", () => {
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("system"), null);
  assert.equal(parseThemePreference("amber"), null);
  assert.equal(parseThemePreference(undefined), null);
});

test("从 Cookie 读取主题，非法值回退到默认亮色", () => {
  assert.equal(readThemePreferenceFromCookie("foo=1; ta-theme=light; bar=2"), "light");
  assert.equal(readThemePreferenceFromCookie("ta-theme=unknown"), "light");
  assert.equal(readThemePreferenceFromCookie(null), "light");
  // 服务端读不到系统偏好，旧的 system 只能落到默认值；客户端 bootstrap 会再折算一次
  assert.equal(readThemePreferenceFromCookie("ta-theme=system"), "light");
});

test("旧的 system 偏好按当时的系统设置折算成固定一档", () => {
  assert.equal(migrateThemePreference("system", true), "dark");
  assert.equal(migrateThemePreference("system", false), "light");
  assert.equal(migrateThemePreference("light", true), "light");
  assert.equal(migrateThemePreference("nonsense", true), null);
});

test("偏好即最终主题", () => {
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("light"), "light");
});

test("普通主题 Cookie 使用一年滑动过期与 SameSite=Lax", () => {
  const cookie = buildThemeCookie("light", {
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.match(cookie, /^ta-theme=light; Path=\//);
  assert.match(cookie, new RegExp(`Max-Age=${THEME_COOKIE_MAX_AGE}`));
  assert.match(cookie, /Expires=Fri, 01 Jan 2027 00:00:00 GMT/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /HttpOnly/);
});

test("跨站 iframe Cookie 自动使用 SameSite=None 和 Secure", () => {
  const cookie = buildThemeCookie("dark", { crossSite: true });
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /; Secure$/);
});

test("首屏脚本不包含可提前结束 script 标签的内容", () => {
  assert.doesNotMatch(THEME_BOOTSTRAP_SCRIPT.toLowerCase(), /<\/script/);
});
