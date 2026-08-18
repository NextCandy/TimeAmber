import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  ExternalLink,
  FileWarning,
  KeyRound,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSyncCenter,
  resolveNotionUrl,
  runSyncNow,
  saveNotionAuth,
  testNotionAccess,
  type NotionAccessResult,
  type SyncCenterData,
} from "@/lib/sync-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/sync")({
  head: () => ({
    meta: [
      { title: "内容同步 · TimeAmber" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SyncCenterPage,
});

function formatTime(value: string): string {
  if (!value) return "从未运行";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: "正常", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    "repair-success": { label: "回填正常", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    error: { label: "异常", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    failed: { label: "失败", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    running: { label: "运行中", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    unknown: { label: "未知", className: "bg-muted text-muted-foreground" },
  };
  const item = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge className={`border-0 font-normal ${item.className}`}>{item.label}</Badge>;
}

function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof Database;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-medium">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function SyncCenterPage() {
  const loadCenter = useServerFn(getSyncCenter);
  const probeNotion = useServerFn(testNotionAccess);
  const persistAuth = useServerFn(saveNotionAuth);
  const resolveUrl = useServerFn(resolveNotionUrl);
  const triggerSync = useServerFn(runSyncNow);

  const [data, setData] = useState<SyncCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [access, setAccess] = useState<NotionAccessResult | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [backfillSize, setBackfillSize] = useState("20");

  const refresh = useCallback(
    async (quiet = false) => {
      try {
        setData(await loadCenter());
      } catch (error) {
        if (!quiet) toast.error(error instanceof Error ? error.message : "读取同步状态失败");
      } finally {
        setLoading(false);
      }
    },
    [loadCenter],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 有任务在跑的时候自动轮询，省得用户手点刷新看进度。
  useEffect(() => {
    const running = data?.recentRuns.some((run) => run.status === "running");
    if (!running) return;
    const timer = window.setInterval(() => void refresh(true), 15000);
    return () => window.clearInterval(timer);
  }, [data, refresh]);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  function run(task: "notion" | "notion-repair" | "archive" | "knowledge-index", extra?: Record<string, number>) {
    return withBusy(task, async () => {
      await triggerSync({ data: { task, ...extra } });
      toast.success("已触发，正在后台执行");
      await refresh(true);
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>无法读取同步状态</AlertTitle>
        <AlertDescription>请检查 worker 容器与数据库连接。</AlertDescription>
      </Alert>
    );
  }

  const notionFilled = data.notion.localCount - data.notion.emptyBodyCount;
  const notionPct =
    data.notion.localCount > 0 ? Math.round((notionFilled / data.notion.localCount) * 100) : 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">内容同步</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            文章的三个自动来源：Notion 的两个库与 NAS 上 web-archive 的离线剪藏。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {!data.workerReachable ? (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>同步 Worker 不可达</AlertTitle>
          <AlertDescription>{data.workerError || "无法连接 worker 容器"}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-5 py-4 text-sm">
        <span className="flex items-center gap-2">
          {data.syncEnabled ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          定时同步 {data.syncEnabled ? "已启用" : "已关闭"}
        </span>
        <span className="text-muted-foreground">Notion 每 10 分钟 · 归档每 20 分钟</span>
        <span className="text-muted-foreground">
          共 {data.notion.localCount + data.archive.localCount} 篇（Notion {data.notion.localCount} ·
          剪藏 {data.archive.localCount}）
        </span>
      </div>

      <SectionCard
        title="Notion"
        description="Link 与 SmartClip 两个库，元数据增量同步，正文由 repair 任务分批回填。"
        icon={Database}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "notion"}
              onClick={() => void run("notion")}
            >
              {busy === "notion" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              增量同步
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "notion-repair"}
              onClick={() =>
                void run("notion-repair", { maxBodyPages: Number(backfillSize) || 20, maxPages: 3 })
              }
            >
              {busy === "notion-repair" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              回填正文
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="最近状态" value={<StatusBadge status={data.notion.lastStatus} />} />
          <Stat label="最近运行" value={formatTime(data.notion.lastRunAt)} />
          <Stat
            label="本次处理"
            value={`${data.notion.lastProcessed} 篇`}
            hint={`更新 ${data.notion.lastUpdated} · 新增 ${data.notion.lastCreated} · 失败 ${data.notion.lastFailed}`}
          />
          <Stat label="已同步文章" value={`${data.notion.localCount} 篇`} />
        </div>

        {data.notion.lastError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>最近一次同步报错</AlertTitle>
            <AlertDescription className="break-all">{data.notion.lastError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-5 rounded-md border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <FileWarning className="h-4 w-4 text-muted-foreground" />
              正文回填进度
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">
              {notionFilled} / {data.notion.localCount} 篇有正文
              {data.notion.emptyBodyCount > 0 ? `（待补 ${data.notion.emptyBodyCount}）` : ""}
            </div>
          </div>
          <Progress value={notionPct} className="mt-3" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Label htmlFor="backfill-size" className="text-xs text-muted-foreground">
              每次回填
            </Label>
            <Input
              id="backfill-size"
              value={backfillSize}
              onChange={(e) => setBackfillSize(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-8 w-20"
            />
            <span className="text-xs text-muted-foreground">
              篇。正文里的图片会转存到图床，每篇约 10–20 秒，别一次设太大。
            </span>
          </div>
        </div>

        <Separator className="my-5" />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">授权与数据源</h3>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <Label htmlFor="notion-token" className="text-xs text-muted-foreground">
                集成令牌{data.notion.tokenConfigured ? `（当前 ${data.notion.tokenMasked}）` : "（未配置）"}
              </Label>
              <Input
                id="notion-token"
                type="password"
                placeholder="ntn_… 留空则不修改"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              variant="outline"
              disabled={!tokenDraft.trim() || busy === "token"}
              onClick={() =>
                void withBusy("token", async () => {
                  await persistAuth({ data: { token: tokenDraft.trim() } });
                  setTokenDraft("");
                  toast.success("令牌已更新，旧值已备份");
                  await refresh(true);
                })
              }
            >
              {busy === "token" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存令牌
            </Button>
            <Button
              variant="outline"
              disabled={busy === "probe"}
              onClick={() =>
                void withBusy("probe", async () => {
                  const result = await probeNotion();
                  setAccess(result);
                  if (result.tokenValid) toast.success("令牌有效，已探测各库授权");
                  else toast.error(result.error || "令牌无效");
                })
              }
            >
              {busy === "probe" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              测试授权
            </Button>
          </div>

          {access ? (
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
              {access.tokenValid ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  令牌有效{access.accountName ? ` · ${access.accountName}` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  {access.error || "令牌无效"}
                </span>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            {data.notion.dataSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有配置数据源。</p>
            ) : (
              data.notion.dataSources.map((source) => {
                const probed = access?.sources.find((s) => s.id === source.id);
                return (
                  <div
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{probed?.name || "（未探测）"}</span>
                        {probed ? (
                          probed.reachable ? (
                            <Badge className="border-0 bg-emerald-500/15 font-normal text-emerald-700 dark:text-emerald-400">
                              已授权
                            </Badge>
                          ) : (
                            <Badge className="border-0 bg-red-500/15 font-normal text-red-700 dark:text-red-400">
                              无权限
                            </Badge>
                          )
                        ) : null}
                        {typeof probed?.remoteCount === "number" ? (
                          <span className="text-xs text-muted-foreground">
                            Notion 侧 {probed.remoteCount} 条
                          </span>
                        ) : null}
                      </div>
                      <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                        {source.id}
                      </code>
                      {probed?.error ? (
                        <p className="mt-1 break-all text-xs text-red-600">{probed.error}</p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === `rm-${source.id}`}
                      onClick={() =>
                        void withBusy(`rm-${source.id}`, async () => {
                          const rest = data.notion.dataSources
                            .filter((s) => s.id !== source.id)
                            .map((s) => s.id);
                          await persistAuth({ data: { dataSourceIds: rest } });
                          toast.success("已移除该数据源");
                          await refresh(true);
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-md border border-dashed p-4">
            <Label htmlFor="notion-url" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" />
              粘贴 Notion 数据库链接来添加数据源
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                id="notion-url"
                placeholder="https://xxx.notion.site/32位ID?v=…"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                className="min-w-[260px] flex-1"
              />
              <Button
                variant="outline"
                disabled={!urlDraft.trim() || busy === "resolve"}
                onClick={() =>
                  void withBusy("resolve", async () => {
                    const resolved = await resolveUrl({ data: { url: urlDraft.trim() } });
                    if (resolved.dataSources.length === 0) {
                      toast.error("这个 database 下没有可用的数据源");
                      return;
                    }
                    const existing = data.notion.dataSources.map((s) => s.id);
                    const added = resolved.dataSources
                      .map((d) => d.id)
                      .filter((id) => id && !existing.includes(id));
                    if (added.length === 0) {
                      toast.info(`「${resolved.databaseTitle}」的数据源已在列表中`);
                      return;
                    }
                    await persistAuth({ data: { dataSourceIds: [...existing, ...added] } });
                    setUrlDraft("");
                    toast.success(`已添加「${resolved.databaseTitle}」`);
                    await refresh(true);
                  })
                }
              >
                {busy === "resolve" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                解析并添加
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              链接里那串 ID 是 database id，同步实际要用的是它下面的 data source id，两者不同 ——
              这里会自动换算。添加后还需在 Notion 的集成设置里把该库连接给本集成，否则会 404。
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="web-archive 剪藏"
        description="NAS 上 web-archive 抓下来的离线 HTML，文章页会直接跳转到存档页面。"
        icon={Archive}
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "archive"}
            onClick={() => void run("archive")}
          >
            {busy === "archive" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            立即同步
          </Button>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Stat label="本地剪藏文章" value={`${data.archive.localCount} 篇`} />
          <Stat
            label="缺少存档链接"
            value={`${data.archive.brokenCount} 篇`}
            hint={data.archive.brokenCount > 0 ? "这些点开会是空白页，需要重新抓取" : "全部正常"}
          />
        </div>

        <div className="mt-4 space-y-2">
          {data.archive.sources.map((source) => (
            <div
              key={source.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm">{source.label}</span>
                <StatusBadge status={source.lastStatus} />
                {source.hasMore ? (
                  <Badge variant="outline" className="font-normal">
                    还有更多
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>上次 {formatTime(source.lastRunAt)}</span>
                <span>
                  扫描 {source.lastScanned} / 共 {source.lastTotal}
                </span>
                <span>
                  新增 {source.lastCreated} · 跳过 {source.lastSkipped}
                </span>
                <span>下一页 {source.nextPage}</span>
              </div>
              {source.lastError ? (
                <p className="w-full break-all text-xs text-red-600">{source.lastError}</p>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="运行记录"
        description="最近 30 次同步任务。"
        icon={ExternalLink}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-normal">任务</th>
                <th className="pb-2 pr-4 font-normal">模式</th>
                <th className="pb-2 pr-4 font-normal">状态</th>
                <th className="pb-2 pr-4 font-normal">开始</th>
                <th className="pb-2 pr-4 text-right font-normal">新增</th>
                <th className="pb-2 pr-4 text-right font-normal">更新</th>
                <th className="pb-2 pr-4 text-right font-normal">跳过</th>
                <th className="pb-2 text-right font-normal">失败</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((run) => (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{run.sourceKey}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{run.mode}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {formatTime(run.startedAt)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{run.created}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{run.updated}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{run.skipped}</td>
                  <td className="py-2 text-right tabular-nums">
                    {run.failed > 0 ? (
                      <span className="text-red-600">{run.failed}</span>
                    ) : (
                      run.failed
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
