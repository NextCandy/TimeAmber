import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpenText,
  BrainCircuit,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  askTimeAmber,
  getAskTimeAmberStatus,
  type AskTimeAmberResult,
  type AskTimeAmberStatus,
} from "@/lib/ask.functions";
import type { AskSource, KnowledgeSourceType } from "@/lib/ask-core";
import { runSyncTask } from "@/lib/sync.functions";

export const Route = createFileRoute("/_authenticated/admin/ask")({
  head: () => ({
    meta: [
      { title: "Ask TimeAmber · 私人数字记忆" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AskTimeAmberPage,
});

const EXAMPLE_QUESTIONS = [
  "我以前保存过哪些关于 Cloudflare 的内容？",
  "总结我收藏的自托管 AI Agent 相关文章。",
  "我以前是怎么部署 Hermes Agent 的？",
  "找出我过去关于域名管理的文章和收藏。",
];

const SOURCE_LABELS: Record<KnowledgeSourceType, string> = {
  blog: "Blog",
  notion: "Notion",
  web_archive: "Web Archive",
};

function formatSourceDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后再试";
}

function AskTimeAmberPage() {
  const loadStatus = useServerFn(getAskTimeAmberStatus);
  const ask = useServerFn(askTimeAmber);
  const runSync = useServerFn(runSyncTask);
  const [status, setStatus] = useState<AskTimeAmberStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskTimeAmberResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatusError(null);
      setStatus(await loadStatus());
    } catch (statusLoadError) {
      setStatusError(errorMessage(statusLoadError));
    }
  }, [loadStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const canAsk = Boolean(
    status?.provider.configured && status.index.ready && status.index.total > 0 && !loading,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = question.trim();
    if (!value || !canAsk) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await ask({ data: { question: value } }));
    } catch (askError) {
      setError(errorMessage(askError));
    } finally {
      setLoading(false);
    }
  }

  async function repairIndex() {
    setRepairing(true);
    try {
      await runSync({ data: { task: "knowledge-index" } });
      await refreshStatus();
      toast.success("知识索引补全任务已完成一批");
    } catch (repairError) {
      toast.error(errorMessage(repairError));
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/50 px-5 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-primary">
            <BrainCircuit className="h-4 w-4" />
            Ask TimeAmber
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            询问你的数字记忆
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            从博客、Notion
            剪藏和网页归档中找回曾经保存的线索。回答只依据检索到的内容，并始终附上可核对的来源。
          </p>
        </div>
      </header>

      <StatusPanel
        status={status}
        error={statusError}
        repairing={repairing}
        onRepair={repairIndex}
        onRefresh={refreshStatus}
      />

      <section className="rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="ask-timeamber-question" className="sr-only">
            向 TimeAmber 提问
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-primary" />
            <Textarea
              id="ask-timeamber-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：我以前保存过哪些关于 Cloudflare 的内容？"
              maxLength={1000}
              rows={4}
              disabled={!canAsk}
              className="min-h-32 resize-none rounded-xl border-border/80 bg-background/70 pb-12 pl-12 pr-4 pt-4 text-base leading-7 shadow-inner focus-visible:border-primary/60 focus-visible:ring-primary/20"
            />
            <span className="absolute bottom-3 left-4 text-[11px] text-muted-foreground">
              {question.length} / 1000
            </span>
            <Button
              type="submit"
              disabled={!canAsk || question.trim().length < 2}
              className="absolute bottom-3 right-3"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {loading ? "正在检索" : "询问记忆"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                disabled={!canAsk}
                onClick={() => setQuestion(example)}
                className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        </form>
      </section>

      <div aria-live="polite" aria-busy={loading}>
        {loading ? <AnswerLoading /> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>没有完成这次检索</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {result ? <AnswerResult result={result} /> : null}
        {!loading && !error && !result ? <MemoryEmptyState /> : null}
      </div>
    </div>
  );
}

function StatusPanel({
  status,
  error,
  repairing,
  onRepair,
  onRefresh,
}: {
  status: AskTimeAmberStatus | null;
  error: string | null;
  repairing: boolean;
  onRepair: () => void;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>无法读取 Ask TimeAmber 状态</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            重试
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!status) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }
  if (!status.provider.configured) {
    return (
      <Alert className="border-warning/30 bg-warning/5">
        <AlertCircle className="h-4 w-4 text-warning" />
        <AlertTitle>AI Provider 尚未配置</AlertTitle>
        <AlertDescription>
          在 TimeAmber 应用容器中配置 {status.provider.missing.join("、")}{" "}
          后即可提问。现有网站、同步和后台不受影响。
        </AlertDescription>
      </Alert>
    );
  }
  if (!status.index.ready) {
    return (
      <Alert variant="destructive">
        <Database className="h-4 w-4" />
        <AlertTitle>知识索引尚未初始化</AlertTitle>
        <AlertDescription>请先执行 Ask TimeAmber 数据库 migration。</AlertDescription>
      </Alert>
    );
  }

  const stats = [
    { label: "全部记忆", value: status.index.total },
    { label: "Blog", value: status.index.blog },
    { label: "Notion", value: status.index.notion },
    { label: "Web Archive", value: status.index.webArchive },
  ];
  return (
    <section className="rounded-xl border border-border/70 bg-card/30 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            {status.provider.model}
          </Badge>
          {status.index.archivePending > 0 ? (
            <Button size="sm" variant="outline" disabled={repairing} onClick={onRepair}>
              {repairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              补全归档 {status.index.archivePending}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AnswerLoading() {
  return (
    <section className="space-y-5 rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-7">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        正在翻阅你的数字记忆并核对来源…
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </section>
  );
}

function AnswerResult({ result }: { result: AskTimeAmberResult }) {
  if (result.noResults) {
    return (
      <section className="rounded-2xl border border-dashed border-border/80 bg-card/30 p-8 text-center">
        <Search className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 font-display text-lg font-semibold">没有找到足够资料</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {result.answer}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-8 rounded-2xl border border-primary/15 bg-card/40 p-5 shadow-glow-soft sm:p-8">
      <div>
        <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-4 w-4" />
          回答
        </div>
        <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90 sm:text-base">
          {result.answer}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Sources</h2>
          </div>
          <span className="text-xs text-muted-foreground">{result.sources.length} 条资料</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: AskSource }) {
  const date = formatSourceDate(source.date);
  const internalLabel = source.sourceType === "web_archive" ? "打开归档" : "站内查看";
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-background/45 p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline" className="font-mono text-[10px]">
          {source.id} · {SOURCE_LABELS[source.sourceType]}
        </Badge>
        {date ? <time className="text-[11px] text-muted-foreground">{date}</time> : null}
      </div>
      <h3 className="mt-3 break-words font-display text-base font-semibold leading-6">
        {source.title}
      </h3>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">
        {source.summary || "这条资料没有可用摘要。"}
      </p>
      <div className="mt-auto flex flex-wrap gap-3 pt-4 text-xs">
        {source.originalUrl ? (
          <a
            href={source.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            打开原文 <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
        {source.internalUrl && source.internalUrl !== source.originalUrl ? (
          <a
            href={source.internalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {internalLabel} <FileText className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function MemoryEmptyState() {
  return (
    <section className="rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-10 text-center">
      <BrainCircuit className="mx-auto h-8 w-8 text-primary/70" />
      <h2 className="mt-4 font-display text-lg font-semibold">从一个具体线索开始</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        产品名、域名、部署方式和项目名称通常能找到更准确的记忆。你的问题不会被写入公开页面。
      </p>
    </section>
  );
}
