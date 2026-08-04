import { CalendarDays, Clock3, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { formatDateKey } from "@/lib/date";
import type { HomeData } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

function formatDuration(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(start) || start > Date.now()) return "—";
  return `${Math.max(1, Math.floor((Date.now() - start) / 86_400_000))} 天`;
}

export function SiteStats({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const [uptime, setUptime] = useState("—");

  useEffect(() => {
    setUptime(
      config.footer.showUptime && config.footer.buildDate
        ? formatDuration(config.footer.buildDate)
        : "—",
    );
  }, [config.footer.buildDate, config.footer.showUptime]);

  return (
    <GlassPanel className="aibrium-stats-card">
      <div className="aibrium-card-heading">
        <span className="aibrium-card-heading__bar" aria-hidden="true" />
        <h2>站点统计</h2>
      </div>
      <div className="aibrium-stats-card__rows">
        {config.footer.showUptime && (
          <div>
            <span>
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              运行天数
            </span>
            <strong>{uptime}</strong>
          </div>
        )}
        <div>
          <span>
            <FileText className="h-4 w-4" aria-hidden="true" />
            最后更新
          </span>
          <strong>{home.latestUpdatedAt ? formatDateKey(home.latestUpdatedAt) : "—"}</strong>
        </div>
        <div>
          <span>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            公开内容
          </span>
          <strong>{home.totalPosts} 篇</strong>
        </div>
      </div>
    </GlassPanel>
  );
}
