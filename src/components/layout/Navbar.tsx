import { CircleUserRound, MoreVertical, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAdminStore } from "@/lib/admin-store";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  safePublicHref,
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
  const className = mobile ? "public-mobile-nav-item" : "public-nav-item";
  const activeClassName = mobile ? "public-mobile-nav-item is-active" : "public-nav-item is-active";
  const href = safePublicHref(item.href);
  if (!href) return null;
  if (/^https?:\/\//i.test(href) || item.openInNewTab) {
    return (
      <a
        href={href}
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
      to={href as never}
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
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
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

  return (
    <header className="public-navbar">
      <div className={`public-navbar__inner ${scrolled ? "is-scrolled" : ""}`}>
        <Link to="/" search={{ page: undefined }} className="public-navbar__brand">
          <span>{config.identity.navTitle}</span>
        </Link>

        <nav aria-label="主导航" className="public-navbar__nav">
          {navItems.map((item) => (
            <NavItem key={item.id} item={item} />
          ))}
        </nav>

        <div className="public-navbar__actions">
          <button
            type="button"
            aria-label="搜索（⌘K）"
            title="搜索（⌘K / Ctrl+K）"
            onClick={() => setSearchOpen(true)}
            className="public-navbar__icon-button"
          >
            <Search className="h-4 w-4" />
          </button>
          <a
            href="/auth?redirect=%2Fadmin"
            aria-label="后台登录"
            title="后台登录"
            className="public-navbar__account"
          >
            <CircleUserRound className="h-4 w-4" />
          </a>
          <ThemeToggle initialPreference={initialThemePreference} />
        </div>

        <div className="public-navbar__mobile-trigger">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="打开导航菜单"
                title="导航菜单"
                className="public-mobile-menu-button"
              >
                <MoreVertical className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="public-mobile-sheet">
              <SheetHeader className="public-mobile-sheet__header">
                <SheetTitle className="public-mobile-sheet__title">
                  {config.identity.navTitle}
                </SheetTitle>
                <SheetDescription className="sr-only">移动端站点导航</SheetDescription>
              </SheetHeader>
              <nav aria-label="移动端主导航" className="public-mobile-nav">
                {navItems.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    mobile
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
              </nav>
              <div className="public-mobile-sheet__footer">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSearchOpen(true);
                  }}
                  className="public-mobile-nav-item"
                >
                  <Search className="h-4 w-4" /> 搜索
                </button>
                <a
                  href="/auth?redirect=%2Fadmin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="public-mobile-nav-item"
                >
                  <CircleUserRound className="h-4 w-4" /> 后台
                </a>
                <div className="public-mobile-theme-row">
                  <span>主题</span>
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
