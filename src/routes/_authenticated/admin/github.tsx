import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  Github,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  GitCommit,
} from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { getGithubStatus } from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/admin/github")({
  component: GithubPanel,
});

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function GithubPanel() {
  const { settings, updateSettings } = useAdminStore();
  const [repoDraft, setRepoDraft] = useState(settings.githubRepo ?? "");
  const [branchDraft, setBranchDraft] = useState(settings.githubBranch ?? "");

  useEffect(() => {
    setRepoDraft(settings.githubRepo ?? "");
    setBranchDraft(settings.githubBranch ?? "");
  }, [settings.githubRepo, settings.githubBranch]);

  const fetchStatus = useServerFn(getGithubStatus);
  const enabled = !!settings.githubRepo;
  const query = useQuery({
    queryKey: ["github-status", settings.githubRepo, settings.githubBranch],
    queryFn: () =>
      fetchStatus({
        data: {
          repo: settings.githubRepo ?? "",
          branch: settings.githubBranch || undefined,
        },
      }),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const status = query.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Github className="h-6 w-6 text-primary" />
          GitHub 同步状态
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lovable 与 GitHub 双向自动同步，每次编辑会以 <code>lovable-dev[bot]</code> 身份提交。下方实时拉取所配置仓库的最新提交与推送时间。
        </p>
      </header>

      {/* 仓库配置 */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">仓库配置</h2>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <div>
            <Label htmlFor="repo">仓库 (owner/name 或完整 URL)</Label>
            <Input
              id="repo"
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              placeholder="例如：NextCandy/TimeAmber"
              className="mt-1.5 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="branch">分支（留空使用默认分支）</Label>
            <Input
              id="branch"
              value={branchDraft}
              onChange={(e) => setBranchDraft(e.target.value)}
              placeholder="main"
              className="mt-1.5 font-mono text-sm"
            />
          </div>
          <Button
            onClick={() => {
              updateSettings({
                githubRepo: repoDraft.trim(),
                githubBranch: branchDraft.trim(),
              });
              toast.success("已保存仓库配置");
            }}
          >
            保存
          </Button>
        </div>
      </section>

      {!enabled && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          请在上方填写并保存 GitHub 仓库后查看同步状态。
        </div>
      )}

      {enabled && (
        <>
          {/* 摘要卡 */}
          <section className="rounded-xl border border-border/70 bg-card/40 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {status?.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : query.isLoading ? (
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <div>
                  <div className="font-mono text-sm">
                    {status?.repo ?? settings.githubRepo}
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      {status?.branch ?? settings.githubBranch ?? "main"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {query.isLoading
                      ? "正在拉取……"
                      : status?.ok
                        ? `状态正常 · 数据获取于 ${timeAgo(status.fetchedAt)}`
                        : `获取失败：${status?.error ?? "未知错误"}`}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query.refetch()}
                  disabled={query.isFetching}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
                  />
                  刷新
                </Button>
                {status?.htmlUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={status.htmlUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      打开仓库
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">最近推送</div>
                <div className="mt-1 flex items-center gap-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {timeAgo(status?.pushedAt)}
                </div>
                {status?.pushedAt && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {new Date(status.pushedAt).toLocaleString("zh-CN")}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">默认分支</div>
                <div className="mt-1 font-mono text-sm">{status?.defaultBranch ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">推送结果</div>
                <div className="mt-1 text-sm">
                  {status?.ok ? (
                    <span className="text-emerald-500">成功</span>
                  ) : (
                    <span className="text-destructive">失败</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 最新 commit */}
          {status?.latestCommit && (
            <section className="rounded-xl border border-border/70 bg-card/40 p-6">
              <h2 className="mb-3 font-display text-base font-semibold flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-primary" />
                最近一次自动提交
              </h2>
              <CommitRow commit={status.latestCommit} highlight />
            </section>
          )}

          {/* 历史 */}
          {status?.recentCommits && status.recentCommits.length > 1 && (
            <section className="rounded-xl border border-border/70 bg-card/40 p-6">
              <h2 className="mb-3 font-display text-base font-semibold">历史提交（最近 10 条）</h2>
              <div className="divide-y divide-border/60">
                {status.recentCommits.slice(1).map((c) => (
                  <CommitRow key={c.sha} commit={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CommitRow({
  commit,
  highlight,
}: {
  commit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    authorAvatar?: string;
    date: string;
    url: string;
  };
  highlight?: boolean;
}) {
  function copySha() {
    navigator.clipboard?.writeText(commit.sha);
    toast.success(`已复制 ${commit.shortSha}`);
  }
  return (
    <div className={`flex items-start gap-3 py-3 ${highlight ? "" : ""}`}>
      {commit.authorAvatar && (
        <img
          src={commit.authorAvatar}
          alt={commit.author}
          className="h-8 w-8 shrink-0 rounded-full border border-border/60"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs">
            {commit.shortSha}
          </code>
          <button
            type="button"
            onClick={copySha}
            className="text-muted-foreground hover:text-foreground"
            title="复制完整 hash"
            aria-label="复制完整 hash"
          >
            <Copy className="h-3 w-3" />
          </button>
          <a
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium hover:underline"
          >
            {commit.message}
          </a>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {commit.author} · {timeAgo(commit.date)} ·{" "}
          {commit.date ? new Date(commit.date).toLocaleString("zh-CN") : ""}
        </div>
      </div>
    </div>
  );
}
