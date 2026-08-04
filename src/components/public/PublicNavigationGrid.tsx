import { Archive, FolderTree, Info, LayoutGrid, Rss, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { GlassPanel } from "@/components/public/GlassPanel";
import { sortedNavigation, type PublicSiteConfig } from "@/lib/public-site-settings";

const ICONS = { Archive, FolderTree, Info, LayoutGrid, Rss, Users };

export function PublicNavigationGrid({ config }: { config: PublicSiteConfig }) {
  const items = sortedNavigation(config).filter((item) => item.href !== "/");
  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-accent-amber uppercase">Explore</p>
          <h2 className="mt-1 text-lg font-semibold">内容导航</h2>
        </div>
        <span className="text-xs text-muted-foreground">沿着索引继续</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutGrid;
          const className =
            "group flex min-h-20 flex-col justify-between rounded-xl border border-border/60 bg-background/20 p-3 transition-all hover:-translate-y-0.5 hover:border-accent-amber/60 hover:bg-accent-amber-soft/20 focus-visible:outline-none";
          const body = (
            <>
              <Icon className="h-4 w-4 text-accent-amber" aria-hidden="true" />
              <span className="text-sm font-medium group-hover:text-accent-amber">
                {item.label}
              </span>
            </>
          );
          if (item.openInNewTab || item.href === "/rss.xml" || /^https?:\/\//i.test(item.href)) {
            return (
              <a
                key={item.id}
                href={item.href}
                target={item.openInNewTab ? "_blank" : undefined}
                rel={item.openInNewTab ? "noopener noreferrer" : undefined}
                className={className}
              >
                {body}
              </a>
            );
          }
          return (
            <Link key={item.id} to={item.href as never} className={className}>
              {body}
            </Link>
          );
        })}
      </div>
    </GlassPanel>
  );
}
