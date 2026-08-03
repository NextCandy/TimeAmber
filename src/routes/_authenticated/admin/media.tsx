import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  Copy,
  Loader2,
  Cloud,
  RotateCw,
  Download,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminStore, type ImageHostConfig } from "@/lib/admin-store";
import { seeUpload } from "@/lib/media.functions";

export const Route = createFileRoute("/_authenticated/admin/media")({
  component: MediaPage,
});

const PRESETS: Record<ImageHostConfig["provider"], { endpoint: string; label: string }> = {
  supabase: { endpoint: "supabase://media", label: "Supabase Storage (NAS)" },
  see: { endpoint: "https://s.ee/api/v2/upload", label: "s.ee（默认）" },
  smms: { endpoint: "https://sm.ms/api/v2/upload", label: "SM.MS 官方" },
  custom: { endpoint: "", label: "自定义（SM.MS v2 兼容）" },
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

type Progress = {
  name: string;
  pct: number;
  status: "uploading" | "done" | "error";
  msg?: string;
  file?: File;
  attempts?: number;
};

function MediaPage() {
  const store = useAdminStore();
  const initial: ImageHostConfig = store.cloud.imageHost ?? {
    provider: "supabase",
    endpoint: PRESETS.supabase.endpoint,
    token: "",
  };
  const [host, setHost] = useState<ImageHostConfig>(initial);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState("all");
  const [after, setAfter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const [thumbnailFallbacks, setThumbnailFallbacks] = useState<Set<string>>(() => new Set());
  const [missingImages, setMissingImages] = useState<Set<string>>(() => new Set());
  const [retryVersion, setRetryVersion] = useState(0);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useServerFn(seeUpload);

  useEffect(() => {
    setHost(
      store.cloud.imageHost ?? {
        provider: "supabase",
        endpoint: PRESETS.supabase.endpoint,
        token: "",
      },
    );
  }, [store.cloud.imageHost, store.cloud.see?.token]);

  function onProvider(p: ImageHostConfig["provider"]) {
    setHost((h) => ({
      ...h,
      provider: p,
      endpoint: PRESETS[p].endpoint || h.endpoint,
    }));
  }

  function saveConfig() {
    store.updateCloud({ imageHost: host, see: { token: host.token } });
    toast.success("图床配置已保存");
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const afterAt = after ? new Date(`${after}T00:00:00+08:00`).getTime() : 0;
    return store.media.filter((m) => {
      if (kind !== "all" && m.source !== kind) return false;
      if (afterAt && new Date(m.uploadedAt).getTime() < afterAt) return false;
      return !q || m.name.toLowerCase().includes(q);
    });
  }, [store.media, filter, kind, after]);

  const pageAllSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  function toggleSelected(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllSelected() {
    setSelected((previous) => {
      const next = new Set(previous);
      if (pageAllSelected) filtered.forEach((item) => next.delete(item.id));
      else filtered.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function retryThumbnail(id: string) {
    setThumbnailFallbacks((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setMissingImages((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setRetryVersion((version) => version + 1);
    toast.info("已重新请求缩略图；若仍缺失，请运行 opt:fix-thumbs 队列");
  }

  function confirmBatchDelete() {
    for (const id of selected) store.removeMedia(id);
    setSelected(new Set());
    setPendingBatchDelete(false);
    toast.success("已从媒体索引移除所选记录；原图未被脚本删除");
  }

  async function uploadOne(idx: number, f: File, attempt = 1): Promise<boolean> {
    const MAX = 3;
    try {
      if (!f.type.startsWith("image/")) throw new Error("不是图片");
      if (f.size > 10 * 1024 * 1024) throw new Error("超过 10MB");
      setProgress((p) =>
        p.map((x, i) => (i === idx ? { ...x, pct: 25, status: "uploading", msg: undefined } : x)),
      );
      const base64 = await fileToBase64(f);
      setProgress((p) => p.map((x, i) => (i === idx ? { ...x, pct: 55 } : x)));
      const { url } = await upload({
        data: {
          endpoint: host.endpoint,
          token: host.token,
          filename: f.name,
          contentType: f.type,
          base64,
        },
      });
      store.addMedia({
        name: f.name,
        url,
        size: f.size,
        source: host.provider === "supabase" ? "supabase" : "see",
      });
      setProgress((p) =>
        p.map((x, i) => (i === idx ? { ...x, pct: 100, status: "done", attempts: attempt } : x)),
      );
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失败";
      if (attempt < MAX && !/不是图片|超过 10MB/.test(msg)) {
        setProgress((p) =>
          p.map((x, i) =>
            i === idx
              ? {
                  ...x,
                  pct: 10,
                  status: "uploading",
                  msg: `第 ${attempt} 次失败，重试中…`,
                  attempts: attempt,
                }
              : x,
          ),
        );
        await new Promise((r) => setTimeout(r, 600 * attempt));
        return uploadOne(idx, f, attempt + 1);
      }
      setProgress((p) =>
        p.map((x, i) =>
          i === idx
            ? {
                ...x,
                pct: 100,
                status: "error",
                msg: `${msg}（已重试 ${attempt - 1} 次）`,
                attempts: attempt,
              }
            : x,
        ),
      );
      store.addMediaFailure({
        name: f.name,
        size: f.size,
        contentType: f.type,
        attempts: attempt,
        error: msg,
      });
      return false;
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (host.provider !== "supabase" && !host.token.trim()) {
      toast.error("请先填写图床 Token");
      return;
    }
    if (!host.endpoint.trim()) {
      toast.error("请先填写自定义图床 endpoint");
      return;
    }
    store.updateCloud({ imageHost: host, see: { token: host.token } });
    setBusy(true);
    const list = Array.from(files);
    setProgress(list.map((f) => ({ name: f.name, pct: 0, status: "uploading", file: f })));
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      if (await uploadOne(i, list[i])) ok++;
    }
    setBusy(false);
    const failed = list.length - ok;
    if (failed === 0) toast.success(`上传完成（${ok} 个文件）`);
    else toast.warning(`完成 ${ok}，失败 ${failed}（可点击重试）`);
  }

  async function retryFailed() {
    const targets = progress
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.status === "error" && p.file);
    if (targets.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const { i, p } of targets) {
      if (p.file && (await uploadOne(i, p.file))) ok++;
    }
    setBusy(false);
    toast[ok === targets.length ? "success" : "warning"](
      `重试完成：成功 ${ok} / ${targets.length}`,
    );
  }

  function copyText(value: string, message: string) {
    navigator.clipboard.writeText(value).then(() => toast.success(message));
  }

  function copy(url: string) {
    copyText(url, "已复制链接");
  }

  function exportFailuresCsv() {
    const rows = [
      ["时间", "文件名", "大小(字节)", "类型", "尝试次数", "错误"],
      ...store.mediaFailures.map((f) => [
        f.at,
        f.name,
        String(f.size ?? ""),
        f.contentType ?? "",
        String(f.attempts),
        f.error.replace(/"/g, '""'),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeamber-media-failures-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">媒体库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          支持 SM.MS v2 协议的所有兼容图床：s.ee、SM.MS 官方，或自定义 endpoint。
        </p>
      </header>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">图床配置</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>服务商</Label>
            <Select
              value={host.provider}
              onValueChange={(v) => onProvider(v as ImageHostConfig["provider"])}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Endpoint</Label>
            <Input
              value={host.endpoint}
              onChange={(e) => setHost({ ...host, endpoint: e.target.value })}
              placeholder="https://s.ee/api/v2/upload"
              className="mt-1.5 font-mono text-sm"
              maxLength={300}
              disabled={host.provider !== "custom"}
            />
          </div>
          <div className="md:col-span-2">
            <Label>API Token</Label>
            <Input
              type="password"
              value={host.token}
              onChange={(e) => setHost({ ...host, token: e.target.value })}
              placeholder="在所选图床后台获取"
              className="mt-1.5"
              maxLength={500}
            />
          </div>
          <div className="flex items-end justify-end">
            <Button variant="outline" size="sm" onClick={saveConfig}>
              保存
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-2 flex items-center gap-2">
          <RotateCw className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">缩略图修复队列</h2>
          <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] text-primary">只写派生文件</span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          先运行只读扫描再 apply；队列落盘到 <code>reports/opt/thumbs/queue.json</code>，支持 resume / only-failed / SIGINT。原图路径、哈希与每批抽检结果会进入 fix-report，不会删除或覆盖原图。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copyText("npm run opt:scan-thumbs -- --label media-scan", "已复制扫描命令")}>复制诊断命令</Button>
          <Button variant="outline" size="sm" onClick={() => copyText("npm run opt:fix-thumbs -- --apply --resume --concurrency 3 --rps 5", "已复制修复命令")}>复制恢复命令</Button>
          <span className="self-center text-[11px] text-muted-foreground">最近结果请查看 reports/opt/thumbs/ 下的 scan-report 与 fix-report</span>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">图片</h2>
            <span className="text-xs text-muted-foreground">共 {store.media.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="按文件名搜索…"
              className="h-8 w-48"
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs">
              <option value="all">全部类型</option>
              <option value="supabase">Supabase</option>
              <option value="see">图床</option>
              <option value="imported">导入</option>
              <option value="manual">手动</option>
            </select>
            <Input type="date" value={after} onChange={(e) => setAfter(e.target.value)} className="h-8 w-32 text-xs" aria-label="上传时间起点" />
            <Button variant="outline" size="sm" onClick={toggleAllSelected} disabled={!filtered.length}>
              {pageAllSelected ? "取消全选" : "全选"}
            </Button>
            {selected.size > 0 && <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingBatchDelete(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />删除 {selected.size}</Button>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              上传图片
            </Button>
          </div>
        </div>

        {progress.length > 0 && (
          <div className="mb-4 rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                上传任务 · {progress.filter((p) => p.status === "done").length}/{progress.length}{" "}
                完成
                {progress.some((p) => p.status === "error") &&
                  ` · ${progress.filter((p) => p.status === "error").length} 失败`}
              </p>
              <div className="flex gap-1.5">
                {progress.some((p) => p.status === "error") && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={retryFailed}>
                    <RotateCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                    重试失败
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setProgress([])} disabled={busy}>
                  清除
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {progress.map((p, idx) => (
                <li key={idx} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono" title={p.name}>
                      {p.name}
                      {p.attempts && p.attempts > 1 && (
                        <span className="ml-1 text-muted-foreground">· 重试 {p.attempts - 1}</span>
                      )}
                    </span>
                    <span
                      className={
                        p.status === "error"
                          ? "text-destructive"
                          : p.status === "done"
                            ? "text-primary"
                            : "text-muted-foreground"
                      }
                    >
                      {p.status === "uploading"
                        ? (p.msg ?? `${p.pct}%`)
                        : p.status === "done"
                          ? "完成"
                          : (p.msg ?? "失败")}
                    </span>
                    {p.status === "error" && p.file && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          uploadOne(idx, p.file!).finally(() => setBusy(false));
                        }}
                      >
                        重试
                      </Button>
                    )}
                  </div>
                  <Progress value={p.pct} className="h-1.5" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有任何图片。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((m) => (
              <div
                key={m.id}
                className="group relative overflow-hidden rounded-lg border border-border/60 bg-background/50"
                style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }}
              >
                <label className="absolute left-2 top-2 z-10 rounded bg-background/90 p-1 shadow-sm">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelected(m.id)} aria-label={`选择 ${m.name}`} className="h-4 w-4 accent-primary" />
                </label>
                <div className="aspect-square w-full overflow-hidden bg-muted/30">
                  {missingImages.has(m.id) ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
                      <ImageIcon className="h-8 w-8 opacity-40" />
                      <span className="break-all">{m.name}</span>
                      <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => retryThumbnail(m.id)}>重试生成</Button>
                    </div>
                  ) : (
                    <img
                      key={`${m.id}-${retryVersion}-${thumbnailFallbacks.has(m.id) ? "original" : "thumb"}`}
                      src={thumbnailFallbacks.has(m.id) ? m.url : (m.thumbnailUrl ?? m.url)}
                      alt={m.name}
                      width={260}
                      height={260}
                      loading="lazy"
                      decoding="async"
                      onError={() => {
                        if (m.thumbnailUrl && !thumbnailFallbacks.has(m.id)) setThumbnailFallbacks((previous) => new Set(previous).add(m.id));
                        else setMissingImages((previous) => new Set(previous).add(m.id));
                      }}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium" title={m.name}>
                    {m.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {m.source === "see" ? "图床" : m.source === "imported" ? "导入" : "手动"}
                  </p>
                </div>
                <div className="absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded-md bg-background/90 p-1 text-foreground/80 hover:text-foreground"
                    onClick={() => copy(m.url)}
                    aria-label="复制链接"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-md bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => store.removeMedia(m.id)}
                    aria-label="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h2 className="font-display text-base font-semibold">失败任务清单</h2>
            <span className="text-xs text-muted-foreground">
              共 {store.mediaFailures.length}（最多保留 100 条）
            </span>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={store.mediaFailures.length === 0}
              onClick={exportFailuresCsv}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> 导出 CSV
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={store.mediaFailures.length === 0}
              onClick={() => {
                store.clearMediaFailures();
                toast.success("已清空失败清单");
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 清空
            </Button>
          </div>
        </div>
        {store.mediaFailures.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无持久化失败记录。</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60 text-left">
                  <th className="py-1.5">时间</th>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>尝试</th>
                  <th>错误</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.mediaFailures.map((f) => (
                  <tr key={f.id} className="border-b border-border/40">
                    <td className="py-1.5 font-mono">{new Date(f.at).toLocaleString("zh-CN")}</td>
                    <td className="font-mono">{f.name}</td>
                    <td>{f.size ? `${Math.round(f.size / 1024)} KB` : "-"}</td>
                    <td>{f.attempts}</td>
                    <td className="text-destructive">{f.error}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => store.removeMediaFailure(f.id)}
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

      <AlertDialog open={pendingBatchDelete} onOpenChange={setPendingBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移除 {selected.size} 条媒体索引？</AlertDialogTitle>
            <AlertDialogDescription>
              本操作只移除媒体库索引，不会由缩略图队列删除原图；请确认已有备份，且不会误删仍被文章引用的记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBatchDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">确认移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
