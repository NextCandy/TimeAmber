import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND_ICON } from "@/lib/brand";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { to: "/", label: "首页" },
  { to: "/archive", label: "归档" },
  { to: "/about", label: "关于" },
  { to: "/friends", label: "友链" },
] as const;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <img
            src={BRAND_ICON}
            alt=""
            className="h-8 w-8 object-contain drop-shadow-[0_4px_8px_oklch(0.55_0.15_55/0.35)]"
          />
          <span className="font-brand text-2xl font-normal leading-none tracking-tight">
            TimeAmber
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeOptions={{ exact: true }}
              activeProps={{
                className:
                  "rounded-md px-3 py-1.5 text-sm text-foreground bg-accent",
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
            aria-label="搜索"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
