import { Activity, CalendarDays, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import type { HomeData } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

function formatDuration(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(start) || start > Date.now()) return "—";
  return `${Math.max(1, Math.floor((Date.now() - start) / 86_400_000))} 天`;
}

export function SiteStats({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const update = () =>
      setNow(
        new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(),
      );
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const badges = config.footer.techBadges
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order);
  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-accent-amber" />
        <h2 className="text-lg font-semibold">{config.homepage.statsTitle}</h2>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-background/25 p-3">
          <p className="text-xs text-muted-foreground">公开文章</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{home.totalPosts}</p>
        </div>
        <div className="rounded-xl bg-background/25 p-3">
          <p className="text-xs text-muted-foreground">友链</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{home.friendsCount}</p>
        </div>
        <div className="rounded-xl bg-background/25 p-3">
          <p className="text-xs text-muted-foreground">最近更新</p>
          <p className="mt-1 text-sm font-medium">
            {home.latestUpdatedAt
              ? new Date(home.latestUpdatedAt).toLocaleDateString("zh-CN")
              : "—"}
          </p>
        </div>
        {config.footer.showUptime && (
          <div className="rounded-xl bg-background/25 p-3">
            <p className="text-xs text-muted-foreground">运行时间</p>
            <p className="mt-1 text-sm font-medium">
              {config.footer.buildDate ? formatDuration(config.footer.buildDate) : "未设置"}
            </p>
          </div>
        )}
      </div>
      {config.footer.showCurrentTime && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {now || "当前时间"}
        </p>
      )}
      {config.footer.showTechBadges && badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.id}
              className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {badge.name}
            </span>
          ))}
        </div>
      )}
      <p className="sr-only">
        <CalendarDays /> {home.totalCategories} 个分类，{home.totalTags} 个标签
      </p>
    </GlassPanel>
  );
}
