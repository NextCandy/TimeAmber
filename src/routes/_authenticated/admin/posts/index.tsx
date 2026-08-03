import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAdminBatchQueue,
  DEFAULT_ADMIN_BATCH_QUEUE_CONFIG,
  type AdminBatchQueueConfig,
  type AdminBatchQueueFailure,
  type AdminBatchQueueItem,
  type AdminBatchQueueRun,
  type AdminBatchQueueSnapshot,
} from "@/lib/admin-batch-queue";
import {
  batchUpdateAdminPosts,
  deletePostRow,
  loadAdminPostSlugs,
  loadAdminPostsPage,
  setPostPublished,
} from "@/lib/state.functions";
import type { Post } from "@/lib/sample-posts";

type StatusFilter = "all" | "published" | "draft";
type SortKey = "new" | "old" | "title" | "reading";
type BatchAction = "status" | "category" | "delete" | "restore";
type PageSize = 20 | 50 | 100;

type PostsSearch = {
  q?: string;
  status?: StatusFilter;
  cat?: string;
  from?: string;
  to?: string;
  sort?: SortKey;
  view?: "active" | "trash";
  page?: number;
  size?: PageSize;
};

const PAGE_SIZES: PageSize[] = [20, 50, 100];

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validatePostsSearch(search: Record<string, unknown>): PostsSearch {
  const status = search.status === "published" || search.status === "draft" ? search.status : undefined;
  const sort = search.sort === "old" || search.sort === "title" || search.sort === "reading" ? search.sort : undefined;
  const view = search.view === "trash" ? "trash" : undefined;
  const size = PAGE_SIZES.includes(Number(search.size) as PageSize) ? Number(search.size) as PageSize : undefined;
  return {
    q: optionalText(search.q),
    status,
    cat: optionalText(search.cat),
    from: optionalText(search.from),
    to: optionalText(search.to),
    sort,
    view,
    page: positiveInt(search.page, 1),
    size,
  };
}

export const Route = createFileRoute("/_authenticated/admin/posts/")({
  validateSearch: validatePostsSearch,
  loaderDeps: ({ search }) => ({
    q: search.q,
    status: search.status,
    cat: search.cat,
    from: search.from,
    to: search.to,
    sort: search.sort,
    view: search.view,
    page: search.page ?? 1,
    size: search.size ?? 20,
  }),
  loader: async ({ deps }) =>
    loadAdminPostsPage({
      data: {
        offset: (deps.page - 1) * deps.size,
        limit: deps.size,
        query: deps.q,
        status: deps.status ?? "all",
        category: deps.cat,
        dateFrom: deps.from,
        dateTo: deps.to,
        sort: deps.sort ?? "new",
        visibility: deps.view ?? "active",
      },
    }),
  component: PostsList,
});

function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const values: Array<number | "…"> = [1];
  if (current > 4) values.push("…");
  for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) {
    values.push(page);
  }
  if (current < total - 3) values.push("…");
  values.push(total);
  return values;
}

function readQueueConfig(): AdminBatchQueueConfig {
  if (typeof window === "undefined") return DEFAULT_ADMIN_BATCH_QUEUE_CONFIG;
  try {
    const raw = window.localStorage.getItem("timeamber.admin-post-queue-config");
    return raw
      ? { ...DEFAULT_ADMIN_BATCH_QUEUE_CONFIG, ...(JSON.parse(raw) as Partial<AdminBatchQueueConfig>) }
      : DEFAULT_ADMIN_BATCH_QUEUE_CONFIG;
  } catch {
    return DEFAULT_ADMIN_BATCH_QUEUE_CONFIG;
  }
}

function writeTaskRecord(record: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const key = "timeamber.admin-post-task-records";
    const previous = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    const records = Array.isArray(previous) ? previous : [];
    window.localStorage.setItem(key, JSON.stringify([{ ...record, at: new Date().toISOString() }, ...records].slice(0, 20)));
  } catch {
    // localStorage 不可用时不影响服务器批处理。
  }
}

