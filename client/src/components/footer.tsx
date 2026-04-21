import { useEffect, useState } from "react";
import { AnimateIn } from "@/hooks/use-animate";
import { fetchPublicSettings } from "@/lib/api";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [footerText, setFooterText] = useState("");
  const [siteTitle, setSiteTitle] = useState("Monolith");

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => {
        setFooterText(data.footer_text || "");
        setSiteTitle(data.site_title || "Monolith");
      })
      .catch(() => {});
  }, []);

  const displayText = footerText || `© ${currentYear} ${siteTitle}. 使用 Hono + Vite 构建，部署于 Cloudflare 边缘。`;

  return (
    <footer className="app-footer mt-auto border-t border-border/40">
      <AnimateIn animation="animate-fade-in" className="mx-auto flex max-w-[1440px] items-center justify-center px-[20px] py-[28px] lg:px-[40px]">
        <p className="text-[12px] text-muted-foreground/50">{displayText}</p>
      </AnimateIn>
    </footer>
  );
}
