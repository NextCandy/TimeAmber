import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  buildThemeCookie,
  isCrossSiteIframe,
  migrateThemePreference,
  type ThemePreference,
} from "@/lib/theme";

function persistThemePreference(preference: ThemePreference) {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  document.cookie = buildThemeCookie(preference, {
    secure: window.location.protocol === "https:",
    crossSite: isCrossSiteIframe(),
  });
}

/**
 * 明暗二选一，点一下就切，没有菜单。
 * 图标表示的是**当前**主题：太阳＝正在用日间，月亮＝正在用夜间。
 */
export function ThemeToggle({ initialPreference }: { initialPreference: ThemePreference }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  useEffect(() => {
    // bootstrap 脚本可能刚把旧的 "system" 折算成了固定值，以它为准。
    const bootstrapped = migrateThemePreference(
      document.documentElement.dataset.themePreference,
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const active = bootstrapped ?? preference;
    // 每次挂载或偏好变化都续期一年，保持 Cookie 滑动过期。
    persistThemePreference(active);
    if (active !== preference) setPreference(active);
  }, [preference]);

  const isDark = preference === "dark";
  const label = isDark ? "夜间模式" : "日间模式";

  const toggle = () => {
    const next: ThemePreference = isDark ? "light" : "dark";
    setPreference(next);
    applyThemePreference(next);
    persistThemePreference(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${label}，点击切换`}
      title={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
