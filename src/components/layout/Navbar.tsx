import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Menu, Rss, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SearchDialog } from "./SearchDialog";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemePreference } from "@/lib/theme";

const NAV = [
  { to: "/", label: "首页" },
  { to: "/archive", label: "归档" },
  { to: "/categories", label: "分类" },
  { to: "/about", label: "关于" },
  { to: "/friends", label: "友链" },
] as const;

const ASK_NAV = { to: "/ask", label: "问一问" } as const;

export function Navbar({ initialThemePreference }: { initialThemePreference: ThemePreference }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { settings } = useAdminStore();

  // /ask 默认不对外，开关关着时连导航入口都不出现。
  const navItems = settings.askPublicEnabled ? [...NAV, ASK_NAV] : NAV;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 从手机横转桌面时关闭抽屉，避免 portal 遮罩残留在桌面布局上。
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
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
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <header className="sticky top-0 z-40 w-full px-3 pt-3 sm:px-4 sm:pt-4">
      {/* 悬浮胶囊外壳：滚动时毛玻璃 + 发丝边框 + 轻阴影。
          内层保持三栏等分栅格，导航始终居中。 */}
      <div
        className={`mx-auto grid h-[64px] max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border px-4 transition-all duration-300 sm:px-6 ${
          scrolled
            ? "border-border/60 bg-background/75 shadow-[0_8px_30px_-12px_color-mix(in_oklch,var(--foreground)_18%,transparent)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <Link to="/" className="group col-start-1 flex items-center gap-2.5 justify-self-start">
          <img src={BRAND_ICON} alt="" className="h-8 w-8 object-contain drop-shadow-brand-sm" />
          <span className="font-brand text-2xl leading-none font-normal tracking-tight">
            TimeAmber
          </span>
        </Link>

        <nav className="col-start-2 hidden items-center gap-1 justify-self-center md:flex">
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

        <div className="col-start-3 hidden items-center gap-1 justify-self-end md:flex">
          <button
            type="button"
            aria-label="搜索（⌘K）"
            title="搜索（⌘K / Ctrl+K）"
            onClick={() => setSearchOpen(true)}
            className={iconButton}
          >
            <Search className="h-4 w-4" />
          </button>
          <a href="/rss.xml" aria-label="RSS 订阅" title="RSS 订阅" className={iconButton}>
            <Rss className="h-4 w-4" />
          </a>
          <Link to="/admin" aria-label="后台" title="后台" className={iconButton}>
            <LayoutDashboard className="h-4 w-4" />
          </Link>
          <ThemeToggle initialPreference={initialThemePreference} />
        </div>

        <div className="col-start-3 justify-self-end md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="打开导航菜单"
                title="导航菜单"
                className={iconButton}
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="flex w-[min(88vw,22rem)] flex-col border-l border-border bg-background p-0 transition-transform duration-300 ease-out data-[state=closed]:duration-300 data-[state=open]:duration-300"
            >
              <SheetHeader className="border-b border-border px-6 py-5 text-left">
                <SheetTitle className="font-brand text-2xl font-normal">TimeAmber</SheetTitle>
                <SheetDescription className="sr-only">移动端站点导航</SheetDescription>
              </SheetHeader>

              <nav aria-label="移动端主导航" className="flex flex-col px-4 py-5">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="border-l-2 border-transparent px-4 py-3 text-base text-muted-foreground transition-colors hover:border-accent-amber/50 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    activeOptions={{ exact: true }}
                    activeProps={{
                      className:
                        "border-l-2 border-accent-amber bg-accent-amber-soft px-4 py-3 text-base font-medium text-foreground",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-auto border-t border-border px-4 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSearchOpen(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Search className="h-4 w-4" />
                  搜索
                </button>

                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  后台
                </Link>

                <a
                  href="/rss.xml"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Rss className="h-4 w-4" />
                  RSS 订阅
                </a>

                <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-muted-foreground">
                  <span>切换主题</span>
                  <ThemeToggle initialPreference={initialThemePreference} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
