import { Link } from "@tanstack/react-router";
import { useAdminStore } from "@/lib/admin-store";

export function Footer() {
  const { settings } = useAdminStore();
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-foreground">
            <span className="font-brand text-xl">{settings.siteTitle}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            {settings.siteTagline}
          </p>
          <p className="mt-1">{settings.siteDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/about" className="transition-colors hover:text-foreground">
            关于
          </Link>
          <Link to="/friends" className="transition-colors hover:text-foreground">
            友链
          </Link>
          {settings.contactEmail && (
            <a
              href={`mailto:${settings.contactEmail}`}
              className="transition-colors hover:text-foreground"
            >
              联系
            </a>
          )}
          <a
            href="/rss.xml"
            className="transition-colors hover:text-foreground"
            aria-label="RSS"
          >
            RSS
          </a>
          <Link to="/admin" className="transition-colors hover:text-foreground">
            后台
          </Link>
          <span className="text-xs">© {new Date().getFullYear()} <span className="font-brand text-sm">{settings.siteTitle}</span></span>
        </div>
      </div>
    </footer>
  );
}
