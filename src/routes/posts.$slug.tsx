import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, ExternalLink, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import mediumZoom from "medium-zoom";
import { POSTS, formatDate } from "@/lib/sample-posts";
import { formatDateKey } from "@/lib/date";
import { DEFAULT_POST_COVER, SITE_URL } from "@/lib/brand";
import { toMetaDescription } from "@/lib/strip-markdown";
import { loadPublicPost } from "@/lib/state.functions";
import { loadRelatedPosts, type RelatedPost } from "@/lib/public-posts.functions";
import { renderMarkdownFn } from "@/lib/markdown.functions";
import { TableOfContents, extractToc } from "@/components/post/TableOfContents";
import { ReadingControls, useReadingPrefs } from "@/components/post/ReadingControls";

// og:image / JSON-LD 里的图必须是绝对地址：社交平台与搜索引擎不解析相对路径，
// 而封面可能是站内相对路径（/supabase/...）、绝对 URL 或 data: URL（后者无法被抓取，回退默认封面）。
function absolutePostImage(cover?: string): string {
  if (!cover) return `${SITE_URL}${DEFAULT_POST_COVER}`;
  if (cover.startsWith("http")) return cover;
  if (cover.startsWith("/")) return `${SITE_URL}${cover}`;
  return `${SITE_URL}${DEFAULT_POST_COVER}`;
}

