import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ArticleCard } from "@/components/home/ArticleCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import { useReveal } from "@/hooks/use-reveal";
import type { HomePost } from "@/lib/home.functions";

/** 编辑精选：横向轮播，支持箭头、键盘左右与触摸拖拽。 */
export function FeaturedCarousel({ posts }: { posts: HomePost[] }) {
  const [emblaRef, embla] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    loop: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const revealRef = useReveal<HTMLElement>();

  const sync = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    sync();
    embla.on("select", sync).on("reInit", sync);
    return () => {
      embla.off("select", sync).off("reInit", sync);
    };
  }, [embla, sync]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!embla) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      embla.scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      embla.scrollNext();
    }
  };

  if (posts.length === 0) return null;

  const arrow =
    "inline-flex h-10 w-10 items-center justify-center rounded-[20px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40";

  return (
    <section
      ref={revealRef}
      aria-labelledby="featured-title"
      className="bg-[var(--surface-deep)] py-14"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div id="featured-title">
          <SectionHeader
            kicker="Featured"
            title="编辑精选"
            action={
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-label="上一组精选"
                  disabled={!canPrev}
                  onClick={() => embla?.scrollPrev()}
                  className={`${arrow} border border-border text-foreground hover:border-primary/50`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="下一组精选"
                  disabled={!canNext}
                  onClick={() => embla?.scrollNext()}
                  className={`${arrow} bg-primary text-primary-foreground hover:opacity-90`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            }
          />
        </div>

        <div
          ref={emblaRef}
          className="overflow-hidden"
          tabIndex={0}
          role="region"
          aria-label="编辑精选文章，可用左右方向键切换"
          onKeyDown={onKeyDown}
        >
          <div className="flex gap-5">
            {posts.map((post) => (
              <ArticleCard key={post.slug} post={post} className="w-[min(400px,85vw)] shrink-0" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
