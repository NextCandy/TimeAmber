import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, Trash2, Copy, Loader2, Cloud, RotateCw, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
    if (!q) return store.media;
    return store.media.filter((m) => m.name.toLowerCase().includes(q));
  }, [store.media, filter]);

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
        p.map((x, i) =>
          i === idx ? { ...x, pct: 100, status: "done", attempts: attempt } : x,
        ),
      );
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失败";
      if (attempt < MAX && !/不是图片|超过 10MB/.test(msg)) {
        setProgress((p) =>
          p.map((x, i) =>
            i === idx ? { ...x, pct: 10, status: "uploading", msg: `第 ${attempt} 次失败，重试中…`, attempts: attempt } : x,
          ),
        );
        await new Promise((r) => setTimeout(r, 600 * attempt));
        return uploadOne(idx, f, attempt + 1);
      }
      setProgress((p) =>
        p.map((x, i) =>
          i === idx
            ? { ...x, pct: 100, status: "error", msg: `${msg}（已重试 ${attempt - 1} 次）`, attempts: attempt }
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

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.success("已复制链接"));
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
            <Select value={host.provider} onValueChange={(v) => onProvider(v as ImageHostConfig["provider"])}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
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
            <Button variant="outline" size="sm" onClick={saveConfig}>保存</Button>
          </div>
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
                上传任务 · {progress.filter((p) => p.status === "done").length}/{progress.length} 完成
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
                        ? p.msg ?? `${p.pct}%`
                        : p.status === "done"
                        ? "完成"
                        : p.msg ?? "失败"}
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
                <div className="aspect-square w-full overflow-hidden bg-muted/30">
                  <img
                    src={m.url}
                    alt={m.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium" title={m.name}>{m.name}</p>
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
    </div>
  );
}
