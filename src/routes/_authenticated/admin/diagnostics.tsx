import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, Bug, Trash2, RefreshCw, Download, Archive, AtSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminStore } from "@/lib/admin-store";
import {
  getLogs,
  getPerfs,
  clearLogs,
  clearPerfs,
  subscribe,
  type LogEntry,
  type PerfSnapshot,
} from "@/lib/diagnostics";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const store = useAdminStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [perfs, setPerfs] = useState<PerfSnapshot[]>([]);
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "info">("all");

  useEffect(() => {
    const refresh = () => {
      setLogs(getLogs());
      setPerfs(getPerfs());
    };
    refresh();
    const unsub = subscribe(refresh);
    return () => {
      unsub();
    };
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  );

  const counts = useMemo(() => {
    const r = { error: 0, warn: 0, info: 0 };
    for (const l of logs) r[l.level]++;
    return r;
  }, [logs]);

  function buildArchivePayload() {
    return {
      perfs: perfs.length,
      logs: logs.length,
      errorCount: counts.error,
      warnCount: counts.warn,
      payload: JSON.stringify({ perfs, logs }),
    };
  }

  function archiveNow() {
    if (perfs.length + logs.length === 0) {
      toast.info("当前没有可归档的数据");
      return;
    }
    store.archiveDiagnostics(buildArchivePayload());
    toast.success("已归档当前快照到本地存储");
  }

  // 定期自动归档：每 30 分钟一次（仅当有数据时）
  useEffect(() => {
    const t = setInterval(() => {
      if (perfs.length + logs.length === 0) return;
      const last = store.diagnosticsArchives[0];
      if (last && Date.now() - new Date(last.at).getTime() < 30 * 60 * 1000) return;
      store.archiveDiagnostics(buildArchivePayload());
    }, 10 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfs, logs, counts.error, counts.warn]);

  function exportLogs() {
    const blob = new Blob([JSON.stringify({ logs, perfs }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeamber-diagnostics-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadArchive(id: string) {
    const a0 = store.diagnosticsArchives.find((x) => x.id === id);
    if (!a0) return;
    const blob = new Blob([a0.payload], { type: "application/json" });
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob);
    el.download = `timeamber-diagnostics-archive-${a0.at.slice(0, 19)}.json`;
    el.click();
    URL.revokeObjectURL(el.href);
  }

  const latest = perfs[0];

  // === 联系方式渠道点击排行 ===
  const CHANNEL_LABEL: Record<string, string> = {
    email: "邮箱",
    tg: "Telegram",
    x: "Twitter / X",
    gh: "GitHub",
    wx: "微信",
    qq: "QQ",
    xhs: "小红书",
    dy: "抖音",
  };
  const [ccChannel, setCcChannel] = useState<string>("all");
  const [ccFrom, setCcFrom] = useState<string>("");
  const [ccTo, setCcTo] = useState<string>("");

  const contactRanking = useMemo(() => {
    const entries = Object.entries(store.contactClicks).map(([k, count]) => ({
      key: k,
      label: CHANNEL_LABEL[k] ?? k,
      count,
      lastAt: store.contactLastAt[k] ?? "",
    }));
    return entries.sort((a, b) => b.count - a.count || (b.lastAt > a.lastAt ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.contactClicks, store.contactLastAt]);

  const filteredRanking = useMemo(() => {
    return contactRanking.filter((r) => {
      if (ccChannel !== "all" && r.key !== ccChannel) return false;
      if (ccFrom || ccTo) {
        if (!r.lastAt) return false;
        const d = r.lastAt.slice(0, 10);
        if (ccFrom && d < ccFrom) return false;
        if (ccTo && d > ccTo) return false;
      }
      return true;
    });
  }, [contactRanking, ccChannel, ccFrom, ccTo]);

  function exportContactsCSV() {
    if (filteredRanking.length === 0) {
      toast.info("当前筛选下没有数据");
      return;
    }
    const header = ["channel_key", "channel_label", "clicks", "last_at"];
    const rows = filteredRanking.map((r) =>
      [r.key, r.label, String(r.count), r.lastAt || ""]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "\ufeff" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const tag = [
      ccChannel === "all" ? "all" : ccChannel,
      ccFrom || "any",
      ccTo || "any",
    ].join("_");
    a.download = `timeamber-contact-clicks-${tag}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`已导出 ${filteredRanking.length} 条`);
  }


  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">性能与日志追踪</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            实时记录页面 Web Vitals 与浏览器异常；后台每 30 分钟自动归档一次到本地长期存储。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={archiveNow}>
            <Archive className="mr-1.5 h-4 w-4" /> 立即归档
          </Button>
          <Button variant="outline" size="sm" onClick={exportLogs}>
            <Download className="mr-1.5 h-4 w-4" /> 导出 JSON
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Web Vitals · 当前页</h2>
          <span className="text-xs text-muted-foreground">{latest?.path ?? "—"}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="FCP" value={latest?.fcpMs} unit="ms" good={1800} />
          <Metric label="LCP" value={latest?.lcpMs} unit="ms" good={2500} />
          <Metric label="CLS" value={latest?.cls} unit="" good={0.1} fixed={3} />
          <Metric label="TTFB" value={latest?.ttfbMs} unit="ms" good={800} />
          <Metric label="Load" value={latest?.navigationMs} unit="ms" good={3000} />
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">
              联系方式点击排行（{contactRanking.length}）
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ccChannel}
              onChange={(e) => setCcChannel(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              aria-label="按渠道筛选"
            >
              <option value="all">全部渠道</option>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              {Object.keys(store.contactClicks)
                .filter((k) => !(k in CHANNEL_LABEL))
                .map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
            </select>
            <Input
              type="date"
              value={ccFrom}
              onChange={(e) => setCcFrom(e.target.value)}
              className="h-9 w-36 text-xs"
              aria-label="开始日期（按最近点击时间）"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={ccTo}
              onChange={(e) => setCcTo(e.target.value)}
              className="h-9 w-36 text-xs"
              aria-label="结束日期（按最近点击时间）"
            />
            <Button variant="outline" size="sm" onClick={exportContactsCSV}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> 导出 CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                store.resetContactClicks();
                toast.success("已清空联系方式埋点");
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 重置
            </Button>
          </div>
        </div>
        {filteredRanking.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无数据。前台侧栏联系方式被点击或复制后，会按渠道汇总在此（已做去重节流）。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60 text-left">
                  <th className="py-1.5">#</th>
                  <th>渠道</th>
                  <th>Key</th>
                  <th className="text-right">点击次数</th>
                  <th>最近时间</th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.map((r, i) => (
                  <tr key={r.key} className="border-b border-border/40">
                    <td className="py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="font-medium">{r.label}</td>
                    <td className="font-mono text-muted-foreground">{r.key}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="font-mono text-muted-foreground">
                      {r.lastAt ? new Date(r.lastAt).toLocaleString("zh-CN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>



      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">最近导航（{perfs.length}）</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={clearPerfs}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 清空
          </Button>
        </div>
        {perfs.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚无数据，浏览前台页面后回到此处查看。</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60 text-left">
                  <th className="py-1.5">时间</th>
                  <th>路径</th>
                  <th>FCP</th>
                  <th>LCP</th>
                  <th>CLS</th>
                  <th>TTFB</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {perfs.map((p, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-1.5 font-mono">{new Date(p.at).toLocaleTimeString("zh-CN")}</td>
                    <td className="font-mono">{p.path}</td>
                    <td>{p.fcpMs ?? "-"}</td>
                    <td>{p.lcpMs ?? "-"}</td>
                    <td>{p.cls ?? "-"}</td>
                    <td>{p.ttfbMs ?? "-"}</td>
                    <td>{p.navigationMs ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">运行时日志（{logs.length}）</h2>
            <Badge variant="destructive" className="text-[10px]">error {counts.error}</Badge>
            <Badge className="bg-amber-500/20 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 text-[10px]">
              warn {counts.warn}
            </Badge>
          </div>
          <div className="flex gap-1.5">
            {(["all", "error", "warn", "info"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={filter === k ? "default" : "outline"}
                onClick={() => setFilter(k)}
                className="h-7 px-2 text-xs"
              >
                {k}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={clearLogs}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 清空
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLogs(getLogs())}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有日志。</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {filtered.map((l) => (
              <li
                key={l.id}
                className={`rounded-md border px-3 py-2 text-xs ${
                  l.level === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : l.level === "warn"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/60 bg-background/40"
                }`}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono uppercase">{l.level}</span>
                  <span>·</span>
                  <span>{l.source}</span>
                  <span className="ml-auto">{new Date(l.at).toLocaleString("zh-CN")}</span>
                </div>
                <p className="mt-1 break-words font-mono text-foreground/90">{l.message}</p>
                {l.stack && (
                  <pre className="mt-1 max-h-32 overflow-auto text-[10px] text-muted-foreground">
                    {l.stack}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">
              归档快照（{store.diagnosticsArchives.length} / 20）
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={store.diagnosticsArchives.length === 0}
            onClick={() => {
              store.clearDiagnosticsArchives();
              toast.success("已清空归档");
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 清空
          </Button>
        </div>
        {store.diagnosticsArchives.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            尚无归档；可点击「立即归档」或等待自动归档（30 分钟一次）。
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60 text-left">
                  <th className="py-1.5">时间</th>
                  <th>perfs</th>
                  <th>logs</th>
                  <th>error</th>
                  <th>warn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.diagnosticsArchives.map((a) => (
                  <tr key={a.id} className="border-b border-border/40">
                    <td className="py-1.5 font-mono">{new Date(a.at).toLocaleString("zh-CN")}</td>
                    <td>{a.perfs}</td>
                    <td>{a.logs}</td>
                    <td className="text-destructive">{a.errorCount}</td>
                    <td className="text-amber-600 dark:text-amber-400">{a.warnCount}</td>
                    <td className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => downloadArchive(a.id)}
                      >
                        下载
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => store.removeDiagnosticsArchive(a.id)}
                      >
                        移除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  good,
  fixed = 0,
}: {
  label: string;
  value?: number;
  unit: string;
  good: number;
  fixed?: number;
}) {
  const hasVal = typeof value === "number";
  const ok = hasVal && value <= good;
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-lg font-semibold ${
          !hasVal ? "text-muted-foreground" : ok ? "text-primary" : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {hasVal ? value.toFixed(fixed) : "—"}
        <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>
      </p>
      <p className="text-[10px] text-muted-foreground">
        目标 ≤ {good}
        {unit}
      </p>
    </div>
  );
}
