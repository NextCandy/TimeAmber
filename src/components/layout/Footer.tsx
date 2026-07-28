import { Link } from "@tanstack/react-router";

import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";

type FooterLink = { label: string; to?: string; href?: string };

export function Footer() {
  const { settings } = useAdminStore();

  // 只放站内真实存在的路由，避免出现点不动的死链。
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "站点",
      links: [
        { label: "首页", to: "/" },
        { label: "分类", to: "/categories" },
        { label: "归档", to: "/archive" },
      ],
    },
    {
      title: "关于",
      links: [
        { label: "关于我", to: "/about" },
        { label: "友链", to: "/friends" },
        { label: "后台", to: "/admin" },
      ],
    },
    {
      title: "关注",
      links: [
        { label: "RSS", href: "/rss.xml" },
        ...(settings.contactGithub ? [{ label: "GitHub", href: settings.contactGithub }] : []),
        ...(settings.contactEmail
          ? [{ label: "Email", href: `mailto:${settings.contactEmail}` }]
          : []),
      ],
    },
  ];

  const linkClass =
    "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <footer className="mt-16 bg-[var(--surface-deep)]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-[280px]">
            <Link to="/" className="flex items-center gap-2.5">
              <img src={BRAND_ICON} alt="" className="h-7 w-7 object-contain" />
              <span className="font-brand text-xl leading-none">{settings.siteTitle}</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {settings.siteDescription}
            </p>
          </div>

          <nav aria-label="页脚导航" className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-14">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="mb-3 text-sm font-semibold text-foreground">{column.title}</p>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <Link to={link.to} className={linkClass}>
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className={linkClass}
                          {...(link.href?.startsWith("http")
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <hr className="my-10 border-border" />

        <div className="flex flex-col gap-2 text-xs text-[var(--text-faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            版权所有 {new Date().getFullYear()} {settings.siteTitle} · {settings.siteTagline}
          </p>
          <p className="font-latin">Built with TanStack Start + Supabase</p>
        </div>
      </div>
    </footer>
  );
}
