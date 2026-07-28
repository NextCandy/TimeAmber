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
      className="mx-auto flex w-full max-w-[1200px] flex-col-reverse items-start gap-7 border-t border-border px-6 py-12 md:flex-row md:items-center md:gap-10"
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

      {/* 主理人图像保持方形开放布局，不再使用独立卡片外壳。 */}
      <div className="h-24 w-24 shrink-0 overflow-hidden bg-muted">
        {avatar ? (
          <img
            src={avatar}
            alt={`${authorName} 的头像`}
            width={512}
            height={512}
            className="h-full w-full object-cover grayscale"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-primary">
            {getAuthorInitial(authorName)}
          </span>
        )}
      </div>
    </section>
  );
}
