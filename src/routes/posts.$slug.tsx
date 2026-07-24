import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import mediumZoom from "medium-zoom";
import { POSTS, formatDate } from "@/lib/sample-posts";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import { loadPublicPost } from "@/lib/state.functions";
import { renderMarkdownFn } from "@/lib/markdown.functions";
import { TableOfContents, extractToc } from "@/components/post/TableOfContents";
import { ReadingControls, useReadingPrefs } from "@/components/post/ReadingControls";

export const Route = createFileRoute("/posts/$slug")({
  loader: async ({ params }) => {
    const dbPost = await loadPublicPost({
      data: { slug: params.slug },
    }).catch(() => null);
    const post = dbPost ?? POSTS.find((p) => p.slug === params.slug) ?? null;
    const contentHtml =
      post && post.type !== "html" && post.content
        ? await renderMarkdownFn({ data: { md: post.content } })
        : "";
    return { post, contentHtml };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.post
      ? [
          { title: `${loaderData.post.title} · TimeAmber` },
          { name: "description", content: loaderData.post.excerpt },
          { property: "og:title", content: loaderData.post.title },
          { property: "og:description", content: loaderData.post.excerpt },
          { property: "og:type", content: "article" },
        ]
      : [{ title: "文章 · TimeAmber" }],
  }),
  component: PostPage,
});

function PostPage() {
  const { slug } = Route.useParams();
  const { post: loaderPost, contentHtml } = Route.useLoaderData();
  const { posts } = useAdminStore();
  const summary = posts.find((p) => p.slug === slug);
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

  const post = loaderPost ?? summary;

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

  return (
    <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
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
            className={`mb-10 h-64 w-full rounded-xl bg-background/70 dark:bg-black/20 ${
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
