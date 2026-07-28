import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useAdminStore } from "@/lib/admin-store";
import { SearchDialog } from "./SearchDialog";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemePreference } from "@/lib/theme";

const NAV = [
  { to: "/", label: "首页" },
  { to: "/archive", label: "归档" },
  { to: "/about", label: "关于" },
  { to: "/friends", label: "友链" },
] as const;

const ASK_NAV = { to: "/ask", label: "问一问" } as const;

export function Navbar({ initialThemePreference }: { initialThemePreference: ThemePreference }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { settings } = useAdminStore();

  // /ask 默认不对外，开关关着时连导航入口都不出现。
  const navItems = settings.askPublicEnabled ? [...NAV, ASK_NAV] : NAV;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 全局 ⌘K / Ctrl+K 唤起搜索
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setSearchOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b border-border transition-colors duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur-xl" : "bg-background"
      }`}
    >
      {/* 三栏等分栅格：导航始终居中，不受左右两侧宽度影响 */}
      <div className="mx-auto grid h-[72px] max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        <Link to="/" className="group flex items-center gap-2.5 justify-self-start">
          <span className="brand-mark h-8 w-8" aria-hidden="true" />
          <span className="font-display text-xl leading-none font-bold tracking-[-0.02em] sm:text-2xl">
            TimeAmber
          </span>
        </Link>

        <nav className="hidden items-center gap-1 justify-self-center md:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="border-b-2 border-transparent px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary"
              activeOptions={{ exact: true }}
              activeProps={{
                className:
                  "border-b-2 border-primary px-3 py-1.5 text-sm font-semibold text-foreground",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 justify-self-end">
          <button
            type="button"
            aria-label="搜索（⌘K）"
            title="搜索（⌘K / Ctrl+K）"
            onClick={() => setSearchOpen(true)}
            className={iconButton}
          >
            <Search className="h-4 w-4" />
          </button>
          <Link to="/admin" aria-label="后台" title="后台" className={iconButton}>
            <LayoutDashboard className="h-4 w-4" />
          </Link>
          <ThemeToggle initialPreference={initialThemePreference} />
        </div>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
