import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import { SearchDialog } from "./SearchDialog";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemePreference } from "@/lib/theme";

const NAV = [
  { to: "/", label: "首页" },
  { to: "/categories", label: "分类" },
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

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <img src={BRAND_ICON} alt="" className="h-8 w-8 object-contain drop-shadow-brand-sm" />
          <span className="font-brand text-2xl font-normal leading-none tracking-tight">
            TimeAmber
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeOptions={{ exact: true }}
              activeProps={{
                className: "rounded-md px-3 py-1.5 text-sm text-foreground bg-accent",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            to="/admin"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            后台
          </Link>
          <button
            type="button"
            aria-label="搜索（⌘K）"
            title="搜索（⌘K / Ctrl+K）"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-[20px] bg-[var(--surface-deep)] px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-56"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden truncate text-sm sm:inline">搜索文章、标签…</span>
          </button>
          <ThemeToggle initialPreference={initialThemePreference} />
        </div>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
