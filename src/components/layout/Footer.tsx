import { Link } from "@tanstack/react-router";

import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";

export function Footer() {
  const { settings } = useAdminStore();

  return (
    <footer className="mt-8 bg-[var(--surface-deep)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-7 text-sm sm:flex-row sm:justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={BRAND_ICON} alt="" className="h-7 w-7 object-contain" />
          <span className="font-brand text-xl leading-none">{settings.siteTitle}</span>
        </Link>

        <p className="font-latin text-[var(--text-faint)]">Built with TanStack Start + Supabase</p>
      </div>
    </footer>
  );
}
