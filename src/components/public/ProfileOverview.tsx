import {
  Github,
  Link2,
  Mail,
  MessageCircle,
  MessageSquare,
  Music,
  Send,
  Twitter,
} from "lucide-react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { BRAND_AUTHOR_AVATAR } from "@/lib/brand";
import {
  safePublicHref,
  sortedSocialLinks,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";
import type { HomeData } from "@/lib/home.functions";
import type { PublicSiteSettings } from "@/lib/admin-store";

const SOCIAL_ICONS = {
  Github,
  Mail,
  Link2,
  Twitter,
  Send,
  MessageCircle,
  MessageSquare,
  Music,
};

function socialHref(type: string, value: string) {
  if (type === "email" || (value.includes("@") && !/^[a-z][a-z\d+.-]*:/i.test(value)))
    return `mailto:${value}`;
  return value;
}

/**
 * 后台「设置」页那组 contact* 字段和公开站点设置里的 socialLinks 是两套配置，
 * 早先只有后者会在头像下方露出。这里把前者补进来，两边填哪个都能显示。
 */
const CONTACT_FIELDS = [
  {
    key: "contactTelegram",
    label: "Telegram",
    icon: "Send",
    href: (v: string) => (/^https?:/i.test(v) ? v : `https://t.me/${v.replace(/^@/, "")}`),
  },
  {
    key: "contactQQ",
    label: "QQ",
    icon: "MessageCircle",
    href: (v: string) =>
      /^https?:/i.test(v) ? v : `https://wpa.qq.com/msgrd?v=3&uin=${v}&site=qq&menu=yes`,
  },
  { key: "contactWechat", label: "微信", icon: "MessageSquare", href: null },
  { key: "contactXiaohongshu", label: "小红书", icon: "Link2", href: (v: string) => v },
  { key: "contactDouyin", label: "抖音", icon: "Music", href: (v: string) => v },
  { key: "contactTwitter", label: "X / Twitter", icon: "Twitter", href: (v: string) => v },
] as const;

type ExtraLink = { id: string; label: string; icon: string; href: string; copyValue: boolean };

/** socialLinks 里已经配过的同类条目优先，避免同一个账号在头像下方出现两次。 */
function extraContactLinks(settings: PublicSiteSettings, config: PublicSiteConfig): ExtraLink[] {
  const configured = new Set(
    config.socialLinks
      .filter((item) => item.enabled)
      .map((item) => item.value.trim().toLowerCase())
      .filter(Boolean),
  );
  const links: ExtraLink[] = [];
  for (const field of CONTACT_FIELDS) {
    const raw = (settings as Record<string, unknown>)[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || configured.has(value.toLowerCase())) continue;
    // 微信号没有可跳转的地址，点一下复制号码更实用。
    const href = field.href
      ? safePublicHref(field.href(value), { allowMailtoTel: true })
      : undefined;
    if (!href && field.href) continue;
    links.push({
      id: field.key,
      label: field.href ? field.label : `${field.label}：${value}`,
      icon: field.icon,
      href: href ?? "",
      copyValue: !field.href,
    });
  }
  return links;
}

export function ProfileOverview({
  config,
  home,
  settings,
}: {
  config: PublicSiteConfig;
  home: HomeData;
  settings: PublicSiteSettings;
}) {
  const avatar = config.identity.avatarUrl || BRAND_AUTHOR_AVATAR;
  const extraLinks = extraContactLinks(settings, config);
  const profileSlogan = config.identity.slogan.trim();
  const showProfileSlogan =
    profileSlogan.length > 0 &&
    profileSlogan.toLocaleLowerCase() !== config.identity.siteName.trim().toLocaleLowerCase();

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
        {showProfileSlogan && <p className="aibrium-profile-card__slogan">{profileSlogan}</p>}
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
        {extraLinks.map((link) => {
          const Icon = SOCIAL_ICONS[link.icon as keyof typeof SOCIAL_ICONS] ?? Link2;
          if (link.copyValue) {
            return (
              <button
                key={link.id}
                type="button"
                aria-label={link.label}
                title={link.label}
                className="aibrium-socials__button"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.label.split("：")[1] ?? link.label);
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            );
          }
          return (
            <a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
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
