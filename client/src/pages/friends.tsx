import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchPublicSettings, type PublicSettings } from "@/lib/api";
import { SeoHead } from "@/components/seo-head";

type FriendLink = {
  name: string;
  url: string;
  logo: string;
};

function parseFriendLinks(raw: string | undefined): FriendLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const link = item as Partial<FriendLink>;
        return {
          name: String(link.name || "").trim(),
          url: String(link.url || "").trim(),
          logo: String(link.logo || "").trim(),
        };
      })
      .filter((link) => link.name && /^https?:\/\//i.test(link.url))
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function FriendsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "友链 | TimeAmber";
    fetchPublicSettings()
      .then((data) => setSettings(data))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  const links = useMemo(() => parseFriendLinks(settings?.friend_links), [settings?.friend_links]);
  const siteTitle = settings?.site_title || "TimeAmber";

  return (
    <>
      <SeoHead
        title="友链"
        description={`${siteTitle} 的朋友链接。`}
        url="/friends"
        breadcrumbs={[{ name: "首页", url: "/" }, { name: "友链", url: "/friends" }]}
      />
      <div className="mx-auto w-full max-w-[980px] py-[48px] sm:py-[72px]">
        <header className="mb-[28px] sm:mb-[36px]">
          <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.03em]">友链</h1>
          <p className="mt-[10px] max-w-[620px] text-[14px] sm:text-[15px] leading-[1.8] text-muted-foreground/60">
            一些值得常去看看的人、站点与社区。
          </p>
        </header>

        {loading ? (
          <div className="py-[40px] text-[13px] text-muted-foreground/40">加载中...</div>
        ) : links.length > 0 ? (
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
              <a
                key={`${link.name}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[88px] items-center gap-[14px] rounded-lg border border-border/15 bg-card/8 p-[14px] transition-all hover:-translate-y-[1px] hover:border-foreground/20 hover:bg-card/18"
              >
                <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/15 bg-background/40">
                  {link.logo ? (
                    <img
                      src={link.logo}
                      alt=""
                      className="h-full w-full object-contain p-[6px]"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="text-[18px] font-semibold text-muted-foreground/50">
                      {link.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px]">
                    <h2 className="truncate text-[14px] font-medium text-foreground">{link.name}</h2>
                    <ExternalLink className="h-[12px] w-[12px] shrink-0 text-muted-foreground/35 transition-colors group-hover:text-foreground/60" />
                  </div>
                  <p className="mt-[4px] truncate text-[11px] text-muted-foreground/35">{link.url}</p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/15 bg-card/5 px-[18px] py-[28px] text-[13px] text-muted-foreground/45">
            暂未添加友链。
          </div>
        )}
      </div>
    </>
  );
}
