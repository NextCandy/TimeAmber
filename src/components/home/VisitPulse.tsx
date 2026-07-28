import { TrendingUp } from "lucide-react";

import type { VisitTrendPoint } from "@/lib/state.functions";

/**
 * 近 7 天访问。数据由首页 loader 在服务端取好，首屏直出真实柱子 ——
 * 放在客户端 useEffect 里取会先渲染一张空卡片（P0-2 修的就是这个）。
 */
export function VisitPulse({ trend }: { trend: VisitTrendPoint[] }) {
  if (trend.length === 0) return null;

  const max = Math.max(...trend.map((d) => d.count), 1);
  const total = trend.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex items-center gap-5 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />近 7 天访问
        </p>
        <p className="font-latin mt-1 text-2xl font-bold text-foreground">
          {total.toLocaleString("en-US")}
        </p>
      </div>

      <ul className="flex h-12 flex-1 items-end justify-end gap-1.5" aria-hidden="true">
        {trend.map((point) => (
          <li
            key={point.date}
            title={`${point.date}：${point.count}`}
            style={{ height: `${Math.max(8, (point.count / max) * 100)}%` }}
            className="w-2.5 rounded-sm bg-primary/35"
          />
        ))}
      </ul>

      <span className="sr-only">
        最近七天访问量合计 {total}，其中 {trend.map((p) => `${p.date} 为 ${p.count}`).join("，")}。
      </span>
    </div>
  );
}
