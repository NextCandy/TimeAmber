import { z } from "zod";

export const PUBLIC_MODULE_IDS = [
  "profile",
  "navigationGrid",
  "latestPosts",
  "siteStats",
  "publishCalendar",
  "popularCategories",
  "popularTags",
  "friendsEntry",
] as const;

export type PublicModuleId = (typeof PUBLIC_MODULE_IDS)[number];

const httpOrPath = z
  .string()
  .trim()
  .max(1200)
  .refine(
    (value) =>
      !value || (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value),
    "只允许站内路径或 http(s) 地址",
  );

const imageSource = httpOrPath;
const colorValue = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{3,8}$/i, "颜色必须是十六进制格式，例如 #c98b32");

const navItemSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(40),
  href: httpOrPath,
  icon: z.string().trim().max(40).default("Compass"),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(100).default(0),
  openInNewTab: z.boolean().default(false),
});

const socialLinkSchema = z.object({
  id: z.string().trim().min(1).max(60),
  type: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().max(500),
  icon: z.string().trim().max(40).default("Link"),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(100).default(0),
  copyValue: z.boolean().default(false),
  openInNewTab: z.boolean().default(true),
});

const audioSource = z
  .string()
  .trim()
  .min(1, "音乐地址不能为空")
  .max(1200)
  .refine(
    (value) =>
      ![...value].some((character) => character.charCodeAt(0) < 32) &&
      !value.includes("\\") &&
      ((value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value)),
    "只允许站内路径或 http(s) 音频地址",
  );

const musicTrackSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().max(80),
  subtitle: z.string().trim().max(160),
  url: audioSource,
  coverUrl: imageSource,
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(100).default(0),
});

/**
 * Re-check user-managed URLs at render time. Settings are validated on save,
 * but older or externally restored settings can still reach the public UI.
 */
export function safePublicHref(
  value: unknown,
  options: { allowMailtoTel?: boolean } = {},
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].some((character) => character.charCodeAt(0) < 32)) return undefined;
  // Browsers normalize backslashes in URL-like strings. Reject them before
  // accepting a path so values such as /\\evil.example cannot escape to an
  // external origin after navigation.
  if (trimmed.includes("\\")) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const url = new URL(trimmed);
    const allowedProtocols = options.allowMailtoTel
      ? ["http:", "https:", "mailto:", "tel:"]
      : ["http:", "https:"];
    return allowedProtocols.includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const moduleSchema = z.object({
  id: z.enum(PUBLIC_MODULE_IDS),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(100).default(0),
});

export const publicSiteSettingsSchema = z.object({
  version: z.number().int().min(1).max(20).default(1),
  identity: z.object({
    siteName: z.string().trim().min(1).max(80),
    siteNameZh: z.string().trim().max(80),
    navTitle: z.string().trim().min(1).max(80),
    navSuffix: z.string().trim().max(12),
    slogan: z.string().trim().max(160),
    description: z.string().trim().max(500),
    avatarUrl: imageSource,
    logoUrl: imageSource,
    faviconUrl: imageSource,
    defaultPostCoverUrl: imageSource,
  }),
  homepage: z.object({
    eyebrow: z.string().trim().max(80),
    welcomeTitle: z.string().trim().max(120),
    welcomeDescription: z.string().trim().max(500),
    searchPlaceholder: z.string().trim().max(100),
    articleSectionTitle: z.string().trim().max(80),
    articleSectionSubtitle: z.string().trim().max(200),
    archiveButtonText: z.string().trim().max(80),
    statsTitle: z.string().trim().max(80),
    calendarTitle: z.string().trim().max(80),
    categoryTitle: z.string().trim().max(80),
    tagTitle: z.string().trim().max(80),
    friendsTitle: z.string().trim().max(80),
    friendsDescription: z.string().trim().max(200),
  }),
  appearance: z.object({
    backgroundMode: z.enum(["image", "gradient"]),
    lightBackgroundImages: z.array(imageSource).max(12),
    darkBackgroundImages: z.array(imageSource).max(12),
    lightGradientColors: z.array(colorValue).min(2).max(4),
    darkGradientColors: z.array(colorValue).min(2).max(4),
    autoRotate: z.boolean(),
    backgroundIntervalSeconds: z.number().int().min(12).max(3600),
    backgroundOverlayOpacity: z.number().min(0).max(0.8),
    glassBlurStrength: z.number().int().min(0).max(32),
    cardOpacity: z.number().min(0.35).max(0.98),
  }),
  statusMessages: z.object({
    enabled: z.boolean(),
    messages: z.array(z.string().trim().min(2).max(40)).max(12),
    density: z.enum(["low", "medium"]),
    animationSpeed: z.enum(["slow", "normal"]),
  }),
  navigation: z.object({
    items: z
      .array(navItemSchema)
      .max(12)
      .superRefine((items, ctx) => {
        const ids = new Set<string>();
        for (const [index, item] of items.entries()) {
          if (ids.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "id"],
              message: "导航 ID 不能重复",
            });
          }
          ids.add(item.id);
        }
      }),
  }),
  socialLinks: z.array(socialLinkSchema).max(12),
  music: z.object({
    enabled: z.boolean(),
    providerLabel: z.string().trim().min(1).max(40),
    activeTrackId: z.string().trim().max(80),
    playlist: z.array(musicTrackSchema).max(30),
  }),
  footer: z.object({
    buildDate: z
      .string()
      .trim()
      .refine(
        (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "建站日期格式应为 YYYY-MM-DD",
      ),
    copyrightText: z.string().trim().max(160),
    icpName: z.string().trim().max(120),
    icpUrl: httpOrPath,
    customText: z.string().trim().max(240),
    showCurrentTime: z.boolean(),
    showUptime: z.boolean(),
    showTechBadges: z.boolean(),
    techBadges: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60),
          name: z.string().trim().min(1).max(60),
          enabled: z.boolean().default(true),
          order: z.number().int().min(0).max(100).default(0),
        }),
      )
      .max(12),
  }),
  about: z.object({
    enabled: z.boolean(),
    title: z.string().trim().max(120),
    summary: z.string().trim().max(300),
    content: z.string().max(20_000),
    imageUrl: imageSource,
  }),
  modules: z
    .array(moduleSchema)
    .length(PUBLIC_MODULE_IDS.length)
    .superRefine((items, ctx) => {
      const ids = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (ids.has(item.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "id"],
            message: "首页模块不能重复",
          });
        }
        ids.add(item.id);
      }
    }),
});

