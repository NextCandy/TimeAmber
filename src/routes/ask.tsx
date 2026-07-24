import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Loader2, Send, Sparkles } from "lucide-react";
import { SITE_URL } from "@/lib/brand";
import {
  askPublicQuestion,
  getPublicAskStatus,
  type AskTimeAmberResult,
} from "@/lib/ask.functions";

export const Route = createFileRoute("/ask")({
  // 开关状态在服务端读，关着的时候前台连输入框都不渲染。
  loader: async () => ({
    status: await getPublicAskStatus().catch(() => ({
      enabled: false,
      configured: false,
    })),
  }),
  head: () => ({
    meta: [
      { title: "问一问 · TimeAmber" },
      {
        name: "description",
        content: "基于 TimeAmber 站内文章的问答，回答均来自本站已归档的内容。",
      },
      { property: "og:title", content: "问一问 · TimeAmber" },
      { property: "og:url", content: `${SITE_URL}/ask` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/ask` }],
  }),
  component: AskPage,
});

function AskPage() {
  const { status } = Route.useLoaderData();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskTimeAmberResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const disabled = !status.enabled || !status.configured;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (q.length < 2 || pending) return;

    setPending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askPublicQuestion({ data: { question: q } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "提问失败，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-16">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Ask</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">问一问</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          基于本站已归档的文章作答，每条结论都会标注来源。答不上来时它会直说，不会编。
        </p>
      </header>

      {disabled ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">站内问答暂未开放。</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            回到首页
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} className="relative">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSubmit(e);
              }}
              rows={3}
              maxLength={1000}
              placeholder="想问点什么？比如「NAS 上怎么部署 frp」"
              className="w-full resize-none rounded-xl border border-border/80 bg-card/70 p-4 pr-14 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 shadow-sm transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={pending || question.trim().length < 2}
              aria-label="提问"
              className="absolute bottom-4 right-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">⌘/Ctrl + Enter 提交</p>

          {error && (
            <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <section className="mt-8">
              {result.noResults ? (
                <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center text-sm text-muted-foreground">
                  站内没有找到能支撑回答的内容。
                </p>
              ) : (
                <>
                  <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground/90">
                    {result.answer}
                  </div>

                  {result.sources.length > 0 && (
                    <div className="mt-6">
                      <h2 className="mb-3 text-sm font-semibold">引用来源</h2>
                      <ul className="flex flex-col gap-3">
                        {result.sources.map((s) => (
                          <li
                            key={s.id}
                            className="rounded-xl border border-border/70 bg-card/40 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  <span className="mr-1.5 text-xs text-primary">{s.id}</span>
                                  {s.title}
                                </p>
                                {s.summary && (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    {s.summary}
                                  </p>
                                )}
                              </div>
                              {(s.internalUrl || s.originalUrl) && (
                                <a
                                  href={s.internalUrl || s.originalUrl || "#"}
                                  target={s.internalUrl ? undefined : "_blank"}
                                  rel={s.internalUrl ? undefined : "noopener noreferrer"}
                                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                                  aria-label="查看来源"
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
