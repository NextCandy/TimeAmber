import { Search } from "lucide-react";
import { BRAND_ICON } from "@/lib/brand";

type HeroProps = {
  query: string;
  onQueryChange: (q: string) => void;
};

export function Hero({ query, onQueryChange }: HeroProps) {
  return (
    // 首屏优先给内容：原来 pt-28/pb-20 + 7xl 标题 + 两行副标题，整块把文章列表挤出首屏。
    <section className="relative overflow-hidden pt-12 pb-8 sm:pt-16 sm:pb-10">
      <div className="hero-glow" />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/20 blur-3xl" />
          <img
            src={BRAND_ICON}
            alt="TimeAmber"
            className="h-14 w-14 object-contain drop-shadow-brand"
          />
        </div>

        <h1 className="mt-4 font-brand text-4xl font-normal leading-tight tracking-tight sm:text-5xl">
          TimeAmber
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">时光琥珀 · 时光成珀，字字如初</p>

        {/* Search */}
        <div className="group relative mt-6 w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索标题、摘要、标签…"
            className="h-11 w-full rounded-xl border border-border/80 bg-card/70 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm backdrop-blur transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
    </section>
  );
}
