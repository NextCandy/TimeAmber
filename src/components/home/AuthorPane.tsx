import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { useReveal } from "@/hooks/use-reveal";
import { BRAND_AUTHOR_AVATAR } from "@/lib/brand";
import { getAuthorInitial } from "@/lib/author-profile";
import { useAdminStore } from "@/lib/admin-store";

/**
 * 主理人区，放在页脚上方。
 * 文案取自后台站点设置，不写死在组件里。
 */
export function AuthorPane({ totalPosts }: { totalPosts: number }) {
  const { settings } = useAdminStore();
  const revealRef = useReveal<HTMLElement>();
  const avatar = settings.authorAvatar?.trim() || BRAND_AUTHOR_AVATAR;
  const authorName = settings.authorName?.trim() || settings.siteTitle;

  return (
    <section
      ref={revealRef}
      aria-labelledby="author-title"
      className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-14 md:flex-row md:gap-14"
    >
      <div className="min-w-0 flex-1 text-center md:text-left">
        <p className="font-latin text-xs font-medium tracking-[0.2em] text-primary uppercase">
          Personal Archive · 个人档案馆
        </p>

        <h2
          id="author-title"
          className="mt-4 text-2xl leading-tight font-black tracking-tight text-balance text-foreground sm:text-3xl"
        >
          {settings.siteTagline}
        </h2>

        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground max-md:mx-auto">
          {settings.siteDescription}
        </p>

        <p className="font-latin mt-3 text-sm text-[var(--text-faint)]">
          {totalPosts.toLocaleString("en-US")} 篇归档 · 持续更新
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <Link
            to="/archive"
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            浏览文章 <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/about"
            className="inline-flex h-11 items-center rounded-[10px] border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            关于我
          </Link>
        </div>
      </div>

      {/* 主理人卡片：封面区放圆形头像，下方铭牌栏 */}
      <div className="w-full max-w-[320px] shrink-0 overflow-hidden rounded-3xl border border-border bg-card">
        <div className="cover-gradient flex aspect-square items-center justify-center p-8">
          {avatar ? (
            <img
              src={avatar}
              alt={`${authorName} 的头像`}
              width={512}
              height={512}
              className="h-full w-full rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="font-brand text-7xl text-primary-foreground">
              {getAuthorInitial(authorName)}
            </span>
          )}
        </div>
        <div className="flex h-[60px] items-center gap-2.5 px-5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="truncate text-sm text-foreground">
            {authorName}
            <span className="mx-1.5 text-[var(--text-faint)]">·</span>
            <span className="text-muted-foreground">主理人</span>
          </span>
        </div>
      </div>
    </section>
  );
}
