import { Link } from "@tanstack/react-router";

import { BRAND_ICON } from "@/lib/brand";
import { useAdminStore } from "@/lib/admin-store";

export function Footer() {
  const { settings } = useAdminStore();

  return (
    <footer className="mt-16 bg-[var(--surface-deep)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 text-sm sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
        <Link to="/" className="flex items-center gap-2.5 sm:justify-self-start">
          <img src={BRAND_ICON} alt="" className="h-7 w-7 object-contain" />
          <span className="font-brand text-xl leading-none">{settings.siteTitle}</span>
        </Link>

        <p className="font-latin text-[var(--text-faint)] sm:justify-self-center">
          © {new Date().getFullYear()}
        </p>

        <p className="font-latin text-[var(--text-faint)] sm:justify-self-end">
          Built with TanStack Start + Supabase
        </p>
      </div>
    </footer>
  );
}
