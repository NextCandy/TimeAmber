import type { ReactNode } from "react";

import { SITE_URL } from "./brand";

export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "TimeAmber · 时光琥珀",
      url: SITE_URL,
      inLanguage: "zh-CN",
    },
    {
      "@type": "Organization",
      name: "TimeAmber",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/icon-512.png`,
    },
  ],
} as const;

export function JsonLd({ data }: { data: unknown }): ReactNode {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const PUBLIC_CATEGORY_REDIRECTS: Record<string, string> = {
  "VS.DO 剪藏": "剪藏",
  "VS.DO": "剪藏",
  树洞: "剪藏",
  树洞剪藏: "剪藏",
};

export function categoryRedirectTarget(value: string | undefined): string | null {
  if (!value) return null;
  return PUBLIC_CATEGORY_REDIRECTS[value] ?? null;
}