export const Route = createFileRoute("/posts/$slug")({
  loader: async ({ params }) => {
    // 相关推荐同一套权重挪到了 SQL 里，只回 12 条 —— 原来是靠 root loader
    // 下发的全部文章在浏览器里算分，那份数据现在不再进 payload。
    const [dbPost, related] = await Promise.all([
      loadPublicPost({ data: { slug: params.slug } }).catch(() => null),
      loadRelatedPosts({ data: { slug: params.slug } }).catch(() => []),
    ]);
    const post = dbPost ?? POSTS.find((p) => p.slug === params.slug) ?? null;
    const contentHtml =
      post && post.type !== "html" && post.content
        ? await renderMarkdownFn({ data: { md: post.content } })
        : "";
    return { post, contentHtml, related };
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post;
    if (!post) return { meta: [{ title: "文章 · TimeAmber" }] };

    // excerpt 来自 Notion 同步，原样带着 ![](…)、``` 之类语法，
    // 直接进 meta 会被搜索结果和社交卡片当正文显示。
    const description = toMetaDescription(post.excerpt);
    const canonical = `${SITE_URL}/posts/${params.slug}`;
    const image = absolutePostImage(post.cover);

    return {
      meta: [
        { title: `${post.title} · TimeAmber` },
        { name: "description", content: description },
        { property: "og:title", content: post.title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { property: "og:image:alt", content: post.title },
        { property: "article:published_time", content: post.publishAt },
        { property: "article:modified_time", content: post.notionLastEdited ?? post.publishAt },
        { property: "article:author", content: "TimeAmber" },
        { property: "article:section", content: post.category },
        // 每个标签一条 article:tag，社交平台与搜索引擎据此归类。
        ...post.tags.map((tag: string) => ({ property: "article:tag", content: tag })),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: post.title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "twitter:image:alt", content: post.title },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PostPage,
});

// 顶部阅读进度条：宽度 = 已滚动百分比。
function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// 分享：复制链接 + Twitter/Telegram/微博。
function SharePost({ url, title }: { url: string; title: string }) {
  const enc = encodeURIComponent;
  const links = [
    {
      label: "Twitter / X",
      href: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`,
    },
    { label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` },
    {
      label: "微博",
      href: `https://service.weibo.com/share/share.php?url=${enc(url)}&title=${enc(title)}`,
    },
  ];
  function copy() {
    navigator.clipboard?.writeText(url).then(
      () => toast.success("链接已复制"),
      () => toast.error("复制失败，请手动复制"),
    );
  }
  return (
    <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border/60 pt-6">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Share2 className="h-3.5 w-3.5" /> 分享
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Copy className="h-3 w-3" /> 复制链接
      </button>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

// 相关文章：紧凑卡片可以容纳更多内容，优先共同标签，其次同分类，取前 12 篇。
function RelatedPosts({ items }: { items: RelatedPost[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12 border-t border-border/60 pt-8">
      <h2 className="mb-4 font-display text-lg font-semibold">相关文章</h2>
      <ul className="grid grid-cols-1 border-b border-border sm:grid-cols-2 sm:gap-x-8">
        {items.map((p) => (
          <li key={p.slug}>
            <Link
              to="/posts/$slug"
              params={{ slug: p.slug }}
              className="group flex items-start justify-between gap-6 border-t border-border px-2 py-4 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="line-clamp-2 min-w-0 leading-[1.45] font-medium tracking-[-0.01em] transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
                {p.title}
              </span>
              <time
                dateTime={p.publishAt}
                className="font-latin mt-0.5 shrink-0 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
              >
                {formatDateKey(p.publishAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PostPage() {
  const { slug } = Route.useParams();
  const { post, contentHtml, related } = Route.useLoaderData();
  const [prefs, setPrefs] = useReadingPrefs();

  // 正文增强（仅客户端）：图片点击放大 + 代码块复制。
  //
  // 代码块的外框/语言标签/复制按钮由服务端直出（见 markdown.server.ts 的 rehypeCodeChrome）——
  // 正文经 dangerouslySetInnerHTML 注入，React 一旦重新提交该节点就会重设 innerHTML，
  // 客户端插入的 DOM 会被整片抹掉。所以这里只做两件不怕被重设的事：
  //   1. 复制用事件委托挂在 React 管理的稳定容器上，天然幂等；
  //   2. medium-zoom 必须持有真实 img 节点，用 MutationObserver 在正文被换掉后重新 attach。
  const articleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;

    let zoom: ReturnType<typeof mediumZoom> | null = null;
    const attachZoom = () => {
      zoom?.detach();
      zoom = mediumZoom(root.querySelectorAll("img"), {
        background: "rgba(0,0,0,0.9)",
        margin: 24,
      });
    };
    attachZoom();

    // 只观察 childList：medium-zoom 自己会改 img 的 class，观察 attributes 会自激。
    const observer = new MutationObserver(attachZoom);
    observer.observe(root, { childList: true, subtree: true });

    const onClick = (event: MouseEvent) => {
      const btn = (event.target as HTMLElement | null)?.closest?.(".code-copy");
      if (!(btn instanceof HTMLElement)) return;
      const pre = btn.closest(".code-block")?.querySelector("pre");
      if (!pre) return;

      navigator.clipboard?.writeText(pre.textContent ?? "").then(
        () => {
          btn.textContent = "已复制";
          window.setTimeout(() => {
            btn.textContent = "复制";
          }, 1500);
        },
        () => {},
      );
    };
    root.addEventListener("click", onClick);

    return () => {
      observer.disconnect();
      zoom?.detach();
      root.removeEventListener("click", onClick);
    };
  }, [contentHtml]);

  if (!post || (post.status ?? "published") !== "published") {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-24 text-center">
        <p className="font-display text-2xl">这篇文章不存在</p>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">
          回到首页
        </Link>
      </div>
    );
  }

  if (post.type === "html" && post.externalUrl) {
    if (typeof window !== "undefined") {
      const target = post.openIn ?? "_blank";
      if (target === "_blank") {
        window.open(post.externalUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.replace(post.externalUrl);
      }
    }
    return (
      <div className="mx-auto max-w-2xl px-6 pt-24 text-center text-sm text-muted-foreground">
        正在跳转到 <span className="text-foreground">{post.externalUrl}</span>…
      </div>
    );
  }

  const toc = post.content ? extractToc(post.content) : [];

  // JSON-LD 结构化数据（Article）：正文末尾直出，让搜索引擎识别标题/时间/作者/分类/标签。
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: toMetaDescription(post.excerpt),
    image: [absolutePostImage(post.cover)],
    datePublished: post.publishAt,
    dateModified: post.notionLastEdited ?? post.publishAt,
    author: { "@type": "Person", name: "TimeAmber" },
    publisher: {
      "@type": "Organization",
      name: "TimeAmber",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/icon-512.png` },
    },
    mainEntityOfPage: `${SITE_URL}/posts/${slug}`,
    articleSection: post.category,
    keywords: post.tags.join(", "),
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
      <ReadingProgress />
      <script
        type="application/ld+json"
        // 转义 < 防止标题里出现 </script> 提前断出脚本。
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> 返回首页
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0">
          <header className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/80 px-2 py-0.5">
                {post.category}
              </span>
              {post.tags.map((t: string) => (
                <span key={t} className="rounded-full border border-border/80 px-2 py-0.5">
                  #{t}
                </span>
              ))}
            </div>

            <h1 className="break-words font-display text-3xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl">
              {post.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>{formatDate(post.publishAt)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> 约 {post.readingMinutes} 分钟
              </span>
              {post.source && (
                <a
                  href={post.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> 原文
                </a>
              )}
            </div>
          </header>

          <img
            src={post.cover || DEFAULT_POST_COVER}
            alt=""
            className={`mb-10 h-64 w-full rounded-xl bg-background/70 dark:bg-overlay/20 ${
              !post.cover || post.cover === DEFAULT_POST_COVER
                ? "object-contain p-8"
                : "object-cover"
            }`}
          />

          <div
            ref={articleRef}
            className="article-prose text-foreground/90"
            style={{
              fontSize: `${prefs.fontSize}px`,
              lineHeight: prefs.lineHeight,
            }}
          >
            {contentHtml ? (
              <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
            ) : (
              <>
                <p className="text-lg text-muted-foreground">{post.excerpt}</p>
                <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                  这是一篇剪藏文章，完整内容请在
                  {post.source ? (
                    <a
                      href={post.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary hover:underline"
                    >
                      原文链接
                    </a>
                  ) : (
                    <span className="ml-1">原始来源</span>
                  )}
                  查看。本站仅做归档与索引。
                </p>
              </>
            )}
          </div>

          <SharePost url={`${SITE_URL}/posts/${slug}`} title={post.title} />
          <RelatedPosts items={related} />
        </article>

        <aside className="lg:block">
          <div className="space-y-6 lg:sticky lg:top-24">
            {toc.length > 0 && <TableOfContents items={toc} />}
            <ReadingControls prefs={prefs} setPrefs={setPrefs} />
          </div>
        </aside>
      </div>
    </div>
  );
}
