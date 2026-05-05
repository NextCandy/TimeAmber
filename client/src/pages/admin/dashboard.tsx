import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Link } from "wouter";
import { fetchAdminPostsPage, deletePost, batchOperatePosts, fetchViewStats, importMarkdownPosts, batchOptimizePostsWithAI, type MarkdownImportPost, type Post, type ViewStats, type AdminPostsPage } from "@/lib/api";
import { Plus, Edit, Trash2, Eye, FileText, Clock, Search, ExternalLink, Globe, CheckCircle2, AlertTriangle, XCircle, CheckSquare, Square, EyeOff, TrendingUp, ArrowRight, BarChart3, FileUp, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseMarkdownFile } from "@/lib/importers/frontmatter";

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

type FilterType = "all" | "published" | "draft";

function slugFromText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/[\u4e00-\u9fa5]+/g, (m) => m.split("").map((c) => c.charCodeAt(0).toString(36)).join(""))
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback.replace(/\.(md|markdown)$/i, "");
}

function excerptFromMarkdown(content: string): string {
  return content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/[#>*_`[\]()!-]/g, "").trim())
    .find(Boolean)
    ?.slice(0, 180) || "";
}

export function AdminDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [pagination, setPagination] = useState<Omit<AdminPostsPage, "items">>({
    page: 1,
    pageSize: 30,
    total: 0,
    totalPages: 1,
    counts: { all: 0, published: 0, draft: 0 },
    tags: [],
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [tagExpanded, setTagExpanded] = useState(false);
  const [viewStats, setViewStats] = useState<ViewStats | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadPosts = async (targetPage = page) => {
    setLoading(true);
    try {
      const data = await fetchAdminPostsPage({
        page: targetPage,
        pageSize,
        status: filter,
        q: deferredSearch,
        tag: selectedTag,
      });
      setPosts(data.items);
      setPagination({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
        totalPages: data.totalPages,
        counts: data.counts,
        tags: data.tags,
      });
      setPage(data.page);
      setLoadError("");
    } catch (err) {
      setPosts([]);
      setLoadError(err instanceof Error ? err.message : "文章列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "管理后台 | TimeAmber";
    fetchViewStats().then(setViewStats).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, selectedTag, deferredSearch, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminPostsPage({
      page,
      pageSize,
      status: filter,
      q: deferredSearch,
      tag: selectedTag,
    })
      .then((data) => {
        if (cancelled) return;
        setPosts(data.items);
        setPagination({
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: data.totalPages,
          counts: data.counts,
          tags: data.tags,
        });
        if (data.page !== page) setPage(data.page);
        setLoadError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setPosts([]);
        setLoadError(err instanceof Error ? err.message : "文章列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, pageSize, filter, selectedTag, deferredSearch]);

  const handleDelete = async (slug: string, title: string) => {
    if (!confirm(`确定删除「${title}」？此操作不可撤销。`)) return;
    setDeleting(slug);
    try {
      await deletePost(slug);
      setPosts((prev) => prev.filter((p) => p.slug !== slug));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(prev.total - 1, 0),
        counts: { ...prev.counts, all: Math.max(prev.counts.all - 1, 0) },
      }));
      setSelectedSlugs((prev) => { const next = new Set(prev); next.delete(slug); return next; });
    } finally {
      setDeleting(null);
    }
  };

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [batchOperating, setBatchOperating] = useState(false);
  const [batchAiOperating, setBatchAiOperating] = useState(false);

  const filteredPosts = posts;

  useEffect(() => {
    setSelectedSlugs(prev => {
      if (prev.size === 0) return prev;
      const valid = new Set([...prev].filter(s => filteredPosts.some(p => p.slug === s)));
      return valid.size === prev.size ? prev : valid;
    });
  }, [filteredPosts]);

  const toggleSelectAll = () => {
    if (selectedSlugs.size === filteredPosts.length && filteredPosts.length > 0) setSelectedSlugs(new Set());
    else setSelectedSlugs(new Set(filteredPosts.map((p) => p.slug)));
  };

  const toggleSelect = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleBatchOperate = async (action: "publish" | "unpublish" | "delete") => {
    if (selectedSlugs.size === 0) return;
    const actionName = action === "publish" ? "发布" : action === "unpublish" ? "撤回发布" : "删除";
    if (!confirm(`确定要批量${actionName}选中的 ${selectedSlugs.size} 篇文章吗？${action === "delete" ? "此操作不可恢复！" : ""}`)) return;
    
    setBatchOperating(true);
    try {
      const slugs = Array.from(selectedSlugs);
      await batchOperatePosts(slugs, action);
      if (action === "delete") {
        setPosts((prev) => prev.filter((p) => !slugs.includes(p.slug)));
        setPagination((prev) => ({
          ...prev,
          total: Math.max(prev.total - slugs.length, 0),
          counts: { ...prev.counts, all: Math.max(prev.counts.all - slugs.length, 0) },
        }));
      } else {
        setPosts((prev) => prev.map((p) => slugs.includes(p.slug) ? { ...p, published: action === "publish" } : p));
      }
      setSelectedSlugs(new Set());
    } catch (err: any) {
      alert(err.message || "批量操作失败");
    } finally {
      setBatchOperating(false);
    }
  };

  const handleBatchAIOptimize = async () => {
    if (selectedSlugs.size === 0) return;
    if (selectedSlugs.size > 5) {
      alert("单次最多批量 AI 优化 5 篇文章，请少选几篇分批执行。");
      return;
    }
    if (!confirm(`确定要使用 AI 优化选中的 ${selectedSlugs.size} 篇文章吗？系统会先保存版本快照，优化后直接覆盖正文。`)) return;

    setBatchAiOperating(true);
    try {
      const slugs = Array.from(selectedSlugs);
      const result = await batchOptimizePostsWithAI({ slugs, mode: "seo" });
      await loadPosts();
      setSelectedSlugs(new Set());
      const failedItems = result.posts.filter((item) => item.status === "failed" || item.status === "skipped");
      const detail = failedItems.length > 0
        ? `\n\n未处理：\n${failedItems.slice(0, 5).map((item) => `- ${item.title}: ${item.error || item.status}`).join("\n")}`
        : "";
      alert(`AI 优化完成：更新 ${result.updated} 篇，跳过 ${result.skipped} 篇，失败 ${result.failed} 篇。${detail}`);
    } catch (err: any) {
      alert(err.message || "批量 AI 优化失败");
    } finally {
      setBatchAiOperating(false);
    }
  };

  const handleMarkdownImport = async (files: FileList | null) => {
    const markdownFiles = Array.from(files || []).filter((file) => /\.(md|markdown)$/i.test(file.name));
    if (markdownFiles.length === 0) return;

    setImporting(true);
    try {
      const baseTime = Date.now();
      const payload: MarkdownImportPost[] = [];

      for (let i = 0; i < markdownFiles.length; i++) {
        const file = markdownFiles[i];
        const raw = await file.text();
        const parsed = parseMarkdownFile(raw, file.name);
        const title = parsed.frontmatter.title || titleFromMarkdown(parsed.content, file.name);
        const category = parsed.frontmatter.categories[0] || "";
        const tags = Array.from(new Set([...parsed.frontmatter.tags, ...parsed.frontmatter.categories].filter(Boolean)));
        const createdAt = new Date(baseTime - i * 1000).toISOString();

        payload.push({
          slug: slugFromText(parsed.frontmatter.slug || title || file.name),
          title,
          content: parsed.content,
          excerpt: parsed.frontmatter.excerpt || excerptFromMarkdown(parsed.content),
          tags,
          category,
          createdAt,
        });
      }

      const result = await importMarkdownPosts(payload);
      setFilter("draft");
      setPage(1);
      setSelectedTag("");
      setSelectedSlugs(new Set());
      alert(`已导入 ${result.imported} 篇 Markdown，均为草稿。发布请进入单篇编辑页单独发布。`);
    } catch (err: any) {
      alert(err.message || "Markdown 导入失败");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };



  const publishedCount = pagination.counts.published;
  const draftCount = pagination.counts.draft;
  const allTags = useMemo(() => {
    return pagination.tags.map((tag) => tag.name);
  }, [pagination.tags]);
  const tagCounts = useMemo(() => new Map(pagination.tags.map((tag) => [tag.name, tag.count])), [pagination.tags]);


  return (
    <div className="mx-auto w-full max-w-[1560px] py-[24px] sm:py-[36px] px-[16px] sm:px-[20px]">

      {/* ═══════════ 顶栏：标题 + 操作 ═══════════ */}
      <div className="mb-[22px] rounded-md border border-border/20 bg-card/18 p-[16px] sm:p-[18px]">
        <div className="flex flex-col gap-[14px] sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[12px] text-muted-foreground/45">今日工作台</p>
            <h1 className="mt-[4px] text-[24px] font-semibold tracking-[-0.02em] sm:text-[30px]">内容运营控制台</h1>
            <p className="mt-[8px] max-w-[560px] text-[13px] leading-[1.7] text-muted-foreground/65">
              集中处理文章状态、搜索筛选、批量发布、SEO 健康与访问趋势。
            </p>
          </div>
          <div className="flex items-center gap-[6px]">
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              multiple
              className="hidden"
              onChange={(e) => handleMarkdownImport(e.target.files)}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="inline-flex h-[34px] items-center gap-[5px] rounded-lg border border-border/20 bg-card/20 px-[12px] text-[13px] font-medium text-foreground/75 transition-colors hover:border-border/40 hover:bg-card/35 disabled:cursor-not-allowed disabled:opacity-50"
              title="批量导入 Markdown 草稿"
            >
              <FileUp className={`h-[14px] w-[14px] ${importing ? "animate-pulse" : ""}`} />
              {importing ? "导入中" : "导入 Markdown"}
            </button>
            <Link href="/admin/editor" className="inline-flex items-center gap-[5px] h-[34px] px-[14px] rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity">
              <Plus className="h-[14px] w-[14px]" />写文章
            </Link>
          </div>
        </div>
      </div>

      {/* ═══════════ 数据概览行 ═══════════ */}
      <div className="mb-[22px] grid grid-cols-2 gap-[8px] sm:grid-cols-4 sm:gap-[10px]">
        {([
          { key: "all" as FilterType, label: "全部", value: pagination.counts.all, icon: FileText, activeColor: "border-foreground/20 bg-foreground/[0.03]", iconColor: "text-foreground/60" },
          { key: "published" as FilterType, label: "已发布", value: publishedCount, icon: Eye, activeColor: "border-emerald-500/25 bg-emerald-500/[0.04]", iconColor: "text-emerald-400/70" },
          { key: "draft" as FilterType, label: "草稿", value: draftCount, icon: Clock, activeColor: "border-amber-500/25 bg-amber-500/[0.04]", iconColor: "text-amber-400/70" },
        ] as const).map((stat) => (
          <button key={stat.key} onClick={() => { setFilter(stat.key); setSelectedTag(""); }}
            className={`min-h-[88px] rounded-md border p-[12px] text-left transition-all hover:-translate-y-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-[14px] ${filter === stat.key && !selectedTag ? stat.activeColor : "border-border/15 bg-background/20 hover:border-border/30 hover:bg-card/12"}`}
          >
            <div className="flex items-center justify-between mb-[6px]">
              <span className="text-[10px] font-medium tracking-normal text-muted-foreground/45 sm:text-[11px]">{stat.label}</span>
              <stat.icon className={`h-[12px] w-[12px] ${filter === stat.key && !selectedTag ? stat.iconColor : "text-muted-foreground/15"}`} />
            </div>
            <p className="text-[22px] sm:text-[26px] font-bold leading-none tracking-tight">{stat.value}</p>
          </button>
        ))}
        <div className="min-h-[88px] rounded-md border border-border/15 bg-background/20 p-[12px] text-left sm:p-[14px]">
          <div className="flex items-center justify-between mb-[6px]">
            <span className="text-[10px] font-medium tracking-normal text-muted-foreground/45 sm:text-[11px]">浏览量</span>
            <TrendingUp className="h-[12px] w-[12px] text-cyan-400/40" />
          </div>
          <p className="text-[22px] sm:text-[26px] font-bold leading-none tracking-tight">{viewStats?.totalViews?.toLocaleString() ?? "—"}</p>
        </div>
      </div>

      {/* ═══════════ 搜索框 ═══════════ */}
      <div className="mb-[16px]">
        <div className="relative">
          <Search className="absolute left-[12px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-muted-foreground/25" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题、Slug 或标签..."
            className="h-[44px] w-full rounded-md border border-border/20 bg-background/35 pl-[36px] pr-[14px] text-[14px] text-foreground outline-none transition-all placeholder:text-muted-foreground/35 focus:border-foreground/25 focus:bg-background/55"
          />
        </div>
      </div>

      {/* ═══════════ 两栏主布局 ═══════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-[20px]">

        {/* ─── 文章列表 ─── */}
        <div className="flex min-w-0 flex-col min-h-0 xl:max-h-[calc(100vh-260px)]">
          <div className="mb-[10px] flex items-center justify-between shrink-0">
            <h2 className="flex items-center gap-[5px] text-[12px] font-medium tracking-normal text-muted-foreground/45">
              {filter === "all" ? "所有文章" : filter === "published" ? "已发布" : "草稿箱"}
              {selectedTag && <><span className="text-muted-foreground/15">·</span><span className="text-cyan-400 normal-case">{selectedTag}</span></>}
            </h2>
            <span className="text-[11px] text-muted-foreground/25">本页 {filteredPosts.length} / 共 {pagination.total} 篇</span>
          </div>
          <div className="mb-[10px] flex flex-wrap items-center justify-between gap-[8px] rounded-md border border-border/12 bg-background/18 px-[12px] py-[8px] text-[11px] text-muted-foreground/40">
            <span>第 {pagination.page} / {pagination.totalPages} 页</span>
            <div className="flex items-center gap-[6px]">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-[30px] rounded-md border border-border/20 bg-background/60 px-[8px] text-[11px] text-foreground/70 outline-none"
              >
                {[20, 30, 50, 80].map((size) => <option key={size} value={size}>{size} / 页</option>)}
              </select>
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={pagination.page <= 1 || loading}
                className="h-[30px] rounded-md border border-border/20 px-[10px] text-foreground/60 transition-colors hover:bg-card/25 disabled:cursor-not-allowed disabled:opacity-35"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="h-[30px] rounded-md border border-border/20 px-[10px] text-foreground/60 transition-colors hover:bg-card/25 disabled:cursor-not-allowed disabled:opacity-35"
              >
                下一页
              </button>
            </div>
          </div>

          {/* 批量操作工具栏 */}
          {filteredPosts.length > 0 && (
            <div className={`mb-[10px] flex flex-wrap items-center justify-between gap-[8px] rounded-md border border-border/15 bg-background/25 px-[14px] py-[8px] transition-all shrink-0 ${selectedSlugs.size > 0 ? "border-cyan-500/30 bg-cyan-500/5" : ""}`}>
              <div className="flex items-center gap-[10px]">
                <button onClick={toggleSelectAll} className="flex min-h-[36px] items-center gap-[6px] rounded-md text-muted-foreground/50 transition-colors hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {selectedSlugs.size === filteredPosts.length ? <CheckSquare className="h-[14px] w-[14px] text-cyan-400" /> : <Square className="h-[14px] w-[14px]" />}
                  <span className="text-[12px]">{selectedSlugs.size > 0 ? `已选 ${selectedSlugs.size} 项` : "全选"}</span>
                </button>
              </div>
              
              {selectedSlugs.size > 0 && (
                <div className="flex flex-wrap items-center gap-[6px] animate-fade-in">
                  <button onClick={handleBatchAIOptimize} disabled={batchOperating || batchAiOperating} className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-md border border-cyan-500/30 text-[11px] text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-50" title="最多一次优化 5 篇">
                    <Wand2 className={`h-[11px] w-[11px] ${batchAiOperating ? "animate-pulse" : ""}`} /> AI 优化
                  </button>
                  <button onClick={() => handleBatchOperate("publish")} disabled={batchOperating || batchAiOperating} className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-md border border-border/20 text-[11px] text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50">
                    <Eye className="h-[11px] w-[11px]" /> 发布
                  </button>
                  <button onClick={() => handleBatchOperate("unpublish")} disabled={batchOperating || batchAiOperating} className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-md border border-border/20 text-[11px] text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50">
                    <EyeOff className="h-[11px] w-[11px]" /> 撤回
                  </button>
                  <button onClick={() => handleBatchOperate("delete")} disabled={batchOperating || batchAiOperating} className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-md border border-red-500/30 text-[11px] text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50">
                    <Trash2 className="h-[11px] w-[11px]" /> 删除
                  </button>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-[6px] shrink-0">{[1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-lg border border-border/10 bg-card/5" />)}</div>
          ) : loadError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/8 py-[40px] px-[20px] text-center shrink-0">
              <XCircle className="mx-auto mb-[12px] h-[24px] w-[24px] text-red-400/70" />
              <p className="text-[13px] text-red-300 mb-[8px]">文章列表加载失败</p>
              <p className="mx-auto max-w-[520px] text-[12px] leading-[1.7] text-muted-foreground/55 break-words">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-[16px] inline-flex h-[30px] items-center rounded-md border border-border/20 bg-card/20 px-[12px] text-[12px] text-foreground/70 transition-colors hover:bg-card/35"
              >
                重新加载
              </button>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/20 py-[52px] text-center shrink-0">
              <FileText className="mx-auto mb-[12px] h-[24px] w-[24px] text-muted-foreground/10" />
              <p className="text-[13px] text-muted-foreground/30 mb-[12px]">
                {search || selectedTag ? "没有符合条件的文章" : "暂无文章"}
              </p>
              {!search && !selectedTag && (
                <Link href="/admin/editor" className="inline-flex items-center gap-[5px] h-[30px] px-[12px] rounded-md bg-foreground/8 text-[12px] text-foreground/70 hover:bg-foreground/15 transition-all">
                  写第一篇 <ArrowRight className="h-[11px] w-[11px]" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-[4px] -mr-[4px] scrollbar-thin">
              <div className="space-y-[4px]">
              {filteredPosts.map((post) => (
                <div key={post.slug} className={`group relative flex min-h-[64px] items-center gap-[12px] rounded-md border px-[12px] py-[10px] transition-all sm:px-[14px] ${selectedSlugs.has(post.slug) ? "border-cyan-500/30 bg-cyan-500/5 text-cyan-400" : "border-border/12 bg-background/20 hover:border-border/35 hover:bg-card/16"}`}>
                  
                  {/* 复选框 */}
                  <button onClick={() => toggleSelect(post.slug)} className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selectedSlugs.has(post.slug) ? "text-cyan-400" : "text-muted-foreground/25 group-hover:text-muted-foreground/50"}`} aria-label={`选择 ${post.title}`}>
                    {selectedSlugs.has(post.slug) ? <CheckSquare className="h-[14px] w-[14px]" /> : <Square className="h-[14px] w-[14px]" />}
                  </button>

                  {/* 状态指示点 */}
                  <div className={`h-[6px] w-[6px] rounded-full shrink-0 ${post.published ? "bg-emerald-400/60" : "bg-amber-400/50"}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6px] mb-[3px]">
                      <Link href={`/admin/editor/${post.slug}`} className="truncate text-[14px] font-medium text-foreground/85 transition-colors hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{post.title}</Link>
                      {post.pinned && <Badge variant="outline" className="h-[16px] rounded-[3px] px-[4px] text-[9px] font-medium text-amber-500/80 border-amber-500/20 bg-amber-500/5">置顶</Badge>}
                    </div>
                    <div className="flex items-center gap-[8px] text-[11px] text-muted-foreground/30">
                      <span>{timeAgo(post.updatedAt || post.createdAt)}</span>
                      <span className="flex items-center gap-[2px]"><Eye className="h-[9px] w-[9px]" />{(post.viewCount ?? 0).toLocaleString()}</span>
                      {post.tags.length > 0 && <span>{post.tags.slice(0, 2).join(" · ")}</span>}
                    </div>
                  </div>

                  {/* 操作按钮 — hover 显现 */}
                  <div className="flex shrink-0 items-center gap-[2px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <a href={`/posts/${post.slug}`} target="_blank" title="预览" aria-label={`预览 ${post.title}`} className="flex h-[36px] w-[36px] items-center justify-center rounded-md text-muted-foreground/35 transition-all hover:bg-cyan-400/8 hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <ExternalLink className="h-[12px] w-[12px]" />
                    </a>
                    <Link href={`/admin/editor/${post.slug}`} title="编辑" aria-label={`编辑 ${post.title}`} className="flex h-[36px] w-[36px] items-center justify-center rounded-md text-muted-foreground/35 transition-all hover:bg-amber-400/8 hover:text-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <Edit className="h-[12px] w-[12px]" />
                    </Link>
                    <button onClick={() => handleDelete(post.slug, post.title)} disabled={deleting === post.slug} title="删除" aria-label={`删除 ${post.title}`} className="flex h-[36px] w-[36px] items-center justify-center rounded-md text-muted-foreground/35 transition-all hover:bg-red-400/8 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-30">
                      <Trash2 className={`h-[12px] w-[12px] ${deleting === post.slug ? "animate-pulse" : ""}`} />
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── 右侧边栏：标签 + 热门 + SEO ─── */}
        <div className="min-w-0 space-y-[14px] xl:sticky xl:top-[24px] xl:self-start">

          {/* SEO 健康状态 */}
          {posts.length > 0 && (() => {
            const published = posts.filter(p => p.published);
            const withExcerpt = published.filter(p => p.excerpt && p.excerpt.trim().length > 0);
            const withTags = published.filter(p => p.tags.length > 0);
            const goodSlug = published.filter(p => /^[a-z0-9-]+$/.test(p.slug) && !p.slug.includes("--") && !p.slug.startsWith("-") && !p.slug.endsWith("-"));
            const withTitle50 = published.filter(p => p.title.length <= 60 && p.title.length >= 5);

            const checks = [
              { label: "Meta 摘要", ok: withExcerpt.length, total: published.length, desc: "已填写 excerpt" },
              { label: "标签覆盖", ok: withTags.length, total: published.length, desc: "至少 1 个标签" },
              { label: "URL 规范", ok: goodSlug.length, total: published.length, desc: "slug 为小写+连字符" },
              { label: "标题长度", ok: withTitle50.length, total: published.length, desc: "5-60 字符" },
            ];

            const totalOk = checks.reduce((s, c) => s + c.ok, 0);
            const totalAll = checks.reduce((s, c) => s + c.total, 0);
            const score = totalAll > 0 ? Math.round((totalOk / totalAll) * 100) : 0;

            const scoreColor = score >= 90 ? "text-emerald-400" : score >= 70 ? "text-amber-400" : "text-red-400";
            const scoreBg = score >= 90 ? "bg-emerald-500/8" : score >= 70 ? "bg-amber-500/8" : "bg-red-500/8";
            const scoreBorder = score >= 90 ? "border-emerald-500/20" : score >= 70 ? "border-amber-500/20" : "border-red-500/20";

            return (
              <div className={`rounded-md border ${scoreBorder} ${scoreBg} p-[14px]`}>
                <div className="flex items-center justify-between mb-[10px]">
                  <h3 className="flex items-center gap-[4px] text-[10px] font-medium tracking-normal text-muted-foreground/45">
                    <Globe className="h-[10px] w-[10px] text-cyan-400/50" />SEO 健康
                  </h3>
                  <span className={`text-[18px] font-bold ${scoreColor}`}>{score}%</span>
                </div>
                <div className="space-y-[6px]">
                  {checks.map(c => {
                    const pct = c.total > 0 ? Math.round((c.ok / c.total) * 100) : 0;
                    const Icon = pct === 100 ? CheckCircle2 : pct >= 70 ? AlertTriangle : XCircle;
                    const color = pct === 100 ? "text-emerald-400/70" : pct >= 70 ? "text-amber-400/70" : "text-red-400/60";
                    return (
                      <div key={c.label} className="flex min-w-0 items-center gap-[6px]">
                        <Icon className={`h-[11px] w-[11px] shrink-0 ${color}`} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/50">{c.label}</span>
                        <span className="text-[10px] text-muted-foreground/30">{c.ok}/{c.total}</span>
                      </div>
                    );
                  })}
                </div>
                {/* sitemap + robots 固定指标 */}
                <div className="mt-[8px] pt-[8px] border-t border-border/10 space-y-[4px]">
                  {[
                    { label: "Sitemap", ok: true },
                    { label: "Robots noindex (404)", ok: true },
                    { label: "JSON-LD 结构化", ok: true },
                    { label: "OG 社交标签", ok: true },
                  ].map(item => (
                    <div key={item.label} className="flex min-w-0 items-center gap-[6px]">
                      <CheckCircle2 className="h-[11px] w-[11px] shrink-0 text-emerald-400/50" />
                      <span className="min-w-0 truncate text-[11px] text-foreground/40">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 标签 */}
          {allTags.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-[8px]">
                <h3 className="text-[10px] font-medium tracking-normal text-muted-foreground/35">标签</h3>
                {allTags.length > 8 && (
                  <button onClick={() => setTagExpanded(!tagExpanded)} className="text-[10px] text-cyan-400/60 hover:text-cyan-400 transition-colors">
                    {tagExpanded ? "收起" : `+${allTags.length - 8}`}
                  </button>
                )}
              </div>
              <div className={`flex flex-wrap gap-[4px] ${!tagExpanded ? "max-h-[64px] overflow-hidden" : ""}`}>
                {allTags.map((tag) => {
                  const count = tagCounts.get(tag) || 0;
                  return (
                    <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
                    className={`inline-flex min-h-[32px] items-center gap-[4px] rounded-md px-[8px] text-[11px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        selectedTag === tag
                          ? "bg-cyan-500/12 text-cyan-400 font-medium"
                          : "text-muted-foreground/40 hover:text-foreground/70 hover:bg-card/30"
                      }`}
                    >
                      {tag}<span className="text-[9px] opacity-50">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 热门文章 */}
          {viewStats && viewStats.topPosts.length > 0 && (
            <div>
              <h3 className="mb-[8px] flex items-center gap-[4px] text-[10px] font-medium tracking-normal text-muted-foreground/35">
                <BarChart3 className="h-[10px] w-[10px] text-amber-500/40" />热门
              </h3>
              <div className="space-y-[2px]">
                {viewStats.topPosts.slice(0, 5).map((item, i) => (
                  <Link key={item.slug} href={`/posts/${item.slug}`}
                    className="flex items-center gap-[8px] rounded-md px-[6px] py-[6px] hover:bg-card/20 transition-colors group"
                  >
                    <span className={`text-[10px] font-bold w-[14px] text-center shrink-0 ${
                      i === 0 ? "text-amber-500" : i < 3 ? "text-muted-foreground/40" : "text-muted-foreground/20"
                    }`}>{i + 1}</span>
                    <span className="flex-1 text-[12px] text-foreground/50 group-hover:text-foreground/80 truncate transition-colors">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground/20 shrink-0">{item.viewCount.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
