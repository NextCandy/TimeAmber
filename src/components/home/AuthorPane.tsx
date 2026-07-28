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
      className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-6 py-10 md:flex-row md:gap-10"
    >
      <div className="min-w-0 flex-1 text-center md:text-left">
        <p className="font-latin text-[11px] font-medium tracking-[0.2em] text-primary uppercase">
          Personal Archive · 个人档案馆
        </p>

        <h2
          id="author-title"
          className="mt-2.5 text-xl leading-tight font-black tracking-tight text-balance text-foreground sm:text-2xl"
        >
          {settings.siteTagline}
        </h2>

        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted-foreground max-md:mx-auto">
          {settings.siteDescription}
        </p>

        <p className="font-latin mt-2 text-xs text-[var(--text-faint)]">
          {totalPosts.toLocaleString("en-US")} 篇归档 · 持续更新
        </p>
      </div>

      {/* 主理人卡片：封面区放圆形头像，下方铭牌栏 */}
      <div className="w-full max-w-[200px] shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="cover-gradient flex aspect-square items-center justify-center p-5">
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
            <span className="font-brand text-5xl text-primary-foreground">
              {getAuthorInitial(authorName)}
            </span>
          )}
        </div>
        <div className="flex h-[52px] items-center gap-2 px-4">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="truncate text-xs text-foreground">
            {authorName}
            <span className="mx-1.5 text-[var(--text-faint)]">·</span>
            <span className="text-muted-foreground">主理人</span>
          </span>
        </div>
      </div>
    </section>
  );
}
