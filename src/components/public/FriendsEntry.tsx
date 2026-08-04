import { ArrowUpRight, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { GlassPanel } from "@/components/public/GlassPanel";
import type { HomeData } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

export function FriendsEntry({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  return (
    <GlassPanel className="flex items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-amber-soft text-accent-amber">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{config.homepage.friendsTitle}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {config.homepage.friendsDescription} · {home.friendsCount} 个站点
          </p>
        </div>
      </div>
      <Link
        to="/friends"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-amber/60 hover:text-accent-amber"
      >
        进入
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </GlassPanel>
  );
}
