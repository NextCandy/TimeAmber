import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Cloud,
  HardDrive,
  Loader2,
  RefreshCcw,
  Sparkles,
  History,
  Camera,
  Trash2,
  RotateCcw,
  CalendarClock,
  ScrollText,
  FileDown,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminStore, type CloudConfig, type Snapshot } from "@/lib/admin-store";
import { getAuthState } from "@/lib/auth.functions";
import { getSyncStatus, runSyncTask } from "@/lib/sync.functions";
import {
  webdavUpload,
  webdavDownload,
  s3Upload,
  s3Download,
  dropboxUpload,
  dropboxDownload,
  onedriveUpload,
  onedriveDownload,
  gdriveUpload,
  gdriveDownload,
  notionList,
  notionFetchPage,
} from "@/lib/backup.functions";
import type { Post } from "@/lib/sample-posts";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: BackupPage,
});

type NotionItemLog = {
  id: string;
  title: string;
  status: "created" | "updated" | "skipped" | "failed";
  message?: string;
  at: string;
};

type NotionProgress = {
  total: number;
  done: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  currentTitle?: string;
  finishedAt?: string;
  startedAt: string;
  logs: NotionItemLog[];
};

function BackupPage() {
  const store = useAdminStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchSyncStatus = useServerFn(getSyncStatus);
  const executeSyncTask = useServerFn(runSyncTask);
  const [syncStatus, setSyncStatus] = useState<{
    syncEnabled?: boolean;
    runs?: Array<{
      id: number;
      source_key: string;
      status: string;
      started_at: string;
      created_count: number;
      updated_count: number;
      skipped_count: number;
      failed_count: number;
      error?: string;
    }>;
  }>({});
  const [syncBusy, setSyncBusy] = useState<string | null>(null);

  const [actor, setActor] = useState<string>("未登录用户");
  useEffect(() => {
    getAuthState().then((auth) => {
      if (auth.authenticated) setActor(auth.email);
    });
  }, []);

  async function refreshSyncStatus() {
    try {
      setSyncStatus((await fetchSyncStatus()) as typeof syncStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步状态读取失败");
    }
  }

  useEffect(() => {
    void refreshSyncStatus();
  }, []);

  async function runMatureSync(task: "notion" | "notion-repair" | "archive" | "backup") {
    setSyncBusy(task);
    try {
      await executeSyncTask({ data: { task } });
      toast.success(`${task} 任务执行完成`);
      await refreshSyncStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${task} 执行失败`);
    } finally {
      setSyncBusy(null);
    }
  }

  const [webdav, setWebdav] = useState(
    store.cloud.webdav ?? {
      url: "",
      username: "",
      password: "",
      filename: "timeamber-backup.json",
    },
  );
  const [s3, setS3] = useState(
    store.cloud.s3 ?? {
      endpoint: "",
      region: "us-east-1",
      bucket: "",
      accessKeyId: "",
      secretAccessKey: "",
      key: "timeamber-backup.json",
    },
  );
  const [dropbox, setDropbox] = useState<NonNullable<CloudConfig["dropbox"]>>(
    store.cloud.dropbox ?? {
      token: "",
      path: "/timeamber/timeamber-backup.json",
    },
  );
  const [onedrive, setOnedrive] = useState<NonNullable<CloudConfig["onedrive"]>>(
    store.cloud.onedrive ?? {
      token: "",
      path: "timeamber/timeamber-backup.json",
    },
  );
  const [gdrive, setGdrive] = useState<NonNullable<CloudConfig["gdrive"]>>(
    store.cloud.gdrive ?? { token: "", filename: "timeamber-backup.json" },
  );
  const [notion, setNotion] = useState(store.cloud.notion ?? { token: "", databaseId: "" });

  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<NotionProgress | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);

  const runWebdavPush = useServerFn(webdavUpload);
  const runWebdavPull = useServerFn(webdavDownload);
  const runS3Push = useServerFn(s3Upload);
  const runS3Pull = useServerFn(s3Download);
  const runDropboxPush = useServerFn(dropboxUpload);
  const runDropboxPull = useServerFn(dropboxDownload);
  const runOnedrivePush = useServerFn(onedriveUpload);
  const runOnedrivePull = useServerFn(onedriveDownload);
  const runGdrivePush = useServerFn(gdriveUpload);
  const runGdrivePull = useServerFn(gdriveDownload);
  const runNotionList = useServerFn(notionList);
  const runNotionPage = useServerFn(notionFetchPage);

  function snapshotJSON() {
    return JSON.stringify(
      {
        posts: store.posts,
        categories: store.categories,
        tags: store.tags,
        friends: store.friends,
        settings: store.settings,
        exportedAt: new Date().toISOString(),
        version: 4,
      },
      null,
      2,
    );
  }

  function applyBackup(text: string, source: string) {
    try {
      const parsed = JSON.parse(text);
      store.createSnapshot(`恢复前自动快照（来自 ${source}）`, {
        actor,
        auto: true,
      });
      store.replaceState({
        posts: parsed.posts,
        categories: parsed.categories,
        tags: parsed.tags,
        friends: parsed.friends,
        settings: parsed.settings,
      });
      toast.success(`已恢复 ${parsed.posts?.length ?? 0} 篇文章`);
    } catch {
      toast.error("文件解析失败，不是合法的备份 JSON");
    }
  }

  function downloadLocal() {
    const blob = new Blob([snapshotJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeamber-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => applyBackup(String(reader.result ?? ""), "本地文件");
    reader.readAsText(file);
  }

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      toast.error(msg);
      store.addAlert({ level: "error", source: `backup/${key}`, message: msg });
    } finally {
      setBusy(null);
    }
  }

  const doWebdav = (dir: "push" | "pull") =>
    withBusy(`webdav-${dir}`, async () => {
      store.updateCloud({ webdav });
      if (dir === "push") {
        await runWebdavPush({ data: { ...webdav, body: snapshotJSON() } });
        toast.success("已上传到 WebDAV");
      } else {
        const { body } = await runWebdavPull({ data: webdav });
        applyBackup(body, "WebDAV");
      }
    });

  const doS3 = (dir: "push" | "pull") =>
    withBusy(`s3-${dir}`, async () => {
      store.updateCloud({ s3 });
      if (dir === "push") {
        await runS3Push({ data: { ...s3, body: snapshotJSON() } });
        toast.success("已上传到 S3");
      } else {
        const { body } = await runS3Pull({ data: s3 });
        applyBackup(body, "S3");
      }
    });

  const doDropbox = (dir: "push" | "pull") =>
    withBusy(`dropbox-${dir}`, async () => {
      store.updateCloud({ dropbox });
      if (dir === "push") {
        await runDropboxPush({ data: { ...dropbox, body: snapshotJSON() } });
        toast.success("已上传到 Dropbox");
      } else {
        const { body } = await runDropboxPull({ data: dropbox });
        applyBackup(body, "Dropbox");
      }
    });

  const doOnedrive = (dir: "push" | "pull") =>
    withBusy(`onedrive-${dir}`, async () => {
      store.updateCloud({ onedrive });
      if (dir === "push") {
        await runOnedrivePush({ data: { ...onedrive, body: snapshotJSON() } });
        toast.success("已上传到 OneDrive");
      } else {
        const { body } = await runOnedrivePull({ data: onedrive });
        applyBackup(body, "OneDrive");
      }
    });

  const doGdrive = (dir: "push" | "pull") =>
    withBusy(`gdrive-${dir}`, async () => {
      store.updateCloud({ gdrive });
      if (dir === "push") {
        await runGdrivePush({ data: { ...gdrive, body: snapshotJSON() } });
        toast.success("已上传到 Google Drive");
      } else {
        const { body } = await runGdrivePull({ data: gdrive });
        applyBackup(body, "Google Drive");
      }
    });

  async function doNotion() {
    await withBusy("notion", async () => {
      store.updateCloud({ notion });
      store.createSnapshot("Notion 同步前自动快照", { actor, auto: true });
      const { items } = await runNotionList({ data: notion });
      const known = new Map(
        store.posts.filter((p) => p.notionId).map((p) => [p.notionId as string, p]),
      );
      const prog: NotionProgress = {
        total: items.length,
        done: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        startedAt: new Date().toISOString(),
        logs: [],
      };
      setProgress({ ...prog });
      for (const it of items) {
        const existing = known.get(it.id);
        if (existing && existing.notionLastEdited === it.lastEditedTime) {
          prog.skipped++;
          prog.done++;
          prog.logs.push({
            id: it.id,
            title: it.title,
            status: "skipped",
            message: "未变更",
            at: new Date().toISOString(),
          });
          setProgress({ ...prog, currentTitle: it.title });
          continue;
        }
        setProgress({ ...prog, currentTitle: it.title });
        try {
          const { content } = await runNotionPage({
            data: { token: notion.token, pageId: it.id },
          });
          const excerpt =
            content
              .replace(/[#>\-`*]/g, "")
              .trim()
              .slice(0, 160) || it.title;
          const slug = existing
            ? existing.slug
            : it.title
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, "-")
                .replace(/(^-|-$)/g, "")
                .slice(0, 60) || `notion-${it.id.slice(0, 8)}`;
          const post: Post = {
            slug,
            title: it.title,
            excerpt,
            category: existing?.category ?? "Notion",
            tags: existing?.tags ?? ["notion"],
            publishAt: existing?.publishAt ?? it.createdTime.slice(0, 10),
            readingMinutes: Math.max(1, Math.round(content.length / 500)),
            content,
            cover: existing?.cover,
            source: existing?.source,
            status: existing?.status ?? "draft",
            type: "markdown",
            notionId: it.id,
            notionLastEdited: it.lastEditedTime,
          };
          store.upsertPost(post);
          if (existing) prog.updated++;
          else prog.created++;
          prog.logs.push({
            id: it.id,
            title: it.title,
            status: existing ? "updated" : "created",
            at: new Date().toISOString(),
          });
        } catch (err) {
          prog.failed++;
          prog.logs.push({
            id: it.id,
            title: it.title,
            status: "failed",
            message: err instanceof Error ? err.message : String(err),
            at: new Date().toISOString(),
          });
        }
        prog.done++;
        setProgress({ ...prog, currentTitle: it.title });
      }
      const final = { ...prog, finishedAt: new Date().toISOString() };
      setProgress(final);
      toast.success(
        `Notion 同步完成：新增 ${final.created} · 更新 ${final.updated} · 未变更 ${final.skipped} · 失败 ${final.failed}`,
      );
    });
  }

  function exportNotionLogs() {
    if (!progress) return;
    const payload = {
      startedAt: progress.startedAt,
      finishedAt: progress.finishedAt,
      summary: {
        total: progress.total,
        created: progress.created,
        updated: progress.updated,
        skipped: progress.skipped,
        failed: progress.failed,
      },
      logs: progress.logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notion-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isBusy = (k: string) => busy === k;
  const snapshots = store.snapshots;
  const audit = store.audit;
  const schedule = store.schedule;
  const percent = useMemo(
    () => (progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0),
    [progress],
  );

  const actionLabel: Record<string, string> = {
    restore: "回滚",
    create: "创建",
    delete: "删除",
    prune: "清理",
    import: "导入",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">备份与同步</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          导出 / 导入 JSON 备份，推送到 WebDAV / S3 / Dropbox / OneDrive / Google Drive；从 Notion
          增量同步草稿；历史快照与回滚审计。
        </p>
      </header>

      <section className="border-y border-border/70 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">生产同步 Worker</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              定时同步：{syncStatus.syncEnabled ? "已启用" : "预览环境已关闭"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshSyncStatus()}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            刷新状态
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["notion", "notion-repair", "archive", "backup"] as const).map((task) => (
            <Button
              key={task}
              variant="outline"
              size="sm"
              disabled={syncBusy !== null}
              onClick={() => void runMatureSync(task)}
            >
              {syncBusy === task && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {task}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {(syncStatus.runs ?? []).slice(0, 5).map((run) => (
            <div
              key={run.id}
              className="grid gap-1 border-t border-border/60 pt-2 text-xs md:grid-cols-[10rem_6rem_1fr]"
            >
              <span className="font-mono">{run.source_key}</span>
              <span>{run.status}</span>
              <span className="text-muted-foreground">
                新增 {run.created_count}，更新 {run.updated_count}，跳过 {run.skipped_count}， 失败{" "}
                {run.failed_count}
                {run.error ? ` · ${run.error}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Local */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">本地备份</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={downloadLocal}>
            <Download className="mr-1.5 h-4 w-4" /> 导出 JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" /> 导入 JSON
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          包含文章、分类、标签、友链与设置。导入前会自动生成一份本地快照，可随时回滚。
        </p>
      </section>

      {/* Scheduled backup */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">定时备份</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <Label className="text-sm">启用</Label>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={(v) => store.updateSchedule({ enabled: v })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">频率</Label>
            <Select
              value={schedule.frequency}
              onValueChange={(v: "daily" | "weekly") => store.updateSchedule({ frequency: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">每天</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">保留份数（1-30）</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={schedule.retention}
              onChange={(e) =>
                store.updateSchedule({
                  retention: Math.max(1, Math.min(30, Number(e.target.value) || 10)),
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">时区</Label>
            <Select
              value={schedule.timezone}
              onValueChange={(v) => store.updateSchedule({ timezone: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="Europe/London">Europe/London</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
                <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">执行窗口起 (0-23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={schedule.windowStart}
              onChange={(e) =>
                store.updateSchedule({
                  windowStart: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                })
              }
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">执行窗口止 (0-23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={schedule.windowEnd}
              onChange={(e) =>
                store.updateSchedule({
                  windowEnd: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          仅在指定时区的窗口小时内执行；后台打开时每小时轮询一次，按保留份数自动清理。
          {schedule.lastRunAt && <> · 上次运行：{new Date(schedule.lastRunAt).toLocaleString()}</>}
        </p>
      </section>

      {/* Alerts */}
      <AlertsSection />

      {/* Snapshots */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">版本历史</h2>
            <span className="text-xs text-muted-foreground">
              {snapshots.length} / {schedule.retention}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const s = store.createSnapshot(`手动快照 · ${new Date().toLocaleString()}`, {
                actor,
              });
              toast.success(`已创建快照（${s.postCount} 篇）`);
            }}
          >
            <Camera className="mr-1.5 h-4 w-4" /> 立即创建快照
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有任何快照。任何导入、Notion 同步前会自动生成。
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.label}
                    {s.auto && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        自动
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()} · {s.postCount} 篇文章
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setRestoreTarget(s)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> 回滚
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => store.removeSnapshot(s.id, { actor })}
                    aria-label="删除快照"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit log */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">操作审计</h2>
            <span className="text-xs text-muted-foreground">{audit.length} 条</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={audit.length === 0}
              onClick={() => {
                const header = ["时间", "操作人", "动作", "快照ID", "快照标签", "详情"];
                const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
                const rows = audit.map((a) =>
                  [
                    new Date(a.at).toISOString(),
                    a.actor,
                    actionLabel[a.action] ?? a.action,
                    a.snapshotId ?? "",
                    a.snapshotLabel ?? "",
                    a.detail ?? "",
                  ]
                    .map((c) => escape(String(c)))
                    .join(","),
                );
                const csv = "\uFEFF" + [header.map(escape).join(","), ...rows].join("\n");
                const blob = new Blob([csv], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`已导出 ${audit.length} 条审计记录`);
              }}
            >
              <FileDown className="mr-1.5 h-4 w-4" /> 导出 CSV
            </Button>
            <Button size="sm" variant="destructive" onClick={() => store.clearAudit()}>
              清空
            </Button>
          </div>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无审计记录。回滚、创建、删除快照都会被记录。
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/80 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-normal">时间</th>
                  <th className="px-3 py-2 font-normal">操作人</th>
                  <th className="px-3 py-2 font-normal">动作</th>
                  <th className="px-3 py-2 font-normal">快照</th>
                  <th className="px-3 py-2 font-normal">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {new Date(a.at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[180px]">{a.actor}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          a.action === "restore"
                            ? "text-primary"
                            : a.action === "delete"
                              ? "text-destructive"
                              : ""
                        }
                      >
                        {actionLabel[a.action] ?? a.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{a.snapshotLabel ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cloud */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">云盘备份</h2>
        </div>
        <Tabs defaultValue="webdav">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="webdav">WebDAV</TabsTrigger>
            <TabsTrigger value="s3">S3 / R2</TabsTrigger>
            <TabsTrigger value="dropbox">Dropbox</TabsTrigger>
            <TabsTrigger value="onedrive">OneDrive</TabsTrigger>
            <TabsTrigger value="gdrive">Google Drive</TabsTrigger>
          </TabsList>

          <TabsContent value="webdav" className="mt-4 space-y-3">
            <Field
              label="WebDAV URL"
              value={webdav.url}
              onChange={(v) => setWebdav({ ...webdav, url: v })}
              placeholder="https://dav.example.com/timeamber/"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="用户名"
                value={webdav.username}
                onChange={(v) => setWebdav({ ...webdav, username: v })}
              />
              <Field
                label="密码"
                type="password"
                value={webdav.password}
                onChange={(v) => setWebdav({ ...webdav, password: v })}
              />
            </div>
            <Field
              label="文件名"
              value={webdav.filename}
              onChange={(v) => setWebdav({ ...webdav, filename: v })}
            />
            <PushPullButtons
              busy={busy}
              isBusy={isBusy}
              prefix="webdav"
              onPush={() => doWebdav("push")}
              onPull={() => doWebdav("pull")}
            />
          </TabsContent>

          <TabsContent value="s3" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Endpoint"
                value={s3.endpoint}
                onChange={(v) => setS3({ ...s3, endpoint: v })}
                placeholder="https://s3.us-east-1.amazonaws.com"
              />
              <Field
                label="Region"
                value={s3.region}
                onChange={(v) => setS3({ ...s3, region: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Bucket"
                value={s3.bucket}
                onChange={(v) => setS3({ ...s3, bucket: v })}
              />
              <Field label="Object Key" value={s3.key} onChange={(v) => setS3({ ...s3, key: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Access Key ID"
                value={s3.accessKeyId}
                onChange={(v) => setS3({ ...s3, accessKeyId: v })}
              />
              <Field
                label="Secret Access Key"
                type="password"
                value={s3.secretAccessKey}
                onChange={(v) => setS3({ ...s3, secretAccessKey: v })}
              />
            </div>
            <PushPullButtons
              busy={busy}
              isBusy={isBusy}
              prefix="s3"
              onPush={() => doS3("push")}
              onPull={() => doS3("pull")}
            />
            <p className="text-xs text-muted-foreground">
              兼容 AWS S3 / Cloudflare R2 / MinIO 等 S3-API 服务。
            </p>
          </TabsContent>

          <TabsContent value="dropbox" className="mt-4 space-y-3">
            <Field
              label="Access Token"
              type="password"
              value={dropbox.token}
              onChange={(v) => setDropbox({ ...dropbox, token: v })}
              placeholder="sl.B..."
            />
            <Field
              label="文件路径"
              value={dropbox.path}
              onChange={(v) => setDropbox({ ...dropbox, path: v })}
              placeholder="/timeamber/timeamber-backup.json"
            />
            <p className="text-xs text-muted-foreground">
              在 Dropbox App Console 创建 Scoped App 并生成 Access Token；路径以 /
              开头，会覆盖同名文件。
            </p>
            <PushPullButtons
              busy={busy}
              isBusy={isBusy}
              prefix="dropbox"
              onPush={() => doDropbox("push")}
              onPull={() => doDropbox("pull")}
            />
          </TabsContent>

          <TabsContent value="onedrive" className="mt-4 space-y-3">
            <Field
              label="Microsoft Graph Access Token"
              type="password"
              value={onedrive.token}
              onChange={(v) => setOnedrive({ ...onedrive, token: v })}
              placeholder="eyJ0eXAi..."
            />
            <Field
              label="文件路径（相对个人 Drive 根目录）"
              value={onedrive.path}
              onChange={(v) => setOnedrive({ ...onedrive, path: v })}
              placeholder="timeamber/timeamber-backup.json"
            />
            <p className="text-xs text-muted-foreground">
              在 Azure AD 注册应用拿到带 Files.ReadWrite 权限的 Token；路径不要以 / 开头。
            </p>
            <PushPullButtons
              busy={busy}
              isBusy={isBusy}
              prefix="onedrive"
              onPush={() => doOnedrive("push")}
              onPull={() => doOnedrive("pull")}
            />
          </TabsContent>

          <TabsContent value="gdrive" className="mt-4 space-y-3">
            <Field
              label="OAuth Access Token"
              type="password"
              value={gdrive.token}
              onChange={(v) => setGdrive({ ...gdrive, token: v })}
              placeholder="ya29...."
            />
            <Field
              label="文件名"
              value={gdrive.filename}
              onChange={(v) => setGdrive({ ...gdrive, filename: v })}
              placeholder="timeamber-backup.json"
            />
            <p className="text-xs text-muted-foreground">
              在 Google OAuth Playground 或自建客户端授权 drive.file 范围拿到
              Token；上传按文件名查找并覆盖同名文件。
            </p>
            <PushPullButtons
              busy={busy}
              isBusy={isBusy}
              prefix="gdrive"
              onPush={() => doGdrive("push")}
              onPull={() => doGdrive("pull")}
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* Notion */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Notion 增量同步</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          按 Notion 页面 ID 去重，只重新拉取 last_edited_time
          变化的页面。新文章默认为草稿；已存在文章保留你在后台的分类、标签、发布状态等。
        </p>
        <Field
          label="Notion Integration Token"
          type="password"
          value={notion.token}
          onChange={(v) => setNotion({ ...notion, token: v })}
          placeholder="secret_xxx"
        />
        <div className="mt-3">
          <Field
            label="Database ID"
            value={notion.databaseId}
            onChange={(v) => setNotion({ ...notion, databaseId: v })}
            placeholder="32 位 ID"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={doNotion}>
            {isBusy("notion") ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1.5 h-4 w-4" />
            )}
            从 Notion 增量同步
          </Button>
          {progress && progress.logs.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportNotionLogs}>
              <FileDown className="mr-1.5 h-4 w-4" /> 导出日志
            </Button>
          )}
        </div>

        {progress && (
          <div className="mt-4 space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  进度 {progress.done} / {progress.total}
                  {progress.currentTitle && !progress.finishedAt && (
                    <span className="ml-2 text-foreground">· {progress.currentTitle}</span>
                  )}
                </span>
                <span className="font-mono">{percent}%</span>
              </div>
              <Progress value={percent} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="新增" value={progress.created} tone="primary" />
              <Stat label="更新" value={progress.updated} />
              <Stat label="未变更" value={progress.skipped} />
              <Stat
                label="失败"
                value={progress.failed}
                tone={progress.failed > 0 ? "destructive" : undefined}
              />
            </div>
            {progress.finishedAt && (
              <p className="text-[11px] text-muted-foreground">
                开始 {new Date(progress.startedAt).toLocaleTimeString()} · 完成{" "}
                {new Date(progress.finishedAt).toLocaleTimeString()}
              </p>
            )}
            {progress.logs.length > 0 && (
              <div className="max-h-56 overflow-auto rounded border border-border/60">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-card/80 backdrop-blur text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-normal">标题</th>
                      <th className="px-2 py-1.5 font-normal">结果</th>
                      <th className="px-2 py-1.5 font-normal">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {progress.logs.map((l) => (
                      <tr key={l.id + l.at}>
                        <td className="px-2 py-1 truncate max-w-[260px]">{l.title}</td>
                        <td
                          className={
                            "px-2 py-1 " +
                            (l.status === "created"
                              ? "text-primary"
                              : l.status === "updated"
                                ? ""
                                : l.status === "skipped"
                                  ? "text-muted-foreground"
                                  : "text-destructive")
                          }
                        >
                          {l.status === "created"
                            ? "新增"
                            : l.status === "updated"
                              ? "更新"
                              : l.status === "skipped"
                                ? "未变更"
                                : "失败"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-[280px]">
                          {l.message ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        提示：云端与通知凭据经服务端加密后存储，仅管理员可配置。
      </p>

      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>回滚到此快照？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {restoreTarget &&
                  (() => {
                    const cur = {
                      posts: store.posts.length,
                      cats: store.categories.length,
                      tags: store.tags.length,
                      friends: store.friends.length,
                    };
                    const tgt = {
                      posts: restoreTarget.data.posts.length,
                      cats: restoreTarget.data.categories.length,
                      tags: restoreTarget.data.tags.length,
                      friends: restoreTarget.data.friends.length,
                    };
                    const diff = (a: number, b: number) => {
                      const d = b - a;
                      if (d === 0) return <span className="text-muted-foreground">无变化</span>;
                      return (
                        <span className={d > 0 ? "text-primary" : "text-destructive"}>
                          {d > 0 ? "+" : ""}
                          {d}
                        </span>
                      );
                    };
                    return (
                      <>
                        <p>
                          将还原到「
                          <span className="font-medium text-foreground">{restoreTarget.label}</span>
                          」（
                          {new Date(restoreTarget.createdAt).toLocaleString()}
                          ）。系统会在回滚前自动生成「回滚前自动快照」便于撤销。
                        </p>
                        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            回滚预检查
                          </p>
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr className="text-left">
                                <th className="py-1 font-normal">项目</th>
                                <th className="py-1 font-normal text-right">当前</th>
                                <th className="py-1 font-normal text-right">回滚后</th>
                                <th className="py-1 font-normal text-right">变化</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              <tr>
                                <td>文章</td>
                                <td className="text-right">{cur.posts}</td>
                                <td className="text-right">{tgt.posts}</td>
                                <td className="text-right">{diff(cur.posts, tgt.posts)}</td>
                              </tr>
                              <tr>
                                <td>分类</td>
                                <td className="text-right">{cur.cats}</td>
                                <td className="text-right">{tgt.cats}</td>
                                <td className="text-right">{diff(cur.cats, tgt.cats)}</td>
                              </tr>
                              <tr>
                                <td>标签</td>
                                <td className="text-right">{cur.tags}</td>
                                <td className="text-right">{tgt.tags}</td>
                                <td className="text-right">{diff(cur.tags, tgt.tags)}</td>
                              </tr>
                              <tr>
                                <td>友链</td>
                                <td className="text-right">{cur.friends}</td>
                                <td className="text-right">{tgt.friends}</td>
                                <td className="text-right">{diff(cur.friends, tgt.friends)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {tgt.posts === 0 && (
                          <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            目标快照中无任何文章，确认仍要回滚？
                          </p>
                        )}
                      </>
                    );
                  })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!restoreTarget) return;
                const expected = restoreTarget.data.posts.length;
                const expSlugs = new Set(restoreTarget.data.posts.map((p) => p.slug));
                const expCats = restoreTarget.data.categories.length;
                const expTags = restoreTarget.data.tags.length;
                store.createSnapshot("回滚前自动快照", { actor, auto: true });
                store.restoreSnapshot(restoreTarget.id, { actor });
                // 一致性校验：读取持久化后的状态（多维度）
                setTimeout(() => {
                  try {
                    const raw = localStorage.getItem("timeamber:admin-state:v8");
                    const parsed = raw
                      ? (JSON.parse(raw) as {
                          posts?: { slug?: string }[];
                          categories?: unknown[];
                          tags?: unknown[];
                        })
                      : null;
                    const got = parsed?.posts?.length ?? null;
                    const gotSlugs = new Set((parsed?.posts ?? []).map((p) => p.slug ?? ""));
                    const gotCats = parsed?.categories?.length ?? 0;
                    const gotTags = parsed?.tags?.length ?? 0;
                    const issues: string[] = [];
                    if (got !== null && got !== expected) issues.push(`文章数 ${expected}→${got}`);
                    if (gotCats !== expCats) issues.push(`分类 ${expCats}→${gotCats}`);
                    if (gotTags !== expTags) issues.push(`标签 ${expTags}→${gotTags}`);
                    const missing = [...expSlugs].filter((s) => !gotSlugs.has(s));
                    if (missing.length) issues.push(`缺失 ${missing.length} 篇`);
                    if (issues.length) {
                      const message = `回滚一致性校验失败：${issues.join("，")}`;
                      store.addAlert({
                        level: "warning",
                        source: "backup/restore",
                        message,
                      });
                      toast.warning(message);
                    } else {
                      toast.success(
                        `已回滚，一致性校验通过（${expected} 篇 / ${expCats} 分类 / ${expTags} 标签）`,
                      );
                    }
                  } catch {
                    toast.success("已回滚");
                  }
                }, 120);
                setRestoreTarget(null);
              }}
            >
              确认回滚
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "destructive";
}) {
  return (
    <div className="rounded border border-border/60 bg-card/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={
          "mt-0.5 font-mono text-sm " +
          (tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
        autoComplete="off"
      />
    </div>
  );
}

function PushPullButtons({
  busy,
  isBusy,
  prefix,
  onPush,
  onPull,
}: {
  busy: string | null;
  isBusy: (k: string) => boolean;
  prefix: string;
  onPush: () => void;
  onPull: () => void;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <Button size="sm" disabled={!!busy} onClick={onPush}>
        {isBusy(`${prefix}-push`) ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-4 w-4" />
        )}
        推送备份
      </Button>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={onPull}>
        {isBusy(`${prefix}-pull`) ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" />
        )}
        从云端恢复
      </Button>
    </div>
  );
}

function AlertsSection() {
  const store = useAdminStore();
  const alerts = store.alerts;
  const unack = alerts.filter((a) => !a.acknowledged).length;
  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {unack > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-primary" />
          )}
          <h2 className="font-display text-base font-semibold">备份告警</h2>
          <span className="text-xs text-muted-foreground">
            {unack} 未处理 · 共 {alerts.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="destructive"
          disabled={alerts.length === 0}
          onClick={() => store.clearAlerts()}
        >
          清空
        </Button>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          一切正常。备份或恢复失败、回滚一致性问题会在这里出现。
        </p>
      ) : (
        <ul className="max-h-60 space-y-2 overflow-auto">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={
                "flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm " +
                (a.acknowledged
                  ? "border-border/40 bg-background/40 opacity-60"
                  : a.level === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : a.level === "warning"
                      ? "border-warning/40 bg-warning/5"
                      : "border-border/60 bg-background/40")
              }
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{a.message}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(a.at).toLocaleString()} · {a.source} · {a.level}
                </p>
              </div>
              {!a.acknowledged && (
                <Button size="sm" variant="ghost" onClick={() => store.ackAlert(a.id)}>
                  标记已处理
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
