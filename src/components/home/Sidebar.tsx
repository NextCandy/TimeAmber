import {
  Mail,
  TrendingUp,
  Send,
  MessageCircle,
  MessageSquare,
  Twitter,
  Github,
  Heart,
  Music2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useAdminStore } from "@/lib/admin-store";
import { loadPublicVisitTrend, type VisitTrendPoint } from "@/lib/state.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ContactItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  copy?: string;
  qr?: string;
};

// 骨架柱的高度：写死而不是随机，否则 SSR 与客户端两次渲染不一致会触发 hydration mismatch。
const SKELETON_BARS = [38, 62, 48, 78, 54, 68, 44];

export function Sidebar({
  initialTrend = [],
}: {
  /** 由首页 loader 在服务端取好，保证访问趋势首屏直出而不是等客户端异步填充。 */
  initialTrend?: VisitTrendPoint[];
}) {
  const { categories, posts, settings, recordContactClick } = useAdminStore();
  const [trend, setTrend] = useState<VisitTrendPoint[]>(initialTrend);
  const [trendLoading, setTrendLoading] = useState(initialTrend.length === 0);
  const [qr, setQr] = useState<ContactItem | null>(null);
  const catCounts = new Map<string, number>();
  for (const p of posts) {
    catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  }

  useEffect(() => {
    let active = true;
    async function refreshTrend() {
      try {
        const next = await loadPublicVisitTrend();
        if (active) setTrend(next);
      } catch {
        // Keep the last successful result during a transient refresh failure.
      } finally {
        if (active) setTrendLoading(false);
      }
    }

    void refreshTrend();
    const interval = window.setInterval(refreshTrend, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const hasTrend = trend.length > 0;
  const max = Math.max(...trend.map((d) => d.count), 1);
  const total7d = trend.reduce((a, b) => a + b.count, 0);

  const qrFlags = settings.contactQR ?? {};
  const contacts: ContactItem[] = [];
  if (settings.contactEmail)
    contacts.push({
      key: "email",
      icon: Mail,
      label: "Email",
      href: `mailto:${settings.contactEmail}`,
    });
  if (settings.contactTelegram)
    contacts.push({
      key: "tg",
      icon: Send,
      label: "Telegram",
      href: settings.contactTelegram.startsWith("http")
        ? settings.contactTelegram
        : `https://t.me/${settings.contactTelegram.replace(/^@/, "")}`,
    });
  if (settings.contactX || settings.contactTwitter)
    contacts.push({
      key: "x",
      icon: Twitter,
      label: "X",
      href: settings.contactX || settings.contactTwitter,
    });
  if (settings.contactGithub)
    contacts.push({
      key: "gh",
      icon: Github,
      label: "GitHub",
      href: settings.contactGithub,
    });
  if (settings.contactWechat) {
    const v = settings.contactWechat;
    contacts.push(
      qrFlags.wechat
        ? { key: "wx", icon: MessageCircle, label: "WeChat", qr: v }
        : { key: "wx", icon: MessageCircle, label: "WeChat", copy: v },
    );
  }
  if (settings.contactQQ) {
    const v = settings.contactQQ;
    contacts.push(
      qrFlags.qq
        ? { key: "qq", icon: MessageSquare, label: "QQ", qr: v }
        : { key: "qq", icon: MessageSquare, label: "QQ", copy: v },
    );
  }
  if (settings.contactXiaohongshu) {
    const v = settings.contactXiaohongshu;
    const isUrl = /^https?:\/\//.test(v);
    contacts.push(
      qrFlags.xiaohongshu
        ? { key: "xhs", icon: Heart, label: "小红书", qr: v }
        : isUrl
          ? { key: "xhs", icon: Heart, label: "小红书", href: v }
          : { key: "xhs", icon: Heart, label: "小红书", copy: v },
    );
  }
  if (settings.contactDouyin) {
    const v = settings.contactDouyin;
    const isUrl = /^https?:\/\//.test(v);
    contacts.push(
      qrFlags.douyin
        ? { key: "dy", icon: Music2, label: "抖音", qr: v }
        : isUrl
          ? { key: "dy", icon: Music2, label: "抖音", href: v }
          : { key: "dy", icon: Music2, label: "抖音", copy: v },
    );
  }

  // 点击/复制埋点去重 + 节流：同一渠道在窗口期内仅上报一次，避免重复刷数据
  const TRACK_WINDOW_MS = 1500;
  const lastFireRef = useRef<Map<string, number>>(new Map());
  const dedupedRef = useRef<Map<string, number>>(new Map());

  function tryTrack(key: string): { tracked: boolean; suppressed: number } {
    const now = Date.now();
    const last = lastFireRef.current.get(key) ?? 0;
    if (now - last < TRACK_WINDOW_MS) {
      dedupedRef.current.set(key, (dedupedRef.current.get(key) ?? 0) + 1);
      return { tracked: false, suppressed: dedupedRef.current.get(key)! };
    }
    lastFireRef.current.set(key, now);
    dedupedRef.current.set(key, 0);
    recordContactClick(key);
    return { tracked: true, suppressed: 0 };
  }

  function onCopy(v: string, label: string, key: string) {
    const t = tryTrack(key);
    navigator.clipboard
      .writeText(v)
      .then(() => {
        if (t.tracked) toast.success(`已复制 ${label}：${v}`);
        else
          toast(`已复制 ${label}（短时间内重复点击未上报）`, {
            duration: 1200,
          });
      })
      .catch(() => toast.error(`复制失败，请手动复制：${v}`));
  }

  function onLinkClick(item: ContactItem) {
    const t = tryTrack(item.key);
    if (t.tracked) toast.success(`正在打开 ${item.label}`);
  }

  function onQR(item: ContactItem, trigger: HTMLElement | null) {
    qrTriggerRef.current = trigger;
    tryTrack(item.key);
    setQr(item);
  }

  const qrTriggerRef = useRef<HTMLElement | null>(null);

  const baseBtn =
    "inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <aside className="min-w-0 flex flex-col gap-5">
      {/* Author card */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary-glow font-display text-lg font-bold text-primary-foreground">
            T
          </span>
          <div>
            <p className="font-semibold">TA</p>
            <p className="text-xs text-muted-foreground">Owner</p>
          </div>
        </div>
        <p className="relative mt-4 text-sm text-muted-foreground">仓鼠症</p>

        {contacts.length > 0 && (
          <nav className="relative mt-4 border-t border-border/60 pt-3" aria-label="联系方式">
            <ul className="flex flex-wrap gap-2">
              {contacts.map((c) => {
                const Icon = c.icon;
                if (c.href) {
                  const external = c.href.startsWith("http");
                  return (
                    <li key={c.key}>
                      <a
                        href={c.href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className={baseBtn}
                        aria-label={`${c.label}（在${external ? "新窗口" : "本窗口"}打开）`}
                        title={c.label}
                        onClick={() => onLinkClick(c)}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </li>
                  );
                }
                if (c.qr) {
                  return (
                    <li key={c.key}>
                      <button
                        type="button"
                        className={baseBtn}
                        onClick={(e) => onQR(c, e.currentTarget)}
                        aria-label={`${c.label}（点击显示二维码）`}
                        title={`${c.label}（点击显示二维码）`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      className={baseBtn}
                      onClick={() => onCopy(c.copy!, c.label, c.key)}
                      aria-label={`${c.label}（点击复制 ${c.copy}）`}
                      title={`${c.label}（点击复制）`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>

      {/* Visitor trend */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-3.5 w-3.5 text-primary" /> 近 7 天访问
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {hasTrend ? total7d : "—"}
          </span>
        </div>

        <div className="flex h-16 items-end gap-1">
          {hasTrend
            ? trend.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t bg-linear-to-t from-primary/70 to-primary/20"
                  style={{
                    height: d.count > 0 ? `${Math.max((d.count / max) * 100, 4)}%` : "2px",
                  }}
                  title={`${d.date}: ${d.count} PV`}
                />
              ))
            : // 取数失败或仍在加载：给骨架，别留一片空白。
              SKELETON_BARS.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t bg-muted ${trendLoading ? "animate-pulse" : "opacity-40"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
        </div>

        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          {hasTrend ? (
            <>
              <span>{trend[0].date.slice(5)}</span>
              <span>{trend[trend.length - 1].date.slice(5)}</span>
            </>
          ) : (
            <span>{trendLoading ? "正在读取访问数据…" : "暂无访问数据"}</span>
          )}
        </div>

        {hasTrend && total7d === 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">近 7 天暂无访问记录</p>
        )}
      </div>

      {/* Categories */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">分类</p>
          <span className="text-xs text-muted-foreground">{categories.length}</span>
        </div>
        <ul className="flex flex-col gap-1">
          {categories.map((c) => (
            <li
              key={c.name}
              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span>{c.name}</span>
              <span className="text-xs tabular-nums opacity-60">{catCounts.get(c.name) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      <Dialog
        open={!!qr}
        onOpenChange={(o) => {
          if (!o) setQr(null);
        }}
      >
        <DialogContent
          className="sm:max-w-xs"
          role="dialog"
          aria-modal="true"
          onCloseAutoFocus={(e) => {
            // 返回焦点到触发按钮（桌面/移动键盘均可）
            const t = qrTriggerRef.current;
            if (t) {
              e.preventDefault();
              t.focus();
            }
          }}
          onEscapeKeyDown={() => setQr(null)}
        >
          <DialogHeader>
            <DialogTitle>{qr?.label} 二维码</DialogTitle>
            <DialogDescription className="break-all text-xs">{qr?.qr}</DialogDescription>
          </DialogHeader>
          {qr?.qr && (
            <div
              className="flex justify-center rounded-lg bg-white p-4"
              aria-label={`${qr.label} 二维码图像`}
            >
              <QRCodeSVG value={qr.qr} size={200} level="M" />
            </div>
          )}
          {qr?.qr && (
            <button
              type="button"
              className="mt-2 inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => {
                navigator.clipboard.writeText(qr.qr!).then(() => toast.success("已复制"));
              }}
            >
              复制内容
            </button>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
