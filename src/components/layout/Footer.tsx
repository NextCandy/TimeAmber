import { Link } from "@tanstack/react-router";

import { useAdminStore } from "@/lib/admin-store";

export function Footer() {
  const { settings } = useAdminStore();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 px-6 py-6 text-sm sm:flex-row sm:justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="brand-mark h-6 w-6" aria-hidden="true" />
          <span className="font-display text-base leading-none font-bold">
            {settings.siteTitle}
          </span>
        </Link>

        <p className="font-latin text-[var(--text-faint)]">Built with TanStack Start + Supabase</p>
      </div>
    </footer>
  );
}
