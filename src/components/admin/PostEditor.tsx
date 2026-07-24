import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  Save, ArrowLeft, Eye, Upload, X, ImageIcon, Sparkles, Loader2, ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminStore } from "@/lib/admin-store";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import type { Post } from "@/lib/sample-posts";
import { aiComplete } from "@/lib/ai.functions";
import { seeUpload } from "@/lib/media.functions";
import { diffParts, summarize, type DiffPart, type DiffMode } from "@/lib/diff-words";

function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "add" ? (
          <span key={i} className="bg-primary/20 text-primary px-0.5 rounded">{p.text}</span>
        ) : (
          <span key={i} className="bg-destructive/15 text-destructive line-through px-0.5 rounded">
            {p.text}
          </span>
        ),
      )}
    </p>
  );
}

const postSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "slug 不能为空")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "只能用小写字母、数字、连字符"),
  title: z.string().trim().min(1, "标题不能为空").max(200),
  excerpt: z.string().trim().min(1, "摘要不能为空").max(500),
  category: z.string().trim().min(1, "请选择分类").max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  publishAt: z.string().min(1),
  readingMinutes: z.number().int().min(1).max(120),
  source: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().max(50000).optional().or(z.literal("")),
  cover: z.string().max(2_000_000).optional().or(z.literal("")),
  externalUrl: z.string().trim().url("HTML 文章必须填合法 URL").max(800).optional().or(z.literal("")),
});

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

const MAX_COVER_BYTES = 1_500_000; // ~1.5MB

