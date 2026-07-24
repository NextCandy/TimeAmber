import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Eye,
  History,
  TrendingUp,
  FileDown,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAdminStore, type AnalyticsEvent } from "@/lib/admin-store";
import { loadAdminAnalytics } from "@/lib/state.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDaily(events: { at: string; path: string }[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const day = localDateKey(event.at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days: { date: string; pv: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = localDateKey(d);
    days.push({ date, pv: counts.get(date) ?? 0 });
  }
  return days;
}

function AnalyticsPage() {
  const { analytics: initialAnalytics } = useAdminStore();
  const [analytics, setAnalytics] =
    useState<AnalyticsEvent[]>(initialAnalytics);
  const [pathFilter, setPathFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(
    initialAnalytics.length > 0 ? new Date() : null,
  );

  useEffect(() => {
    setAnalytics(initialAnalytics);
    if (initialAnalytics.length > 0) setLastUpdatedAt(new Date());
  }, [initialAnalytics]);

  const refreshAnalytics = useCallback(async (showToast = false) => {
    setRefreshing(true);
    try {
      const events = await loadAdminAnalytics();
      setAnalytics(events);
      setLastUpdatedAt(new Date());
      if (showToast)
        toast.success(`已刷新，共 ${events.length} 条真实访问事件`);
    } catch {
      if (showToast) toast.error("刷新访问数据失败");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshAnalytics();
    const interval = window.setInterval(() => {
      void refreshAnalytics();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshAnalytics]);

  const filteredEvents = useMemo(() => {
    const q = pathFilter.trim().toLowerCase();
    return analytics.filter((e) => {
      if (q && !e.path.toLowerCase().includes(q)) return false;
      const day = localDateKey(e.at);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [analytics, pathFilter, fromDate, toDate]);

  const daily = useMemo(() => buildDaily(filteredEvents), [filteredEvents]);

  const totalPv = daily.reduce((sum, day) => sum + day.pv, 0);
  const today = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2];
  const delta =
    !yesterday || yesterday.pv === 0
      ? today.pv === 0
        ? "0%"
        : "新增"
      : `${today.pv >= yesterday.pv ? "+" : ""}${Math.round(
          ((today.pv - yesterday.pv) / yesterday.pv) * 100,
        )}%`;

  const maxPv = Math.max(...daily.map((d) => d.pv), 1);

  const topPaths = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filteredEvents)
      counts.set(e.path, (counts.get(e.path) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredEvents]);

  const cards = [
    { label: "近 14 天 PV", value: totalPv, icon: Eye },
    { label: "今日 PV", value: today.pv, icon: Activity },
    { label: "昨日 PV", value: yesterday.pv, icon: History },
    { label: "环比昨日", value: delta, icon: TrendingUp },
  ] as const;

  function exportCsv(kind: "daily" | "events" | "top") {
    let rows: string[][];
    let name: string;
    if (kind === "daily") {
      rows = [["date", "pv"], ...daily.map((d) => [d.date, String(d.pv)])];
      name = "analytics-daily";
    } else if (kind === "top") {
      rows = [["path", "count"], ...topPaths.map(([p, c]) => [p, String(c)])];
      name = "analytics-top-pages";
    } else {
      rows = [
        ["at", "path", "referrer"],
        ...filteredEvents.map((e) => [e.at, e.path, e.referrer ?? ""]),
      ];
      name = "analytics-events";
    }
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`已导出 ${name}.csv`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">访客分析</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            数据来自前台写入数据库的真实页面访问事件，每 30
            秒自动刷新。当前仅统计可准确记录的 PV，不估算 UV。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            最后更新：
            {lastUpdatedAt
              ? lastUpdatedAt.toLocaleTimeString("zh-CN", { hour12: false })
              : "正在加载"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void refreshAnalytics(true)}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv("daily")}
          >
            <FileDown className="mr-1.5 h-4 w-4" /> 导出每日
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv("top")}>
            <FileDown className="mr-1.5 h-4 w-4" /> 导出热门页面
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv("events")}
          >
            <FileDown className="mr-1.5 h-4 w-4" /> 导出原始事件
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border/70 bg-card/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> 筛选（同时作用于图表 / 热门页面 /
          原始事件导出）
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label className="text-xs">路径关键字</Label>
            <Input
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
              placeholder="例如 /posts/ 或 /about"
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">起始日期</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">结束日期</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 h-8"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          筛选后命中 {filteredEvents.length} / {analytics.length} 条事件。
          {(pathFilter || fromDate || toDate) && (
            <button
              className="ml-2 text-primary hover:underline"
              onClick={() => {
                setPathFilter("");
                setFromDate("");
                setToDate("");
              }}
            >
              重置
            </button>
          )}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-xl border border-border/70 bg-linear-to-br from-card via-card to-card/60 p-5"
          >
            <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-primary/5 blur-2xl" />
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {c.label}
              </span>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <h2 className="mb-4 font-display text-base font-semibold">
          近 14 天访问趋势
        </h2>
        <div className="flex h-44 items-end gap-2">
          {daily.map((d) => (
            <div key={d.date} className="group relative flex-1">
              <div
                className="w-full rounded-t bg-linear-to-t from-primary/80 to-primary/30 transition-all hover:from-primary hover:to-primary/50"
                style={{
                  height:
                    d.pv > 0 ? `${Math.max((d.pv / maxPv) * 100, 3)}%` : 0,
                }}
              />
              <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 group-hover:opacity-100">
                {d.date} · PV {d.pv}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{daily[0].date}</span>
          <span>{daily[daily.length - 1].date}</span>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <h2 className="mb-3 font-display text-base font-semibold">热门页面</h2>
        {topPaths.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {topPaths.map(([path, count]) => (
              <li
                key={path}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {path}
                </span>
                <span className="tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            当前筛选范围内暂无访问记录。
          </p>
        )}
      </section>
    </div>
  );
}
