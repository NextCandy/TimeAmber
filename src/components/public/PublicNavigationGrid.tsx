import { Archive, Compass, FolderTree, Info, LayoutGrid, Rss, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { GlassPanel } from "@/components/public/GlassPanel";
import {
  safePublicHref,
  sortedNavigation,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";

const ICONS = { Archive, Compass, FolderTree, Info, LayoutGrid, Rss, Users };

export function PublicNavigationGrid({ config }: { config: PublicSiteConfig }) {
  const items = sortedNavigation(config).filter((item) => item.href !== "/");

  return (
    <GlassPanel className="aibrium-nav-card">
      <h2 className="aibrium-nav-card__title">导航</h2>
      <nav aria-label="内容导航" className="aibrium-nav-card__list">
        {items.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Compass;
          const className = "aibrium-nav-card__item";
          const href = safePublicHref(item.href);
          if (!href) return null;
          const body = (
            <>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </>
          );
          if (item.openInNewTab || href === "/rss.xml" || /^https?:\/\//i.test(href)) {
            return (
              <a
                key={item.id}
                href={href}
                target={item.openInNewTab ? "_blank" : undefined}
                rel={item.openInNewTab ? "noopener noreferrer" : undefined}
                className={className}
              >
                {body}
              </a>
            );
          }
          return (
            <Link key={item.id} to={href as never} className={className}>
              {body}
            </Link>
          );
        })}
      </nav>
    </GlassPanel>
  );
}
