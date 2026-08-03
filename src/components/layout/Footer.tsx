import { Link } from "@tanstack/react-router";
import { Rss } from "lucide-react";

import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";

export function Footer() {
  const { settings } = useAdminStore();
  const year = new Date().getFullYear();

  return (
    // 与正文同底色，只用一条发丝线分隔 —— 原来那块加深的色带把页面切成了两截。
    <footer className="mt-8 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 text-sm sm:flex-row sm:justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={BRAND_ICON} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="font-brand text-xl leading-none">{settings.siteTitle}</span>
        </Link>

        <p className="text-[var(--text-faint)]">时光成珀，字字如初。</p>

        <div className="flex items-center gap-4">
          <a
            href="/rss.xml"
            aria-label="RSS 订阅"
            title="RSS 订阅"
            className="inline-flex items-center gap-1.5 font-latin text-[var(--text-faint)] transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Rss className="h-3.5 w-3.5" />
            RSS
          </a>
          <span className="font-latin text-xs text-[var(--text-faint)]">
            © {year} {settings.siteTitle}
          </span>
        </div>
      </div>
    </footer>
  );
}
