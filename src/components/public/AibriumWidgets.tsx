import { Activity, Clock3, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { formatDateKey } from "@/lib/date";
import type { HomeData } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

function shanghaiTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format();
}

export function SiteClock() {
  const [now, setNow] = useState("");

  useEffect(() => {
    const update = () => setNow(shanghaiTime());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <GlassPanel className="aibrium-clock-card" aria-label="当前时间">
      <Clock3 className="sr-only" />
      <time>{now || "--:--:--"}</time>
    </GlassPanel>
  );
}

export function LatestUpdateCard({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const latest = home.latest[0];
  return (
    <GlassPanel className="aibrium-update-card">
      <div className="aibrium-card-heading">
        <span className="aibrium-card-heading__bar" aria-hidden="true" />
        <h2>{config.homepage.statsTitle}</h2>
      </div>
      <div className="aibrium-update-list">
        <div>
          <span>公开文章</span>
          <strong>{home.totalPosts.toLocaleString("zh-CN")}</strong>
        </div>
        <div>
          <span>标签 / 分类</span>
          <strong>
            {home.totalTags} / {home.totalCategories}
          </strong>
        </div>
        <div>
          <span>友链</span>
          <strong>{home.friendsCount}</strong>
        </div>
      </div>
      {latest && (
        <div className="aibrium-update-highlight">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent-amber" />
            <span>最近更新</span>
            <time className="ml-auto" dateTime={latest.publishAt}>
              {formatDateKey(latest.publishAt)}
            </time>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6">{latest.title}</p>
        </div>
      )}
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5 text-accent-amber" />
        {config.identity.slogan}
      </p>
    </GlassPanel>
  );
}
