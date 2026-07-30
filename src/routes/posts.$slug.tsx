import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock, ExternalLink, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import mediumZoom from "medium-zoom";
import { POSTS, formatDate } from "@/lib/sample-posts";
import { formatDateKey } from "@/lib/date";
import { DEFAULT_POST_COVER, SITE_URL } from "@/lib/brand";
import { toMetaDescription } from "@/lib/strip-markdown";
import { linkRel, linkTarget } from "@/lib/post-link";
import { loadPublicPost } from "@/lib/state.functions";
import {
  loadAdjacentPosts,
  loadRelatedPosts,
  type AdjacentPosts,
  type RelatedPost,
} from "@/lib/public-posts.functions";
import { renderMarkdownFn } from "@/lib/markdown.functions";
import { TableOfContents, extractToc } from "@/components/post/TableOfContents";
import { ReadingControls, useReadingPrefs } from "@/components/post/ReadingControls";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

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
    // 相关推荐同一套权重挪到了 SQL 里，只回 6 条 —— 原来是靠 root loader
    // 下发的全部文章在浏览器里算分，那份数据现在不再进 payload。
    const [dbPost, related, adjacent] = await Promise.all([
      loadPublicPost({ data: { slug: params.slug } }).catch(() => null),
      loadRelatedPosts({ data: { slug: params.slug, limit: 6 } }).catch(() => []),
      loadAdjacentPosts({ data: { slug: params.slug } }).catch((): AdjacentPosts => ({
        prev: null,
        next: null,
      })),
    ]);
    const post = dbPost ?? POSTS.find((p) => p.slug === params.slug) ?? null;

    // 剪藏类文章（VS.DO / 树洞）的正文是一份离线 HTML，externalUrl 指向站内
    // /cdn/... 路径，这里直接跳过去。原先是等页面渲染出来再由客户端
    // window.open(…, "_blank")，那不是用户手势触发的，会被弹窗拦截器挡下，
    // 页面就永远停在一行「正在跳转…」上 —— 看着就是打开一片空白。
    // href 是相对路径，不会被自动推断成整页跳转，必须显式 reloadDocument。
    if (post?.type === "html" && post.externalUrl) {
      throw redirect({ href: post.externalUrl, reloadDocument: true });
    }

    const contentHtml =
      post && post.content ? await renderMarkdownFn({ data: { md: post.content } }) : "";
    return { post, contentHtml, related, adjacent };
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
        className="h-full bg-accent-amber transition-[width] duration-150 ease-out"
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

/**
 * 上一篇 / 下一篇。两侧各占一半，缺一边时另一边不撑满 —— 半张卡片配一片
 * 空白比强行拉伸更容易看出「到头了」。剪藏类文章同样直连离线页，
 * 免得白绕一次 /posts/ 重定向。
 */
function AdjacentNav({ items }: { items: AdjacentPosts }) {
  if (!items.prev && !items.next) return null;

  const cell =
    "group flex min-w-0 flex-1 flex-col gap-1.5 border border-border px-4 py-3.5 transition-colors hover:border-accent-amber/50 hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const label = "inline-flex items-center gap-1 text-[11px] text-muted-foreground";
  const title =
    "line-clamp-2 text-sm leading-snug font-medium transition-colors [overflow-wrap:anywhere] group-hover:text-primary";

  const body = (post: RelatedPost, dir: "prev" | "next") => (
    <>
      <span className={`${label} ${dir === "next" ? "justify-end" : ""}`}>
        {dir === "prev" ? (
          <>
            <ArrowLeft className="h-3 w-3" /> 上一篇
          </>
        ) : (
          <>
            下一篇 <ArrowRight className="h-3 w-3" />
          </>
        )}
      </span>
      <span className={`${title} ${dir === "next" ? "text-right" : ""}`}>{post.title}</span>
    </>
  );

  const link = (post: RelatedPost, dir: "prev" | "next") =>
    post.type === "html" && post.externalUrl ? (
      <a
        href={post.externalUrl}
        target={linkTarget(post.externalUrl)}
        rel={linkRel(post.externalUrl)}
        className={cell}
      >
        {body(post, dir)}
      </a>
    ) : (
      <Link to="/posts/$slug" params={{ slug: post.slug }} className={cell}>
        {body(post, dir)}
      </Link>
    );

  return (
    <nav
      aria-label="上一篇下一篇"
      className="mt-12 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row"
    >
      {items.prev ? link(items.prev, "prev") : <span className="hidden flex-1 sm:block" />}
      {items.next ? link(items.next, "next") : <span className="hidden flex-1 sm:block" />}
    </nav>
  );
}

// 相关文章：优先共同标签，其次同分类，最多 6 篇；桌面三列、手机单列。
function RelatedPosts({ items }: { items: RelatedPost[] }) {
  if (!items.length) return null;
  const rowClass =
    "group flex h-full flex-col justify-between gap-4 border border-border bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-accent-amber/50 hover:bg-accent-amber-soft/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:hover:translate-y-0";
  return (
    <section className="mt-12 border-t border-border/60 pt-8">
      <h2 className="mb-4 font-display text-lg font-semibold">相关文章</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => {
          const inner = (
            <>
              <span className="line-clamp-2 min-w-0 leading-[1.45] font-medium tracking-[-0.01em] transition-colors [overflow-wrap:anywhere] group-hover:text-primary">
                {p.title}
              </span>
              <time
                dateTime={p.publishAt}
                className="font-latin shrink-0 text-[11px] leading-5 tracking-[0.06em] text-[var(--text-faint)]"
              >
                {formatDateKey(p.publishAt)}
              </time>
            </>
          );
          // 剪藏类文章直接指向离线页，省掉 /posts/ 那一跳重定向。
          return (
            <li key={p.slug}>
              {p.type === "html" && p.externalUrl ? (
                <a
                  href={p.externalUrl}
                  target={linkTarget(p.externalUrl)}
                  rel={linkRel(p.externalUrl)}
                  className={rowClass}
                >
                  {inner}
                </a>
              ) : (
                <Link to="/posts/$slug" params={{ slug: p.slug }} className={rowClass}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PostPage() {
  const { slug } = Route.useParams();
  const { post, contentHtml, related, adjacent } = Route.useLoaderData();
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

  // 正常情况下 loader 已经 302 走了，走到这里说明重定向没生效。
  // 给一个真链接让读者自己点 —— 用户手势触发的导航不会被拦截。
  if (post.type === "html" && post.externalUrl) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-24 text-center">
        <p className="text-sm text-muted-foreground">这篇是剪藏存档，正文是一份离线页面。</p>
        <a href={post.externalUrl} className="mt-4 inline-block text-primary hover:underline">
          打开《{post.title}》
        </a>
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

  // 面包屑的结构化版本，让搜索结果里显示「首页 › 分类 › 标题」而不是裸 URL。
  // 与上面可见的 <Breadcrumb> 保持同样的层级，两边对不上会被判定成误导性标记。
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: SITE_URL },
      ...(post.category
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: post.category,
              item: `${SITE_URL}/categories?c=${encodeURIComponent(post.category)}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: post.category ? 3 : 2,
        name: post.title,
        item: `${SITE_URL}/posts/${slug}`,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
      <ReadingProgress />
      <script
        type="application/ld+json"
        // 转义 < 防止标题里出现 </script> 提前断出脚本。
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumb
        items={[
          { label: "首页", to: "/" },
          ...(post.category
            ? [{ label: post.category, to: "/categories", search: { c: post.category } }]
            : []),
          { label: post.title },
        ]}
      />

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
          <AdjacentNav items={adjacent} />
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
