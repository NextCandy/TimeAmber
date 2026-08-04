import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Menu, Rss, Search } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  sortedNavigation,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";
import type { ThemePreference } from "@/lib/theme";
import { SearchDialog } from "./SearchDialog";
import { ThemeToggle } from "./ThemeToggle";

function NavItem({
  item,
  mobile = false,
  onClick,
}: {
  item: PublicSiteConfig["navigation"]["items"][number];
  mobile?: boolean;
  onClick?: () => void;
}) {
  const className = mobile
    ? "border-l-2 border-transparent px-4 py-3 text-base text-muted-foreground transition-colors hover:border-accent-amber/50 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const activeClassName = mobile
    ? "border-l-2 border-accent-amber bg-accent-amber-soft px-4 py-3 text-base font-medium text-foreground"
    : "rounded-md bg-accent px-3 py-1.5 text-sm text-foreground";
  if (/^https?:\/\//i.test(item.href) || item.openInNewTab || item.href === "/rss.xml") {
    return (
      <a
        href={item.href}
        target={item.openInNewTab ? "_blank" : undefined}
        rel={item.openInNewTab ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={className}
      >
        {item.label}
      </a>
    );
  }
  return (
    <Link
      to={item.href as never}
      onClick={onClick}
      className={className}
      activeOptions={{ exact: true }}
      activeProps={{ className: activeClassName }}
    >
      {item.label}
    </Link>
  );
}

export function Navbar({ initialThemePreference }: { initialThemePreference: ThemePreference }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { settings } = useAdminStore();
  const config = settings.publicSite ?? DEFAULT_PUBLIC_SITE_CONFIG;
  const navItems = sortedNavigation(config);

  useEffect(() => {
    const sentinel = document.getElementById("timeamber-scroll-top");
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      const next = !entry.isIntersecting;
      setScrolled(next);
      document.documentElement.dataset.scrolled = next ? "true" : "false";
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.scrolled;
    };
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setSearchOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const iconButton =
    "press-feedback inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:outline-none";

  return (
    <header className="public-navbar sticky top-0 z-40 w-full px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className={`mx-auto grid h-[64px] max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border px-4 transition-all duration-300 sm:px-6 ${scrolled ? "border-border/60 bg-background/75 shadow-[0_8px_30px_-12px_color-mix(in_oklch,var(--foreground)_18%,transparent)] backdrop-blur-xl" : "border-transparent bg-transparent"}`}
      >
        <Link
          to="/"
          className="group col-start-1 flex min-w-0 items-center gap-2.5 justify-self-start"
        >
          <img
            src={config.identity.logoUrl || BRAND_ICON}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain drop-shadow-brand-sm"
          />
          <span className="truncate font-brand text-2xl leading-none font-normal tracking-tight">
            {config.identity.navTitle}
          </span>
        </Link>

        <nav
          aria-label="主导航"
          className="col-start-2 hidden items-center gap-1 justify-self-center md:flex"
        >
          {navItems.map((item) => (
            <NavItem key={item.id} item={item} />
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
              className="flex w-[min(88vw,22rem)] flex-col border-l border-border bg-background p-0"
            >
              <SheetHeader className="border-b border-border px-6 py-5 text-left">
                <SheetTitle className="font-brand text-2xl font-normal">
                  {config.identity.navTitle}
                </SheetTitle>
                <SheetDescription className="sr-only">移动端站点导航</SheetDescription>
              </SheetHeader>
              <nav aria-label="移动端主导航" className="flex flex-col px-4 py-5">
                {navItems.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    mobile
                    onClick={() => setMobileMenuOpen(false)}
                  />
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
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        placeholder={config.homepage.searchPlaceholder}
      />
    </header>
  );
}
