import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  buildThemeCookie,
  isCrossSiteIframe,
  parseThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const THEME_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Laptop },
] as const;

function persistThemePreference(preference: ThemePreference) {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  document.cookie = buildThemeCookie(preference, {
    secure: window.location.protocol === "https:",
    crossSite: isCrossSiteIframe(),
  });
}

export function ThemeToggle({ initialPreference }: { initialPreference: ThemePreference }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  useEffect(() => {
    const bootstrapped = parseThemePreference(document.documentElement.dataset.themePreference);
    const active = bootstrapped ?? preference;
    // 每次页面挂载或偏好变化都续期一年，保持 Cookie 滑动过期。
    persistThemePreference(active);
    if (active !== preference) setPreference(active);
  }, [preference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (preference === "system") applyThemePreference("system", media.matches);
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [preference]);

  const selectTheme = (value: string) => {
    const next = parseThemePreference(value);
    if (!next) return;

    setPreference(next);
    applyThemePreference(next);
    persistThemePreference(next);
  };

  const current = THEME_OPTIONS.find((option) => option.value === preference) ?? THEME_OPTIONS[1];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`主题：${current.label}`}
          title={`主题：${current.label}`}
          className="inline-flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CurrentIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={preference} onValueChange={selectTheme}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className="h-4 w-4" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
