export const THEME_STORAGE_KEY = "ta-theme";
export const THEME_COOKIE_NAME = "ta-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// 只有明暗两档。曾经还有 "system"，但一个图标要同时表达「当前是什么」和
// 「跟不跟随系统」，怎么画都含混，索引不如让图标直接等于当前主题。
export const THEME_PREFERENCES = ["light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
/** 去掉 system 之后偏好就是最终主题，别名留着是为了不动调用方。 */
export type ResolvedTheme = ThemePreference;

// 参考站默认是明亮暖色；已有 Cookie/localStorage 偏好仍然优先保留。
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export function parseThemePreference(value: unknown): ThemePreference | null {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : null;
}

/**
 * 老版本在 Cookie / localStorage 里存过 "system"。读到它时按当时的系统偏好
 * 折算成固定的一档，这样从旧版过来的读者不会被硬切成默认深色。
 */
export function migrateThemePreference(
  value: unknown,
  systemPrefersDark: boolean,
): ThemePreference | null {
  if (value === "system") return systemPrefersDark ? "dark" : "light";
  return parseThemePreference(value);
}

export function readThemePreferenceFromCookie(cookieHeader?: string | null): ThemePreference {
  if (!cookieHeader) return DEFAULT_THEME_PREFERENCE;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== THEME_COOKIE_NAME) continue;
    try {
      return (
        parseThemePreference(decodeURIComponent(rawValue.join("="))) ?? DEFAULT_THEME_PREFERENCE
      );
    } catch {
      return DEFAULT_THEME_PREFERENCE;
    }
  }

  return DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference;
}

type ThemeCookieOptions = {
  secure?: boolean;
  crossSite?: boolean;
  now?: Date;
};

export function buildThemeCookie(
  preference: ThemePreference,
  { secure = false, crossSite = false, now = new Date() }: ThemeCookieOptions = {},
): string {
  const expires = new Date(now.getTime() + THEME_COOKIE_MAX_AGE * 1000);
  const parts = [
    `${THEME_COOKIE_NAME}=${encodeURIComponent(preference)}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE}`,
    `Expires=${expires.toUTCString()}`,
    `SameSite=${crossSite ? "None" : "Lax"}`,
  ];

  if (secure || crossSite) parts.push("Secure");
  return parts.join("; ");
}

export function isCrossSiteIframe(): boolean {
  if (typeof window === "undefined" || window.top === window.self) return false;
  try {
    return window.top?.location.origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const root = document.documentElement;
  root.classList.toggle("dark", preference === "dark");
  root.classList.toggle("light", preference !== "dark");
  root.dataset.themePreference = preference;
  return preference;
}

// 在样式表和 React 水合前应用主题，避免首屏先闪一下默认深色。
// 旧版本存过的 "system" 在这里就地折算成固定的一档（见 migrateThemePreference）。
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const read = (value) => {
      if (value === "light" || value === "dark") return value;
      if (value === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      return null;
    };
    const cookiePart = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("${THEME_COOKIE_NAME}="));
    const cookieValue = cookiePart ? decodeURIComponent(cookiePart.slice(cookiePart.indexOf("=") + 1)) : null;
    const preference = read(cookieValue) || read(localStorage.getItem("${THEME_STORAGE_KEY}")) || "${DEFAULT_THEME_PREFERENCE}";
    document.documentElement.classList.toggle("dark", preference === "dark");
    document.documentElement.classList.toggle("light", preference !== "dark");
    document.documentElement.dataset.themePreference = preference;
  } catch {}
})();`;
