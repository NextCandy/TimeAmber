import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  normalizePublicSiteConfig,
  publicSiteSettingsSchema,
} from "../src/lib/public-site-settings";

test("旧版站点字段会映射到公开站点默认配置", () => {
  const config = normalizePublicSiteConfig({
    siteTitle: "我的时光",
    siteTagline: "琥珀笔记",
    siteDescription: "一段公开简介",
    authorAvatar: "/media/avatar.webp",
    contactGithub: "https://github.com/example",
    contactEmail: "hello@example.com",
  });

  assert.equal(config.identity.siteName, "我的时光");
  assert.equal(config.identity.siteNameZh, "琥珀笔记");
  assert.equal(config.identity.description, "一段公开简介");
  assert.equal(config.identity.avatarUrl, "/media/avatar.webp");
  assert.equal(config.socialLinks[0]?.value, "https://github.com/example");
  assert.equal(config.socialLinks[1]?.value, "hello@example.com");
});

test("公开站点配置拒绝危险协议和重复首页模块", () => {
  const unsafe = structuredClone(DEFAULT_PUBLIC_SITE_CONFIG);
  unsafe.identity.logoUrl = "javascript:alert(1)";
  assert.equal(publicSiteSettingsSchema.safeParse(unsafe).success, false);

  const duplicate = structuredClone(DEFAULT_PUBLIC_SITE_CONFIG);
  duplicate.modules[1] = { ...duplicate.modules[0] };
  assert.equal(publicSiteSettingsSchema.safeParse(duplicate).success, false);
});

test("不完整嵌套配置会补齐可用默认值", () => {
  const config = normalizePublicSiteConfig({
    publicSite: {
      version: 1,
      identity: { siteName: "Only Name" },
    },
  });

  assert.equal(config.identity.siteName, "Only Name");
  assert.equal(
    config.homepage.searchPlaceholder,
    DEFAULT_PUBLIC_SITE_CONFIG.homepage.searchPlaceholder,
  );
  assert.equal(config.modules.length, DEFAULT_PUBLIC_SITE_CONFIG.modules.length);
});
