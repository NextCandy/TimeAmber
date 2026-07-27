export const THEME_STORAGE_KEY = "ta-theme";
export const THEME_COOKIE_NAME = "ta-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

export function parseThemePreference(value: unknown): ThemePreference | null {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : null;
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

export function resolveTheme(preference: ThemePreference, systemPrefersDark = true): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
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

export function applyThemePreference(
  preference: ThemePreference,
  systemPrefersDark = typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.dataset.themePreference = preference;
  return resolved;
}

// 在样式表和 React 水合前应用主题，system 模式也不会先闪成默认深色。
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const valid = (value) => value === "light" || value === "dark" || value === "system";
    const cookiePart = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("${THEME_COOKIE_NAME}="));
    const cookieValue = cookiePart ? decodeURIComponent(cookiePart.slice(cookiePart.indexOf("=") + 1)) : null;
    const storedValue = localStorage.getItem("${THEME_STORAGE_KEY}");
    const preference = valid(cookieValue) ? cookieValue : valid(storedValue) ? storedValue : "${DEFAULT_THEME_PREFERENCE}";
    const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.dataset.themePreference = preference;
  } catch {}
})();`;
