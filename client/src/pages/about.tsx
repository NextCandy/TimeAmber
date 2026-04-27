import { useEffect, useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SeoHead } from "@/components/seo-head";
import { renderMarkdownAsync } from "@/lib/markdown-loader";
import { fetchPublicSettings, type PublicSettings } from "@/lib/api";

type AboutPageData = {
  slug: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const fallbackTitle = "关于";
const fallbackDescription = "关于 Time Amber 博客，一个用文字封存瞬间的个人博客。";

const fallbackContent = `
## Time Amber 是什么？

Time Amber 是一个用文字封存瞬间的个人博客。它关注技术、生活与长期思考，把那些容易被时间冲散的片段慢慢沉淀成琥珀。

这里不追求高频更新，而是希望每一篇文章都能留下清晰的上下文、真实的判断和可回看的经验。

## 技术栈

- **前端** — Vite + React 19 SPA，Tailwind CSS v4，Shadcn UI
- **后端** — Hono.js，运行在 Cloudflare Workers 边缘
- **数据库** — Cloudflare D1（边缘 SQLite）+ Drizzle ORM
- **存储** — Cloudflare R2（S3 兼容对象存储）
- **部署** — Cloudflare Pages + Workers，全球 300+ 节点

## 设计哲学

- 所有间距严格遵循 **偶数模数体系**
- 中文排版 **零字间距**，杜绝"机翻感"
- 大标题使用 **负向字距压缩**
- 暗色主题基于 **Oklch 色域**

> 时光成珀，字字如初。
`;

export function AboutPage() {
  const [page, setPage] = useState<AboutPageData | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => setSettings(data))
      .catch(() => setSettings(null));

    fetch("/api/pages/about")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("about page not found");
        }
        return response.json() as Promise<AboutPageData>;
      })
      .then((data) => setPage(data))
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, []);

  const title = page?.title || fallbackTitle;
  const content = page?.content || fallbackContent;
  const siteTitle = settings?.site_title || "Time Amber";
  const description = page?.title ? `${page.title} - ${siteTitle} 独立页面` : fallbackDescription;

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    renderMarkdownAsync(content).then((nextHtml) => {
      if (!cancelled) {
        setHtmlContent(nextHtml);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [content, loading]);

  useEffect(() => {
    if (!contentRef.current || loading) return;
    const imgs = contentRef.current.querySelectorAll<HTMLImageElement>("img[data-lazy-img]");
    if (imgs.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            img.classList.add("lazy-img--loaded");
            observer.unobserve(img);
          }
        });
      },
      { rootMargin: "100px", threshold: 0.01 }
    );

    imgs.forEach((img) => {
      if (img.complete) {
        img.classList.add("lazy-img--loaded");
      } else {
        img.addEventListener("load", () => img.classList.add("lazy-img--loaded"), { once: true });
        observer.observe(img);
      }
    });

    return () => observer.disconnect();
  }, [htmlContent, loading]);

  return (
    <div className="mx-auto w-full max-w-[720px] py-[32px] lg:py-[56px] px-[16px] lg:px-0">
      <SeoHead
        title={title}
        description={description}
        url="/about"
        siteName={siteTitle}
      />
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{title}</h1>
      <Separator className="my-[24px] bg-border/30" />

      {loading ? (
        <div className="animate-pulse space-y-[16px]">
          <div className="h-[20px] w-1/3 rounded bg-card/20" />
          <div className="h-[16px] w-full rounded bg-card/20" />
          <div className="h-[16px] w-4/5 rounded bg-card/20" />
          <div className="h-[16px] w-5/6 rounded bg-card/20" />
        </div>
      ) : htmlContent ? (
        <div
          ref={contentRef}
          className="prose-monolith"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        <div className="animate-pulse space-y-[16px]">
          <div className="h-[16px] w-full rounded bg-card/20" />
          <div className="h-[16px] w-4/5 rounded bg-card/20" />
          <div className="h-[16px] w-5/6 rounded bg-card/20" />
        </div>
      )}
    </div>
  );
}
