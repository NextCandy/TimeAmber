import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAdminStore } from "@/lib/admin-store";
import { sendNotify } from "@/lib/notify.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "后台 · TimeAmber" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayout,
});

function AlertAutoPush() {
  const store = useAdminStore();
  const run = useServerFn(sendNotify);
  const seen = useRef<Set<string>>(new Set());
  // dedup state: key -> [timestamps]
  const dedupHits = useRef<Map<string, number[]>>(new Map());
  useEffect(() => {
    const cfg = store.cloud.notify;
    if (!cfg?.autoPush) return;
    const threshold = cfg.autoPushLevel ?? "error";
    const fresh = store.alerts.filter((a) => {
      if (seen.current.has(a.id)) return false;
      if (threshold === "error" && a.level !== "error") return false;
      if (threshold === "warning" && a.level === "info") return false;
      return true;
    });
    if (fresh.length === 0) return;
    fresh.forEach((a) => seen.current.add(a.id));
    const channels: ("bark" | "telegram" | "smtp")[] = [];
    if (cfg.bark?.enabled && cfg.bark.key) channels.push("bark");
    if (cfg.telegram?.enabled && cfg.telegram.botToken && cfg.telegram.chatId)
      channels.push("telegram");
    if (cfg.smtp?.enabled && cfg.smtp.webhookUrl) channels.push("smtp");
    if (channels.length === 0) return;
    const dedup = cfg.dedup?.enabled
      ? {
          windowMs: (cfg.dedup.windowSec ?? 600) * 1000,
          maxPerKey: cfg.dedup.maxPerKey ?? 1,
        }
      : null;
    (async () => {
      for (const a of fresh.slice(0, 5)) {
        if (dedup) {
          const key = `${a.source}::${a.message}`.slice(0, 200);
          const now = Date.now();
          const hits = (dedupHits.current.get(key) ?? []).filter((t) => now - t < dedup.windowMs);
          if (hits.length >= dedup.maxPerKey) {
            store.addNotifyReceipt({
              channel: "bark",
              ok: false,
              title: `去重跳过 · ${a.source}`,
              message: `auto-push: 命中节流（窗口内已推送 ${hits.length} 次）`,
            });
            continue;
          }
          hits.push(now);
          dedupHits.current.set(key, hits);
        }
        const title = `TimeAmber 告警 · ${a.source}`;
        const body = `[${a.level.toUpperCase()}] ${a.message}`;
        for (const ch of channels) {
          try {
            await run({
              data: {
                channel: ch,
                title,
                body,
                bark: cfg.bark,
                telegram: cfg.telegram,
                smtp: cfg.smtp,
              },
            });
            store.addNotifyReceipt({ channel: ch, ok: true, title, message: "auto-push" });
          } catch (e) {
            store.addNotifyReceipt({
              channel: ch,
              ok: false,
              title,
              message: `auto-push: ${e instanceof Error ? e.message : "failed"}`,
            });
          }
        }
      }
    })();
  }, [store.alerts, store.cloud.notify, run, store]);
  return null;
}

function AdminLayout() {
  const matches = useRouterState({ select: (s) => s.matches });
  const last = matches[matches.length - 1];
  const titleMap: Record<string, string> = {
    "/_authenticated/admin/": "概览",
    "/_authenticated/admin/ask": "Ask TimeAmber",
    "/_authenticated/admin/posts/": "文章",
    "/_authenticated/admin/posts/new": "新建文章",
    "/_authenticated/admin/posts/$slug/edit": "编辑文章",
    "/_authenticated/admin/categories": "分类",
    "/_authenticated/admin/tags": "标签",
    "/_authenticated/admin/friends": "友链",
    "/_authenticated/admin/media": "媒体库",
    "/_authenticated/admin/analytics": "访客分析",
    "/_authenticated/admin/backup": "备份与同步",
    "/_authenticated/admin/ai": "AI 配置",
    "/_authenticated/admin/notifications": "通知设置",
    "/_authenticated/admin/diagnostics": "性能与日志",
    "/_authenticated/admin/settings": "站点设置",
  };
  const title = titleMap[last?.routeId ?? ""] ?? "后台";

  return (
    <SidebarProvider>
      <AlertAutoPush />
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border/70" />
            <nav className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">后台</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-display font-medium text-foreground">{title}</span>
            </nav>
          </header>
          <main className="flex-1 overflow-x-hidden bg-linear-to-b from-background to-muted/20 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