export type PublicSiteConfig = z.infer<typeof publicSiteSettingsSchema>;

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
  version: 1,
  identity: {
    siteName: "TimeAmber",
    siteNameZh: "时光琥珀",
    navTitle: "TimeAmber",
    navSuffix: "·",
    slogan: "时光成珀，字字如初",
    description: "一个关于剪藏、自建服务与 AI Agent 实践的中文博客。",
    avatarUrl: "/brand/author-avatar.webp",
    logoUrl: "/brand/timeamber-logo.png",
    faviconUrl: "/brand/favicon.ico",
    defaultPostCoverUrl: "/brand/timeamber-default-cover.png",
  },
  homepage: {
    eyebrow: "中文独立博客",
    welcomeTitle: "时光成珀，字字如初",
    welcomeDescription: "一个关于剪藏、自建服务与 AI Agent 实践的中文博客。",
    searchPlaceholder: "搜索文章、分类、标签…",
    articleSectionTitle: "最新文章",
    articleSectionSubtitle: "从最近的记录开始，沿着分类和标签继续阅读。",
    archiveButtonText: "查看全部归档",
    statsTitle: "站点概览",
    calendarTitle: "发布日历",
    categoryTitle: "热门分类",
    tagTitle: "常用标签",
    friendsTitle: "友链",
    friendsDescription: "一些值得长期关注的人和站点。",
  },
  appearance: {
    backgroundMode: "gradient",
    lightBackgroundImages: [],
    darkBackgroundImages: [],
    lightGradientColors: ["#f8f2e8", "#eadcc8", "#cdb58e"],
    darkGradientColors: ["#2d2118", "#171311", "#0d0b0a"],
    autoRotate: true,
    backgroundIntervalSeconds: 45,
    backgroundOverlayOpacity: 0.24,
    glassBlurStrength: 18,
    cardOpacity: 0.78,
  },
  statusMessages: {
    enabled: true,
    messages: ["时光成珀，字字如初", "正在整理剪藏", "记录值得收藏的内容", "自建服务持续维护"],
    density: "low",
    animationSpeed: "slow",
  },
  navigation: {
    items: [
      {
        id: "home",
        label: "首页",
        href: "/",
        icon: "Home",
        enabled: true,
        order: 0,
        openInNewTab: false,
      },
      {
        id: "archive",
        label: "归档",
        href: "/archive",
        icon: "Archive",
        enabled: true,
        order: 1,
        openInNewTab: false,
      },
      {
        id: "categories",
        label: "分类",
        href: "/categories",
        icon: "FolderTree",
        enabled: true,
        order: 2,
        openInNewTab: false,
      },
      {
        id: "friends",
        label: "友链",
        href: "/friends",
        icon: "Users",
        enabled: true,
        order: 3,
        openInNewTab: false,
      },
      {
        id: "about",
        label: "关于",
        href: "/about",
        icon: "Info",
        enabled: true,
        order: 4,
        openInNewTab: false,
      },
    ],
  },
  socialLinks: [
    {
      id: "github",
      type: "github",
      label: "GitHub",
      value: "https://github.com/NextCandy/TimeAmber",
      icon: "Github",
      enabled: true,
      order: 0,
      copyValue: false,
      openInNewTab: true,
    },
    {
      id: "email",
      type: "email",
      label: "邮箱",
      value: "hi@timeamber.com",
      icon: "Mail",
      enabled: true,
      order: 1,
      copyValue: false,
      openInNewTab: false,
    },
  ],
  music: {
    enabled: true,
    providerLabel: "Cloud Music",
    activeTrackId: "",
    playlist: [],
  },
  footer: {
    buildDate: "",
    copyrightText: "",
    icpName: "",
    icpUrl: "",
    customText: "",
    showCurrentTime: true,
    showUptime: false,
    showTechBadges: true,
    techBadges: [
      { id: "tanstack", name: "TanStack Start", enabled: true, order: 0 },
      { id: "supabase", name: "Supabase", enabled: true, order: 1 },
    ],
  },
  about: {
    enabled: true,
    title: "关于 TimeAmber",
    summary: "一个围绕写作、剪藏、归档与自建服务组织起来的中文内容系统。",
    content: "",
    imageUrl: "/brand/author-avatar.webp",
  },
  modules: PUBLIC_MODULE_IDS.map((id, order) => ({ id, enabled: true, order })),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, ...overrides: unknown[]): T {
  let result: unknown = base;
  for (const override of overrides) {
    if (!isRecord(result) || !isRecord(override)) {
      if (override !== undefined) result = override;
      continue;
    }
    const next: Record<string, unknown> = { ...result };
    for (const [key, value] of Object.entries(override)) {
      next[key] = isRecord(next[key]) && isRecord(value) ? deepMerge(next[key], value) : value;
    }
    result = next;
  }
  return result as T;
}