function csvDownload(failures: AdminBatchQueueFailure[]) {
  if (typeof window === "undefined") return;
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const body = [
    "slug,error,attempts",
    ...failures.map((item) => [escape(item.slug), escape(item.error), item.attempts].join(",")),
  ].join("\r\n");
  const blob = new Blob(["\ufeff", body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `timeamber-post-batch-failures-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PostsList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const pageData = Route.useLoaderData();
  const page = Math.max(1, search.page ?? 1);
  const pageSize = search.size ?? 20;
  const pageCount = Math.max(1, Math.ceil(pageData.total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageSlugs = useMemo(() => pageData.posts.map((post) => post.slug), [pageData.posts]);

  const [query, setQuery] = useState(search.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedDetails, setSelectedDetails] = useState<Map<string, Post>>(() => new Map());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const [knownPages, setKnownPages] = useState<Map<number, string[]>>(() => new Map());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const [batchAction, setBatchAction] = useState<BatchAction>("status");
  const [batchStatus, setBatchStatus] = useState<"published" | "draft">("published");
  const [batchCategory, setBatchCategory] = useState("");
  const [queueConfig, setQueueConfig] = useState<AdminBatchQueueConfig>(readQueueConfig);
  const [queueRun, setQueueRun] = useState<AdminBatchQueueRun | null>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<AdminBatchQueueSnapshot | null>(null);
  const [failures, setFailures] = useState<AdminBatchQueueFailure[]>([]);
  const operationRef = useRef<{ action: BatchAction; status?: "published" | "draft"; category?: string } | null>(null);

  useEffect(() => {
    setQuery(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    if (search.view !== "trash" && batchAction === "restore") setBatchAction("status");
  }, [batchAction, search.view]);

  useEffect(() => {
    setKnownPages((previous) => new Map(previous).set(safePage, pageSlugs));
    setSelectedDetails((previous) => {
      const next = new Map(previous);
      for (const post of pageData.posts) next.set(post.slug, post);
      return next;
    });
  }, [pageData.posts, pageSlugs, safePage]);

  useEffect(() => {
    if (safePage !== page) {
      void navigate({ search: (previous) => ({ ...previous, page: safePage }) });
    }
  }, [navigate, page, safePage]);

  useEffect(() => {
    try {
      window.localStorage.setItem("timeamber.admin-post-queue-config", JSON.stringify(queueConfig));
    } catch {
      // localStorage 不可用时使用内存配置。
    }
  }, [queueConfig]);

  const selectedCount = selectAllMatching ? pageData.total : selected.size;
  const pageSelectedCount = pageSlugs.filter((slug) => selected.has(slug)).length;
  const pageAllSelected = pageSlugs.length > 0 && pageSelectedCount === pageSlugs.length;
  const filterSummary = [
    search.q ? `关键词「${search.q}」` : "",
    search.status && search.status !== "all" ? (search.status === "published" ? "已发布" : "草稿") : "",
    search.cat ? `分类「${search.cat}」` : "",
    search.from || search.to ? `日期 ${search.from ?? "最早"}–${search.to ?? "现在"}` : "",
    search.view === "trash" ? "回收站" : "",
  ].filter(Boolean).join(" · ");

  function clearSelection() {
    setSelected(new Set());
    setSelectedDetails(new Map());
    setSelectAllMatching(false);
  }

  function updateSearch(patch: Partial<PostsSearch>, resetPage = true, preserveSelection = false) {
    if (!preserveSelection) clearSelection();
    void navigate({
      search: (previous) => ({
        ...previous,
        ...patch,
        page: resetPage ? 1 : patch.page ?? previous.page ?? 1,
      }),
    });
  }

  useEffect(() => {
    if (query.trim() === (search.q ?? "")) return;
    const timer = window.setTimeout(() => updateSearch({ q: query.trim() || undefined }), 300);
    return () => window.clearTimeout(timer);
  }, [query, search.q]);

  function togglePageSelection() {
    setSelectAllMatching(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (pageAllSelected) pageSlugs.forEach((slug) => next.delete(slug));
      else pageSlugs.forEach((slug) => next.add(slug));
      return next;
    });
  }

  function addAllMatching() {
    setSelectAllMatching(true);
    setSelected(new Set());
  }

  function toggleSelected(slug: string) {
    setSelectAllMatching(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deletePostRow({ data: { slug: pendingDelete } });
      toast.success("已删除");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setPendingDelete(null);
    }
  }

  async function toggleStatus(post: Post) {
    const published = (post.status ?? "published") === "published";
    try {
      await setPostPublished({ data: { slug: post.slug, published: !published } });
      toast.success(!published ? "已发布" : "已改为草稿");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  async function operationSlugs() {
    if (selectAllMatching) {
      const result = await loadAdminPostSlugs({
        data: {
          query: search.q,
          status: search.status ?? "all",
          category: search.cat,
          dateFrom: search.from,
          dateTo: search.to,
          sort: search.sort ?? "new",
          visibility: search.view ?? "active",
        },
      });
      if (result.truncated) throw new Error("匹配文章超过 5000 条，请缩小筛选范围后再执行批处理");
      return result.slugs;
    }
    return [...selected];
  }

  async function executeBatch(
    operation: { action: BatchAction; status?: "published" | "draft"; category?: string },
    overrideSlugs?: string[],
  ) {
    let slugs: string[];
    try {
      slugs = overrideSlugs ?? (await operationSlugs());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取选择项");
      return;
    }
    if (!slugs.length) {
      toast.error("请先选择文章");
      return;
    }
    operationRef.current = operation;
    setFailures([]);
    const items: AdminBatchQueueItem[] = slugs.map((slug) => ({
      slug,
      title: selectedDetails.get(slug)?.title,
    }));
    const taskId = `post-batch-${Date.now()}`;
    writeTaskRecord({ taskId, operation, count: slugs.length, config: queueConfig, filterSummary });
    const run = createAdminBatchQueue(items, async (batch) => {
      const result = await batchUpdateAdminPosts({
        data: {
          slugs: batch.map((item) => item.slug),
          action: operation.action,
          status: operation.status,
          category: operation.category,
          confirmation: operation.action === "delete" ? "DELETE" : undefined,
          taskId,
        },
      });
      return { success: result.processedSlugs, skipped: result.skippedSlugs };
    }, {
      config: queueConfig,
      onUpdate: (snapshot) => setQueueSnapshot(snapshot),
    });
    setQueueRun(run);
    const result = await run.promise;
    setQueueRun(null);
    setQueueSnapshot(run.snapshot());
    setFailures(result.failed);
    if (result.failed.length) toast.error(`批处理完成：${result.failed.length} 条失败`);
    else toast.success(`批处理完成：${result.success.length} 条成功`);
    clearSelection();
    await router.invalidate();
  }

  function startBatch() {
    if (!selectedCount) {
      toast.error("请先选择文章");
      return;
    }
    if (batchAction === "delete") {
      setPendingBatchDelete(true);
      return;
    }
    void executeBatch({
      action: batchAction,
      status: batchAction === "status" ? batchStatus : undefined,
      category: batchAction === "category" ? batchCategory.trim() : undefined,
    });
  }

  function confirmBatchDelete() {
    setPendingBatchDelete(false);
    void executeBatch({ action: "delete" });
  }

  function retryFailures() {
    const operation = operationRef.current;
    if (!operation || !failures.length) return;
    void executeBatch(operation, failures.map((failure) => failure.slug));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">文章</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {pageData.total} 篇 · 当前第 {safePage}/{pageCount} 页 · 服务端分页
            {filterSummary ? ` · ${filterSummary}` : ""}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/posts/new">
            <Plus className="mr-1.5 h-4 w-4" />
            新建文章
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[260px] flex-1">
          <span className="sr-only">搜索文章</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、slug、分类、标签…" className="pl-9" />
 ����G����ƭy�t) => updateSearch({ sort: event.target.value as SortKey })}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <option value="new">发布时间（新→旧）</option>
          <option value="old">发布时间（旧→新）</option>
          <option value="title">标题</option>
          <option value="reading">阅读时长</option>
        </select>
        <select
          value={pageSize}
          onChange={(event) => updateSearch({ size: Number(event.target.value) as PageSize })}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>每页 {size}</option>)}
        </select>
      </div>

      <section className="rounded-xl border border-border/70 bg-card/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={togglePageSelection} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/50">
            <ListChecks className="h-3.5 w-3.5" />
            {pageAllSelected ? "取消本页全选" : "本页全选"}
          </button>
          {pageAllSelected && !selectAllMatching && pageData.total > pageData.posts.length && (
            <button type="button" onClick={addAllMatching} className="rounded-md bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20">
              选择全部匹配的 {pageData.total} 条
            </button>
          )}
          <span className="text-xs text-muted-foreground">已选 {selectedCount} 条{filterSummary ? ` · ${filterSummary}` : ""}</span>
          {selectedCount > 0 && <button type="button" onClick={() => setShowSelected(true)} className="text-xs text-primary hover:underline">查看已选清单</button>}
          {selectAllMatching && <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground">取消全选</button>}
        </div>

        {selectedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <select value={batchAction} onChange={(event) => setBatchAction(event.target.value as BatchAction)} className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
              <option value="status">批量修改状态</option>
              <option value="category">批量移动分类</option>
              <option value="delete">移入回收站</option>
              {search.view === "trash" && <option value="restore">从回收站恢复</option>}
            </select>
            {batchAction === "status" && (
              <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as "published" | "draft")} className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                <option value="published">设为已发布</option>
                <option value="draft">设为草稿</option>
              </select>
            )}
            {batchAction === "category" && (
              <Input value={batchCategory} onChange={(event) => setBatchCategory(event.target.value)} placeholder="目标分类" className="h-8 w-40 text-xs" />
            )}
            <Button size="sm" variant={batchAction === "delete" ? "destructive" : "default"} onClick={startBatch} disabled={!!queueRun || (batchAction === "category" && !batchCategory.trim())}>
              {batchAction === "delete" ? "移入回收站" : batchAction === "restore" ? "恢复所选" : "开始批处理"}
            </Button>
            <details className="ml-auto text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">队列参数</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-4">
                <label>并发<input type="number" min={1} max={10} value={queueConfig.concurrency} onChange={(event) => setQueueConfig((v) => ({ ...v, concurrency: Number(event.target.value) }))} className="mt-1 w-16 rounded border border-border bg-card px-2 py-1" /></label>
                <label>每批<input type="number" min={1} max={100} value={queueConfig.batchSize} onChange={(event) => setQueueConfig((v) => ({ ...v, batchSize: Number(event.target.value) }))} className="mt-1 w-16 rounded border border-border bg-card px-2 py-1" /></label>
                <label>RPS<input type="number" min={0} max={5} step={0.5} value={queueConfig.rps} onChange={(event) => setQueueConfig((v) => ({ ...v, rps: Number(event.target.value) }))} className="mt-1 w-16 rounded border border-border bg-card px-2 py-1" /></label>
                <label>重试<input type="number" min={0} max={5} value={queueConfig.retries} onChange={(event) => setQueueConfig((v) => ({ ...v, retries: Number(event.target.value) }))} className="mt-1 w-16 rounded border border-border bg-card px-2 py-1" /></label>
              </div>
            </details>
          </div>
        )}
      </section>

      {queueSnapshot && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>批处理 {queueSnapshot.status === "paused" ? "已暂停" : queueSnapshot.status === "cancelling" ? "正在取消" : queueSnapshot.status === "completed" ? "已完成" : "进行中"}</strong>
              <span className="ml-2 text-xs text-muted-foreground">批次 {queueSnapshot.batchesDone}/{queueSnapshot.batchesTotal} · 并发 {queueSnapshot.concurrency} · {queueSnapshot.throughput10s.toFixed(1)} 条/秒</span>
            </div>
            <div className="flex items-center gap-1">
              {queueRun && queueSnapshot.status === "running" && <Button size="sm" variant="outline" onClick={queueRun.pause}><Pause className="mr-1 h-3.5 w-3.5" />暂停</Button>}
              {queueRun && queueSnapshot.status === "paused" && <Button size="sm" variant="outline" onClick={queueRun.resume}><Play className="mr-1 h-3.5 w-3.5" />继续</Button>}
              {queueRun && <Button size="sm" variant="ghost" onClick={queueRun.cancel}><Square className="mr-1 h-3.5 w-3.5" />取消</Button>}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${queueSnapshot.total ? ((queueSnapshot.success + queueSnapshot.failed + queueSnapshot.skipped) / queueSnapshot.total) * 100 : 100}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">待处理 {queueSnapshot.pending} · 进行中 {queueSnapshot.inFlight} · 成功 {queueSnapshot.success} · 失败 {queueSnapshot.failed} · 跳过 {queueSnapshot.skipped}{queueSnapshot.estimatedRemainingMs != null ? ` · 预计剩余 ${Math.ceil(queueSnapshot.estimatedRemainingMs / 1000)} 秒` : ""}</p>
        </section>
      )}

      {failures.length > 0 && (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">失败 {failures.length} 条：保留失败清单，可单独重试或导出 CSV。</p>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={retryFailures}>仅重试失败项</Button><Button size="sm" variant="ghost" onClick={() => csvDownload(failures)}>导出 CSV</Button></div>
          </div>
          <ul className="mt-2 max-h-32 overflow-auto text-xs text-muted-foreground">{failures.slice(0, 20).map((failure) => <li key={`${failure.slug}-${failure.error}`}><span className="font-mono">{failure.slug}</span> · {failure.error}</li>)}</ul>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {pageData.posts.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">没有匹配的文章</p> : (
          <ul className="divide-y divide-border/60">
            {pageData.posts.map((post) => {
              const isPublished = (post.status ?? "published") === "published";
              const checked = selectAllMatching || selected.has(post.slug);
              return <li key={post.slug} className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:px-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input type="checkbox" checked={checked} onChange={() => toggleSelected(post.slug)} aria-label={`选择 ${post.title}`} className="mt-1 h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{post.title}</p><span className={isPublished ? "rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary" : "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"}>{isPublished ? "已发布" : "草稿"}</span>{post.type === "html" && <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">HTML</span>}</div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground"><span className="font-mono">{post.slug}</span> · {post.category} · {post.publishAt} · {post.readingMinutes} 分钟</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void toggleStatus(post)} title={isPublished ? "改为草稿" : "立即发布"}>{isPublished ? "下架" : "发布"}</Button>
                  <Button asChild size="icon" variant="ghost">{post.type === "html" && post.externalUrl ? <a href={post.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a> : <Link to="/posts/$slug" params={{ slug: post.slug }} target="_blank"><ExternalLink className="h-4 w-4" /></Link>}</Button>
                  <Button asChild size="icon" variant="ghost"><Link to="/admin/posts/$slug/edit" params={{ slug: post.slug }}><Pencil className="h-4 w-4" /></Link></Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(post.slug)} aria-label="删除"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>;
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" disabled={safePage <= 1} onClick={() => updateSearch({ page: safePage - 1 }, false, true)} className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />上一页</button>
        {pageNumbers(safePage, pageCount).map((value, index) => value === "…" ? <span key={`ellipsis-${index}`} className="px-2 text-xs text-muted-foreground">…</span> : <button key={value} type="button" onClick={() => updateSearch({ page: value }, false, true)} className={`min-w-8 rounded-md border px-2 py-1.5 text-xs ${value === safePage ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{knownPages.get(value)?.some((slug) => selected.has(slug)) ? "•" : ""}{value}</button>)}
        <button type="button" disabled={safePage >= pageCount} onClick={() => updateSearch({ page: safePage + 1 }, false, true)} className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">下一页<ChevronRight className="h-3.5 w-3.5" /></button>
        <label className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">跳转<input type="number" min={1} max={pageCount} defaultValue={safePage} onKeyDown={(event) => { if (event.key === "Enter") updateSearch({ page: Math.min(pageCount, Math.max(1, Number((event.target as HTMLInputElement).value))) }, false, true); }} className="w-16 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground" />页</label>
      </div>

      {showSelected && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-auto border-l border-border bg-background p-5 shadow-2xl">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">已选清单 · {selectedCount}</h2><button type="button" onClick={() => setShowSelected(false)} aria-label="关闭"><X className="h-5 w-5" /></button></div>
          <p className="mt-2 text-xs text-muted-foreground">{selectAllMatching ? "当前为全部匹配项，未访问页面的标题会在执行前按 slug 解析。" : "可逐条取消选择；翻页不会丢失已选项。"}</p>
          {!selectAllMatching && <ul className="mt-4 divide-y divide-border/60">{[...selected].map((slug) => <li key={slug} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate">{selectedDetails.get(slug)?.title ?? slug}</span><button type="button" onClick={() => toggleSelected(slug)} className="text-xs text-muted-foreground hover:text-destructive">取消</button></li>)}</ul>}
        </aside>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除？</AlertDialogTitle><AlertDialogDescription>这会从服务器数据库永久删除该文章，刷新后无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={pendingBatchDelete} onOpenChange={setPendingBatchDelete}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认将 {selectedCount} 条文章移入回收站？</AlertDialogTitle><AlertDialogDescription>文章会从公开页面隐藏并保留在数据库，可在回收站恢复；已选项会分批执行，失败项保留在清单中。单篇“删除”仍是永久删除，请先确认已有可用快照。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={confirmBatchDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">移入回收站</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
