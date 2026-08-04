import { Github, Link2, Mail } from "lucide-react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { BRAND_AUTHOR_AVATAR } from "@/lib/brand";
import {
  safePublicHref,
  sortedSocialLinks,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";
import type { HomeData } from "@/lib/home.functions";

const SOCIAL_ICONS = { Github, Mail, Link2 };

function socialHref(type: string, value: string) {
  if (type === "email" || (value.includes("@") && !/^[a-z][a-z\d+.-]*:/i.test(value)))
    return `mailto:${value}`;
  return value;
}

export function ProfileOverview({ config, home }: { config: PublicSiteConfig; home: HomeData }) {
  const avatar = config.identity.avatarUrl || BRAND_AUTHOR_AVATAR;

  return (
    <GlassPanel className="aibrium-profile-card">
      <div className="aibrium-profile-card__intro">
        <img
          src={avatar}
          alt={`${config.identity.siteName} 头像`}
          width={96}
          height={96}
          className="aibrium-profile-card__avatar"
          onError={(event) => {
            event.currentTarget.src = BRAND_AUTHOR_AVATAR;
          }}
        />
        <p className="aibrium-profile-card__eyebrow">{config.identity.siteNameZh}</p>
        <h2>{config.identity.siteName}</h2>
        <p className="aibrium-profile-card__slogan">{config.identity.slogan}</p>
        <p className="aibrium-profile-card__description">{config.identity.description}</p>
      </div>

      <div className="aibrium-socials" aria-label="社交链接">
        {sortedSocialLinks(config).map((link) => {
          const Icon = SOCIAL_ICONS[link.icon as keyof typeof SOCIAL_ICONS] ?? Link2;
          const href = safePublicHref(socialHref(link.type, link.value), { allowMailtoTel: true });
          if (!href) return null;
          return (
            <a
              key={link.id}
              href={href}
              target={link.openInNewTab && !href.startsWith("mailto:") ? "_blank" : undefined}
              rel={
                link.openInNewTab && !href.startsWith("mailto:") ? "noopener noreferrer" : undefined
              }
              aria-label={link.label}
              title={link.label}
              className="aibrium-socials__button"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </a>
          );
        })}
      </div>

      <dl className="aibrium-profile-card__stats">
        <div>
          <dt>文章</dt>
          <dd>{home.totalPosts.toLocaleString("zh-CN")}</dd>
        </div>
        <div>
          <dt>标签</dt>
          <dd>{home.totalTags.toLocaleString("zh-CN")}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{home.totalCategories.toLocaleString("zh-CN")}</dd>
        </div>
      </dl>
    </GlassPanel>
  );
}