function legacyProjection(value: Record<string, unknown>) {
  const siteName = typeof value.siteTitle === "string" ? value.siteTitle : undefined;
  const siteNameZh = typeof value.siteTagline === "string" ? value.siteTagline : undefined;
  const description = typeof value.siteDescription === "string" ? value.siteDescription : undefined;
  const avatar = typeof value.authorAvatar === "string" ? value.authorAvatar : undefined;
  const github = typeof value.contactGithub === "string" ? value.contactGithub : undefined;
  const email = typeof value.contactEmail === "string" ? value.contactEmail : undefined;
  const aboutIntro = typeof value.aboutIntro === "string" ? value.aboutIntro : undefined;
  const legacySocial = DEFAULT_PUBLIC_SITE_CONFIG.socialLinks.map((item) => {
    if (item.id === "github" && github !== undefined) return { ...item, value: github };
    if (item.id === "email" && email !== undefined) return { ...item, value: email };
    return item;
  });
  const identity: Record<string, unknown> = {};
  if (siteName !== undefined) {
    identity.siteName = siteName;
    identity.navTitle = siteName;
  }
  if (siteNameZh !== undefined) identity.siteNameZh = siteNameZh;
  if (description !== undefined) identity.description = description;
  if (avatar !== undefined) identity.avatarUrl = avatar;
  if (typeof value.aboutQuote === "string" && value.aboutQuote) identity.slogan = value.aboutQuote;

  const homepage = description === undefined ? {} : { welcomeDescription: description };
  const about: Record<string, unknown> = {};
  if (description !== undefined) about.summary = description;
  if (aboutIntro !== undefined) about.content = aboutIntro;

  return { identity, homepage, socialLinks: legacySocial, about };
}

/** 将旧版 site 设置与 publicSite 配置深度合并，保证升级后不丢现有品牌字段。 */
export function normalizePublicSiteConfig(value: unknown): PublicSiteConfig {
  const source = isRecord(value) ? value : {};
  const nested = isRecord(source.publicSite) ? source.publicSite : source;
  const candidate = deepMerge(DEFAULT_PUBLIC_SITE_CONFIG, legacyProjection(source), nested);
  const parsed = publicSiteSettingsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_PUBLIC_SITE_CONFIG;
}

export function sortedModules(config: PublicSiteConfig): PublicSiteConfig["modules"] {
  return [...config.modules].sort((a, b) => a.order - b.order);
}

export function sortedNavigation(config: PublicSiteConfig) {
  return config.navigation.items
    .filter((item) => item.enabled && item.href !== "/rss.xml")
    .sort((a, b) => a.order - b.order);
}

export function sortedSocialLinks(config: PublicSiteConfig) {
  return config.socialLinks
    .filter((item) => item.enabled && item.value.trim())
    .sort((a, b) => a.order - b.order);
}
