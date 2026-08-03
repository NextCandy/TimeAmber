import { createFileRoute } from "@tanstack/react-router";
import { Mail, Github, Twitter } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "关于 · TimeAmber" },
      { name: "description", content: "关于 TimeAmber：一个克制的中文剪藏与笔记博客。" },
      { property: "og:title", content: "关于 · TimeAmber" },
      { property: "og:description", content: "一个克制的中文剪藏与笔记博客。" },
      { property: "og:url", content: `${SITE_URL}/about` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/about` }],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { settings } = useAdminStore();
  const stack = settings.aboutTechStack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-6 pt-16 pb-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          About
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">关于</h1>
      </header>

      <div className="space-y-6 text-base leading-relaxed text-foreground/90">
        {settings.aboutIntro.split(/\n\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}

        {settings.aboutQuote && (
          <p className="border-l-2 border-primary/50 pl-4 text-primary">{settings.aboutQuote}</p>
        )}

        {stack.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-3 font-display text-lg font-semibold">技术栈</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {stack.map((line, i) => (
                <li key={i}>· {line}</li>
              ))}
            </ul>
          </div>
        )}

        {settings.contactNote && (
          <p className="text-sm text-muted-foreground">{settings.contactNote}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2 text-sm">
          {settings.contactEmail && (
            <a
              href={`mailto:${settings.contactEmail}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4" /> {settings.contactEmail}
            </a>
          )}
          {settings.contactGithub && (
            <a
              href={settings.contactGithub}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
          )}
          {settings.contactTwitter && (
            <a
              href={settings.contactTwitter}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Twitter className="h-4 w-4" /> Twitter
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
