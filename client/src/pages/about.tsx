import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SeoHead } from "@/components/seo-head";
import { renderMarkdown } from "@/lib/markdown";
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
## Monolith 是什么？

Monolith（巨石碑）是一个关于代码、设计与边缘计算的个人博客。它的名字来源于库布里克《2001：太空漫游》中那块神秘的黑色石碑——一个超越时间、引领进化的静默存在。

这个博客同样试图成为一块"巨石碑"：在信息洪流中保持沉默的力量，用深度的技术写作取代碎片化的速食内容。

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

> 最好的代码，是让你忘记代码存在的那一种。
`;

export function AboutPage() {
  const [page, setPage] = useState<AboutPageData | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

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
      ) : (
        <div
          className="prose-monolith"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      )}
    </div>
  );
}