export function PostEditor({ initial }: { initial?: Post }) {
  const navigate = useNavigate();
  const store = useAdminStore();
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [publishAt, setPublishAt] = useState(
    initial?.publishAt ?? new Date().toISOString().slice(0, 10),
  );
  const [readingMinutes, setReadingMinutes] = useState(initial?.readingMinutes ?? 5);
  const [source, setSource] = useState(initial?.source ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [cover, setCover] = useState(initial?.cover ?? DEFAULT_POST_COVER);
  const [type, setType] = useState<"markdown" | "html">(initial?.type ?? "markdown");
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [openIn, setOpenIn] = useState<"_blank" | "_self">(initial?.openIn ?? "_blank");
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [showPreview, setShowPreview] = useState(false);
  const [aiBusy, setAiBusy] = useState<"seo" | "images" | null>(null);
  const [aiResult, setAiResult] = useState<{
    title?: string;
    excerpt?: string;
    tags?: string;
    category?: string;
    cover?: string;
  } | null>(null);
  const [imgProgress, setImgProgress] = useState<
    { name: string; pct: number; status: "uploading" | "done" | "error"; msg?: string }[]
  >([]);
  const [diffMode, setDiffMode] = useState<DiffMode>("word");
  const fileRef = useRef<HTMLInputElement>(null);
  const runAi = useServerFn(aiComplete);
  const runSeeUpload = useServerFn(seeUpload);

  async function handleAISeo() {
    if (!store.ai.apiKey) {
      toast.error("请先在「AI 配置」填入 API Key");
      return;
    }
    if (!title.trim() && !content.trim()) {
      toast.error("请先填写标题或正文");
      return;
    }
    setAiBusy("seo");
    try {
      const catList = store.categories.map((c) => c.name).join("、") || "无";
      const prompt = `请基于以下文章生成 SEO 友好的内容，严格输出如下 JSON（不要任何解释、不要 markdown 代码块）：
{"title":"...","excerpt":"...","tags":"a,b,c","category":"现有分类之一或最贴近的新分类名","cover":"用一句话描述适合作为封面的画面（中文，≤40字）"}

约束：
- 标题不超过 30 个汉字
- 摘要不超过 150 字
- 标签 ≤5 个，用英文逗号分隔
- category 必须从这些已有分类里挑选最贴切的：${catList}

文章标题：${title}
文章正文：
${content.slice(0, 4000)}`;
      const { content: out } = await runAi({
        data: {
          endpoint: store.ai.endpoint,
          apiKey: store.ai.apiKey,
          model: store.ai.model,
          system: "你是一个中文 SEO 内容优化助手，输出必须是合法的 JSON。",
          prompt,
          temperature: 0.5,
        },
      });
      const match = out.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI 返回不含 JSON");
      const parsed = JSON.parse(match[0]) as {
        title?: string;
        excerpt?: string;
        tags?: string;
        category?: string;
        cover?: string;
      };
      setAiResult({
        title: parsed.title?.trim() || undefined,
        excerpt: parsed.excerpt?.trim() || undefined,
        tags: parsed.tags?.trim() || undefined,
        category: parsed.category?.trim() || undefined,
        cover: parsed.cover?.trim() || undefined,
      });
      toast.success("AI 已生成建议，请在弹窗中对比预览");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 调用失败");
    } finally {
      setAiBusy(null);
    }
  }

  function applyAi(parts: { title: boolean; excerpt: boolean; tags: boolean; category: boolean; cover: boolean }) {
    if (!aiResult) return;
    if (parts.title && aiResult.title) setTitle(aiResult.title);
    if (parts.excerpt && aiResult.excerpt) setExcerpt(aiResult.excerpt);
    if (parts.tags && aiResult.tags) setTagsInput(aiResult.tags);
    if (parts.category && aiResult.category) setCategory(aiResult.category);
    if (parts.cover && aiResult.cover && !cover.trim()) setCover(aiResult.cover);
    toast.success("已应用 AI 建议");
    setAiResult(null);
  }

  async function handleUploadEmbedded() {
    const host = store.cloud.imageHost;
    const token = host?.token || store.cloud.see?.token;
    const endpoint = host?.endpoint || "https://s.ee/api/v2/upload";
    if (!token) {
      toast.error("请先在「媒体库」配置图床 Token");
      return;
    }
    const re = /!\[([^\]]*)\]\((data:(image\/[a-zA-Z+.-]+);base64,([^)]+))\)/g;
    const matches = [...content.matchAll(re)];
    if (matches.length === 0) {
      toast.info("正文中没有发现内嵌（data:image）图片");
      return;
    }
    setAiBusy("images");
    let replaced = content;
    let ok = 0;
    setImgProgress(
      matches.map((_, i) => ({ name: `图片 #${i + 1}`, pct: 0, status: "uploading" as const })),
    );
    try {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const [whole, alt, , mime, base64] = m;
        try {
          const ext = mime.split("/")[1].split("+")[0] || "png";
          const filename = `inline-${Date.now()}-${ok}.${ext}`;
          setImgProgress((p) =>
            p.map((x, idx) => (idx === i ? { ...x, name: filename, pct: 40 } : x)),
          );
          const { url } = await runSeeUpload({
            data: { endpoint, token, filename, contentType: mime, base64 },
          });
          store.addMedia({ name: filename, url, source: "imported" });
          replaced = replaced.replace(whole, `![${alt}](${url})`);
          ok++;
          setImgProgress((p) =>
            p.map((x, idx) => (idx === i ? { ...x, pct: 100, status: "done" } : x)),
          );
        } catch (err) {
          console.error(err);
          setImgProgress((p) =>
            p.map((x, idx) =>
              idx === i
                ? {
                    ...x,
                    pct: 100,
                    status: "error",
                    msg: err instanceof Error ? err.message : "失败",
                  }
                : x,
            ),
          );
        }
      }
      setContent(replaced);
      toast.success(`已上传 ${ok}/${matches.length} 张图片并替换链接`);
      setTimeout(() => setImgProgress([]), 4000);
    } finally {
      setAiBusy(null);
    }
  }

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  function handleCoverPick(file: File) {
    if (file.size > MAX_COVER_BYTES) {
      toast.error("封面图片太大（>1.5MB），请压缩后再上传");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCover(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent, overrideStatus?: "draft" | "published") {
    e.preventDefault();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const nextStatus = overrideStatus ?? status;
    const parsed = postSchema.safeParse({
      slug,
      title,
      excerpt,
      category,
      tags,
      publishAt,
      readingMinutes: Number(readingMinutes),
      source: source || undefined,
      content: content || undefined,
      cover: cover || undefined,
      externalUrl: externalUrl || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "请检查表单");
      return;
    }
    if (type === "html" && !parsed.data.externalUrl) {
      toast.error("HTML 文章需要填写跳转链接");
      return;
    }
    const collision = store.posts.some(
      (p) => p.slug === parsed.data.slug && p.slug !== initial?.slug,
    );
    if (collision) {
      toast.error("已存在相同 slug 的文章");
      return;
    }
    const post: Post = {
      ...parsed.data,
      source: parsed.data.source || undefined,
      content: type === "markdown" ? parsed.data.content || undefined : undefined,
      cover: parsed.data.cover || undefined,
      externalUrl: type === "html" ? parsed.data.externalUrl : undefined,
      openIn: type === "html" ? openIn : undefined,
      type,
      status: nextStatus,
    };
    store.upsertPost(post);
    setStatus(nextStatus);
    toast.success(
      nextStatus === "published"
        ? isEdit ? "已保存并发布" : "文章已发布"
        : isEdit ? "草稿已保存" : "已存为草稿",
    );
    navigate({ to: "/admin/posts" });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/posts"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> 返回文章列表
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAISeo}
            disabled={aiBusy !== null}
            title="使用 AI 生成 SEO 友好的标题 / 摘要 / 标签"
          >
            {aiBusy === "seo" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            AI 优化 SEO
          </Button>
          {type === "markdown" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUploadEmbedded}
              disabled={aiBusy !== null}
              title="将正文中所有 data:image base64 图片上传到 s.ee 并替换为外链"
            >
              {aiBusy === "images" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 h-4 w-4" />
              )}
              上传内嵌图片
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((s) => !s)}>
            <Eye className="mr-1.5 h-4 w-4" />
            {showPreview ? "隐藏预览" : "预览"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => handleSubmit(e, "draft")}
          >
            存为草稿
          </Button>
          <Button type="button" size="sm" onClick={(e) => handleSubmit(e, "published")}>
            <Save className="mr-1.5 h-4 w-4" />
            {isEdit && status === "published" ? "保存修改" : "发布"}
          </Button>
        </div>
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as "markdown" | "html")}>
        <TabsList>
          <TabsTrigger value="markdown">Markdown 文章</TabsTrigger>
          <TabsTrigger value="html">HTML 跳转文章</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <div>
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5"
              placeholder="一个让人忍不住点进来的标题"
              required
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="excerpt">摘要</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="mt-1.5"
              placeholder="出现在首页卡片和文章列表里的简介"
              required
              maxLength={500}
            />
          </div>

          {type === "markdown" ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="content">正文 (Markdown)</Label>
                <span className="text-xs text-muted-foreground">{content.length} / 50000</span>
              </div>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                className="font-mono text-sm"
                placeholder={"# 标题\n\n支持 # 标题、## 副标题、- 列表、> 引用、**粗体**、`代码`"}
                maxLength={50000}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="externalUrl">HTML 跳转链接</Label>
                <Input
                  id="externalUrl"
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="mt-1.5"
                  placeholder="https://example.com/your-page.html"
                  required
                  maxLength={800}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  前台点击这篇文章会直接打开此 URL，而不是进入 Markdown 详情页。
                </p>
              </div>
              <div>
                <Label htmlFor="openIn">打开方式</Label>
                <Select value={openIn} onValueChange={(v) => setOpenIn(v as "_blank" | "_self")}>
                  <SelectTrigger id="openIn" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_blank">新窗口打开（推荐）</SelectItem>
                    <SelectItem value="_self">当前窗口打开</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {showPreview && (
            <div className="rounded-xl border border-border/70 bg-card/40 p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                预览
              </p>
              <h2 className="font-display text-2xl font-bold">{title || "（无标题）"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{excerpt}</p>
              {type === "markdown" && (
                <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                  {content}
                </pre>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <div>
            <Label>状态</Label>
            <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-sm">
              <Switch
                checked={status === "published"}
                onCheckedChange={(v) => setStatus(v ? "published" : "draft")}
              />
              <span className={status === "published" ? "text-primary" : "text-muted-foreground"}>
                {status === "published" ? "已发布（前台可见）" : "草稿（仅后台可见）"}
              </span>
            </div>
          </div>

          <div>
            <Label>封面图片</Label>
            <div className="mt-1.5 space-y-2">
              <div className="relative h-32 overflow-hidden rounded-lg border border-border/70 bg-muted/40">
                {cover ? (
                  <>
                    <img
                      src={cover}
                      alt=""
                      className={`h-full w-full ${
                        cover === DEFAULT_POST_COVER ? "object-contain p-4" : "object-cover"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setCover("")}
                      className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground/80 hover:text-foreground"
                      aria-label="移除封面"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                    未设置，将使用站点 Logo 渐变
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCoverPick(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {cover ? "更换图片" : "上传封面"}
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              className="mt-1.5 font-mono text-sm"
              placeholder="my-post"
              required
              pattern="[a-z0-9\-]+"
              maxLength={80}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              /posts/<span className="text-foreground">{slug || "your-slug"}</span>
            </p>
          </div>

          <div>
            <Label htmlFor="category">分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="mt-1.5">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {store.categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tags">标签（逗号分隔）</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="mt-1.5"
              placeholder="剪藏, VS.DO"
              maxLength={400}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="publishAt">发布日期</Label>
              <Input
                id="publishAt"
                type="date"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="mt-1.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="readingMinutes">阅读时长(分钟)</Label>
              <Input
                id="readingMinutes"
                type="number"
                min={1}
                max={120}
                value={readingMinutes}
                onChange={(e) => setReadingMinutes(Number(e.target.value))}
                className="mt-1.5"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="source">原文链接（可选）</Label>
            <Input
              id="source"
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1.5"
              placeholder="https://..."
              maxLength={500}
            />
          </div>
        </aside>
      </div>

      {imgProgress.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card/40 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            内嵌图片上传进度
          </p>
          <ul className="space-y-2">
            {imgProgress.map((p, idx) => (
              <li key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-mono" title={p.name}>{p.name}</span>
                  <span
                    className={
                      p.status === "error"
                        ? "text-destructive"
                        : p.status === "done"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    {p.status === "uploading" ? `${p.pct}%` : p.status === "done" ? "完成" : p.msg ?? "失败"}
                  </span>
                </div>
                <Progress value={p.pct} className="h-1.5" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!aiResult} onOpenChange={(o) => !o && setAiResult(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>AI 优化建议 · 对比预览</DialogTitle>
            <DialogDescription>
              对比左侧当前内容与右侧 AI 建议，选择需要覆盖的字段后再应用。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs">
            <span className="text-muted-foreground">Diff 粒度</span>
            <Tabs value={diffMode} onValueChange={(v) => setDiffMode(v as DiffMode)}>
              <TabsList className="h-7">
                <TabsTrigger value="word" className="h-6 px-2 text-xs">按字/词</TabsTrigger>
                <TabsTrigger value="sentence" className="h-6 px-2 text-xs">按句</TabsTrigger>
                <TabsTrigger value="paragraph" className="h-6 px-2 text-xs">按段落</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {(["title", "excerpt", "tags", "category", "cover"] as const).map((field) => {
              const labels = {
                title: "标题",
                excerpt: "摘要",
                tags: "标签",
                category: "分类",
                cover: "封面描述（仅在当前封面为空时应用）",
              } as const;
              const current =
                field === "title"
                  ? title
                  : field === "excerpt"
                  ? excerpt
                  : field === "tags"
                  ? tagsInput
                  : field === "category"
                  ? category
                  : cover;
              const suggested = aiResult?.[field] ?? "";
              const changed = !!suggested && suggested !== current;
              const parts = changed ? diffParts(current, suggested, diffMode) : [];
              const sum = changed ? summarize(parts) : null;
              return (
                <div key={field} className="rounded-lg border border-border/60 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {labels[field]} {changed && <span className="ml-1 text-primary">· 有变更</span>}
                    {sum && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        +{sum.added} / −{sum.removed}（保留 {sum.same}）
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    <div className="rounded bg-muted/40 p-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">当前</p>
                      <p className="whitespace-pre-wrap break-words text-foreground/80">
                        {current || <span className="text-muted-foreground">（空）</span>}
                      </p>
                    </div>
                    <div className="rounded bg-primary/5 p-2 ring-1 ring-primary/20">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-primary/80">AI 建议</p>
                      <p className="whitespace-pre-wrap break-words text-foreground">
                        {suggested || <span className="text-muted-foreground">（未生成）</span>}
                      </p>
                    </div>
                  </div>
                  {changed && (
                    <div className="mt-2 rounded border border-dashed border-border/60 bg-background/50 p-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Diff（{diffMode === "word" ? "字/词" : diffMode === "sentence" ? "句" : "段落"}）
                      </p>
                      <DiffView parts={parts} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={() => setAiResult(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                applyAi({ title: false, excerpt: true, tags: true, category: false, cover: false })
              }
            >
              仅应用摘要 + 标签
            </Button>
            <Button
              type="button"
              onClick={() =>
                applyAi({ title: true, excerpt: true, tags: true, category: true, cover: true })
              }
            >
              全部应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
