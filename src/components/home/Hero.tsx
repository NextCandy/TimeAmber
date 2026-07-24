import { Search } from "lucide-react";
import { BRAND_ICON } from "@/lib/brand";

type HeroProps = {
  query: string;
  onQueryChange: (q: string) => void;
};

export function Hero({ query, onQueryChange }: HeroProps) {
  return (
    <section className="relative overflow-hidden pt-20 pb-14 sm:pt-28 sm:pb-20">
      <div className="hero-glow" />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/20 blur-3xl" />
          <img
            src={BRAND_ICON}
            alt="TimeAmber"
            className="h-20 w-20 object-contain drop-shadow-[0_12px_18px_oklch(0.55_0.15_55/0.35)]"
          />
        </div>

        <h1 className="mt-8 font-brand text-6xl font-normal leading-tight tracking-tight sm:text-7xl">
          TimeAmber
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">时光琥珀</p>
        <p className="mt-2 text-sm text-muted-foreground/80">时光成珀，字字如初</p>

        {/* Search */}
        <div className="group relative mt-8 w-full max-w-md">
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
