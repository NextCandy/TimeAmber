import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Dices } from "lucide-react";
import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";
import { isPublished } from "@/lib/sample-posts";

type HeroProps = {
  query: string;
  onQueryChange: (q: string) => void;
};

const TAGLINES = [
  "时光成珀，字字如初",
  "把值得的，留成琥珀",
  "剪藏、自建服务与 AI Agent 实践",
  "慢一点，把日子好好记下来",
];

export function Hero({ query, onQueryChange }: HeroProps) {
  const navigate = useNavigate();
  const { posts } = useAdminStore();
  const published = useMemo(() => posts.filter(isPublished), [posts]);

  // 标语轮播：淡出→换句→淡入，每句停留 ≥ 3s（纯 Tailwind 透明度过渡，无自定义 keyframe）。
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setTaglineIndex((i) => (i + 1) % TAGLINES.length);
        setVisible(true);
      }, 300);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  function goRandom() {
    if (!published.length) return;
    const pick = published[Math.floor(Math.random() * published.length)];
    navigate({ to: "/posts/$slug", params: { slug: pick.slug } });
  }

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
        <p className="mt-2 h-5 text-sm text-muted-foreground">
          <span
            className={`inline-block transition-opacity duration-300 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            时光琥珀 · {TAGLINES[taglineIndex]}
          </span>
        </p>

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

        {/* 随机一篇 */}
        <button
          type="button"
          onClick={goRandom}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/50 px-4 py-1.5 text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
        >
          <Dices className="h-3.5 w-3.5" /> 随机一篇
        </button>
      </div>
    </section>
  );
}
