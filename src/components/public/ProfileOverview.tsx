import { Github, Link2, Mail } from "lucide-react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { BRAND_AUTHOR_AVATAR } from "@/lib/brand";
import { sortedSocialLinks, type PublicSiteConfig } from "@/lib/public-site-settings";
import type { HomeData } from "@/lib/home.functions";

const SOCIAL_ICONS = { Github, Mail, Link2 };

function socialHref(type: string, value: string) {
  if (type === "email" || (value.includes("@") && !value.startsWith("http")))
    return `mailto:${value}`;
  return value;
}

export function ProfileOverview({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const avatar = config.identity.avatarUrl || BRAND_AUTHOR_AVATAR;
  return (
    <GlassPanel className="public-profile flex h-full flex-col justify-between p-5 sm:p-6">
      <div>
        <div className="flex items-start gap-4">
          <img
            src={avatar}
            alt={`${config.identity.siteName} 头像`}
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0 rounded-2xl border border-white/30 object-cover shadow-lg"
            onError={(event) => {
              event.currentTarget.src = BRAND_AUTHOR_AVATAR;
            }}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.18em] text-accent-amber uppercase">
              {config.identity.siteNameZh}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
              {config.identity.siteName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{config.identity.slogan}</p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          {config.identity.description}
        </p>
      </div>

      <div>
        <dl className="mt-6 grid grid-cols-3 divide-x divide-border/70">
          <div className="pr-3">
            <dt>文章</dt>
            <dd>{home.totalPosts.toLocaleString("zh-CN")}</dd>
          </div>
          <div className="px-3">
            <dt>标签</dt>
            <dd>{home.totalTags.toLocaleString("zh-CN")}</dd>
          </div>
          <div className="pl-3">
            <dt>分类</dt>
            <dd>{home.totalCategories.toLocaleString("zh-CN")}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {sortedSocialLinks(config).map((link) => {
            const Icon = SOCIAL_ICONS[link.icon as keyof typeof SOCIAL_ICONS] ?? Link2;
            const href = socialHref(link.type, link.value);
            return (
              <a
                key={link.id}
                href={href}
                target={link.openInNewTab && !href.startsWith("mailto:") ? "_blank" : undefined}
                rel={
                  link.openInNewTab && !href.startsWith("mailto:")
                    ? "noopener noreferrer"
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/25 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-amber/50 hover:text-accent-amber focus-visible:outline-none"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {link.label}
              </a>
            );
          })}
        </div>
      </div>
    </GlassPanel>
  );
}
