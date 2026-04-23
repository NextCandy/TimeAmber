import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import { renderMarkdown } from "@/lib/markdown";
import { ArrowLeft } from "lucide-react";
import { SeoHead } from "@/components/seo-head";

type PageData = {
  slug: string; title: string; content: string;
  createdAt: string; updatedAt: string;
};



export function DynamicPage() {
  const params = useParams<{ slug: string }>();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.slug) return;
    let stale = false;

    fetch(`/api/pages/${params.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (stale) return;
        if (data.error) { setError("页面不存在"); return; }
        setPage(data);
      })
      .catch(() => { if (!stale) setError("页面加载失败"); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [params.slug]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-[56px]">
        <div className="animate-pulse space-y-[16px]">
          <div className="h-[36px] w-1/3 rounded bg-card/30" />
          <div className="h-[16px] w-full rounded bg-card/20" />
          <div className="h-[16px] w-4/5 rounded bg-card/20" />
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <h1 className="text-[20px] text-muted-foreground">{error || "页面不存在"}</h1>
      </div>
    );
  }

  return (
    <article className="mx-auto w-full max-w-[720px] py-[40px] lg:py-[56px]">
      <SeoHead
        title={page.title}
        description={`${page.title} — Monolith 独立页面`}
        url={`/page/${page.slug}`}
      />
      <Link href="/" className="mb-[32px] inline-flex items-center gap-[6px] text-[13px] text-muted-foreground/60 transition-all duration-200 hover:text-foreground hover:-translate-x-[2px] animate-fade-in">
        <ArrowLeft className="h-[14px] w-[14px]" />返回首页
      </Link>

      <header className="mb-[32px] animate-fade-in-up delay-1">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.3] lg:text-[32px]">{page.title}</h1>
      </header>

      <Separator className="mb-[32px] bg-border/30" />

      <div className="prose-monolith animate-fade-in delay-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }} />
    </article>
  );
}
