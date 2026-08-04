import { Link } from "@tanstack/react-router";
import { Clock3, Rss } from "lucide-react";
import { useEffect, useState } from "react";

import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import { DEFAULT_PUBLIC_SITE_CONFIG } from "@/lib/public-site-settings";

export function Footer() {
  const { settings } = useAdminStore();
  const config = settings.publicSite ?? DEFAULT_PUBLIC_SITE_CONFIG;
  const [now, setNow] = useState("");
  useEffect(() => {
    const update = () =>
      setNow(
        new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(),
      );
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const year = new Date().getFullYear();
  const copyright = config.footer.copyrightText || `© ${year} ${config.identity.siteName}`;
  const badges = config.footer.showTechBadges
    ? config.footer.techBadges.filter((item) => item.enabled).sort((a, b) => a.order - b.order)
    : [];

  return (
    <footer className="public-footer mt-8 border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" search={{ page: undefined }} className="flex items-center gap-2.5">
          <img
            src={config.identity.logoUrl || BRAND_ICON}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-brand text-xl leading-none">{config.identity.siteName}</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {config.footer.customText && <span>{config.footer.customText}</span>}
          {config.footer.showCurrentTime && now && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {now}
            </span>
          )}
          {config.footer.showUptime && config.footer.buildDate && (
            <span>
              运行第{" "}
              {Math.max(
                1,
                Math.floor(
                  (Date.now() - new Date(`${config.footer.buildDate}T00:00:00+08:00`).getTime()) /
                    86_400_000,
                ),
              )}{" "}
              天
            </span>
          )}
          {badges.map((badge) => (
            <span key={badge.id} className="rounded-full border border-border/60 px-2 py-0.5">
              {badge.name}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/rss.xml"
            aria-label="RSS 订阅"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-accent-amber"
          >
            <Rss className="h-3.5 w-3.5" />
            RSS
          </a>
          {config.footer.icpName &&
            (config.footer.icpUrl ? (
              <a
                href={config.footer.icpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-accent-amber"
              >
                {config.footer.icpName}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{config.footer.icpName}</span>
            ))}
          <span className="text-xs text-muted-foreground">{copyright}</span>
        </div>
      </div>
    </footer>
  );
}
