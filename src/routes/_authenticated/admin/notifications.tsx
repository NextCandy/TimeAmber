import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  Send,
  Save,
  Loader2,
  Mail,
  Smartphone,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Download,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminStore, type NotifyConfig } from "@/lib/admin-store";
import { sendNotify } from "@/lib/notify.functions";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const store = useAdminStore();
  const [cfg, setCfg] = useState<NotifyConfig>(store.cloud.notify ?? {});
  const [busy, setBusy] = useState<"bark" | "telegram" | "smtp" | null>(null);
  const [filterCh, setFilterCh] = useState<"all" | "bark" | "telegram" | "smtp">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "ok" | "fail">("all");
  const [filterQ, setFilterQ] = useState("");
  const runNotify = useServerFn(sendNotify);

  useEffect(() => setCfg(store.cloud.notify ?? {}), [store.cloud.notify]);

  const filteredReceipts = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    return store.notifyReceipts.filter((r) => {
      if (filterCh !== "all" && r.channel !== filterCh) return false;
      if (filterStatus === "ok" && !r.ok) return false;
      if (filterStatus === "fail" && r.ok) return false;
      if (q && !(r.title.toLowerCase().includes(q) || (r.message ?? "").toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [store.notifyReceipts, filterCh, filterStatus, filterQ]);

  const stats = useMemo(() => {
    const channels: ("bark" | "telegram" | "smtp")[] = ["bark", "telegram", "smtp"];
    const result = channels.map((ch) => {
      const list = store.notifyReceipts.filter((r) => r.channel === ch);
      const ok = list.filter((r) => r.ok).length;
      return { channel: ch, total: list.length, ok, fail: list.length - ok };
    });
    const total = store.notifyReceipts.length;
    const okTotal = store.notifyReceipts.filter((r) => r.ok).length;
    return { byChannel: result, total, okTotal, failTotal: total - okTotal };
  }, [store.notifyReceipts]);

  function exportReceiptsCsv() {
    const rows = [
      ["时间", "通道", "状态", "标题", "消息"],
      ...filteredReceipts.map((r) => [
        r.at,
        r.channel,
        r.ok ? "ok" : "fail",
        r.title,
        (r.message ?? "").replace(/\r?\n/g, " "),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeamber-notify-receipts-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function save() {
    store.updateCloud({ notify: cfg });
    toast.success("通知配置已保存");
  }

  async function test(channel: "bark" | "telegram" | "smtp") {
    save();
    setBusy(channel);
    const title = "TimeAmber 测试通知";
    const body = `这是一条来自后台的测试消息 · ${new Date().toLocaleString("zh-CN")}`;
    try {
      const res = await runNotify({
        data: { channel, title, body, bark: cfg.bark, telegram: cfg.telegram, smtp: cfg.smtp },
      });
      store.addNotifyReceipt({ channel, ok: true, title, message: `via ${res.via}` });
      toast.success(`已发送测试通知（${res.via}）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败";
      store.addNotifyReceipt({ channel, ok: false, title, message: msg });
      store.addAlert({ level: "warning", source: `notify/${channel}`, message: `测试失败：${msg}` });
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  async function pushAllUnacked() {
    const pending = store.alerts.filter((a) => !a.acknowledged);
    if (pending.length === 0) {
      toast.info("没有未确认的告警");
      return;
    }
    const body = pending
      .slice(0, 10)
      .map((a) => `[${a.level.toUpperCase()}] ${a.source}: ${a.message}`)
      .join("\n");
    const enabled: ("bark" | "telegram" | "smtp")[] = [];
    if (cfg.bark?.enabled && cfg.bark.key) enabled.push("bark");
    if (cfg.telegram?.enabled && cfg.telegram.botToken && cfg.telegram.chatId)
      enabled.push("telegram");
    if (cfg.smtp?.enabled && cfg.smtp.webhookUrl) enabled.push("smtp");
    if (enabled.length === 0) {
      toast.error("没有已启用并配置完整的通道");
      return;
    }
    setBusy("bark");
    try {
      for (const ch of enabled) {
        const title = `TimeAmber 告警 · ${pending.length} 条`;
        try {
          const res = await runNotify({
            data: { channel: ch, title, body, bark: cfg.bark, telegram: cfg.telegram, smtp: cfg.smtp },
          });
          store.addNotifyReceipt({ channel: ch, ok: true, title, message: `推送 ${pending.length} 条 · ${res.via}` });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "发送失败";
          store.addNotifyReceipt({ channel: ch, ok: false, title, message: msg });
          console.error(ch, e);
        }
      }
      toast.success(`已通过 ${enabled.length} 个通道推送`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">通知设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            配置 SMTP / Bark / Telegram，备份失败、计划任务异常等会通过启用的通道告警。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={pushAllUnacked} disabled={busy !== null}>
            <Bell className="mr-1.5 h-4 w-4" /> 推送未确认告警
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="mr-1.5 h-4 w-4" /> 保存
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">自动推送告警</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              开启后，新写入的告警会通过所有已启用的通道自动发送。
            </p>
          </div>
          <Switch
            checked={cfg.autoPush ?? false}
            onCheckedChange={(v) => setCfg({ ...cfg, autoPush: v })}
          />
        </div>
        {cfg.autoPush && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>触发级别</Label>
              <Select
                value={cfg.autoPushLevel ?? "error"}
                onValueChange={(v) =>
                  setCfg({ ...cfg, autoPushLevel: v as "error" | "warning" })
                }
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="error">仅 error</SelectItem>
                  <SelectItem value="warning">warning 及以上</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </section>

      {/* 去重 & 节流 */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">告警去重与节流</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              用「来源 + 错误」组合作为去重键；同 key 在窗口内超过最大次数时跳过推送。
            </p>
          </div>
          <Switch
            checked={cfg.dedup?.enabled ?? false}
            onCheckedChange={(v) =>
              setCfg({ ...cfg, dedup: { ...(cfg.dedup ?? {}), enabled: v } })
            }
          />
        </div>
        {cfg.dedup?.enabled && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>节流窗口（秒）</Label>
              <Input
                type="number"
                min={10}
                max={86400}
                value={cfg.dedup?.windowSec ?? 600}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    dedup: { ...(cfg.dedup ?? {}), windowSec: Number(e.target.value) || 600 },
                  })
                }
                className="mt-1.5"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">默认 600 秒（10 分钟）</p>
            </div>
            <div>
              <Label>窗口内最大推送次数</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={cfg.dedup?.maxPerKey ?? 1}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    dedup: { ...(cfg.dedup ?? {}), maxPerKey: Number(e.target.value) || 1 },
                  })
                }
                className="mt-1.5"
              />
            </div>
          </div>
        )}
      </section>

      {/* Bark */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Bark（iOS 推送）</h2>
          </div>
          <Switch
            checked={cfg.bark?.enabled ?? false}
            onCheckedChange={(v) =>
              setCfg({ ...cfg, bark: { key: "", ...(cfg.bark ?? {}), enabled: v } })
            }
          />
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>API 端点（可选，默认官方）</Label>
            <Input
              value={cfg.bark?.endpoint ?? ""}
              placeholder="https://api.day.app"
              onChange={(e) =>
                setCfg({ ...cfg, bark: { key: "", ...(cfg.bark ?? {}), endpoint: e.target.value } })
              }
              className="mt-1.5 font-mono text-sm"
              maxLength={300}
            />
          </div>
          <div>
            <Label>Device Key</Label>
            <Input
              type="password"
              value={cfg.bark?.key ?? ""}
              onChange={(e) =>
                setCfg({ ...cfg, bark: { ...(cfg.bark ?? { enabled: false }), key: e.target.value } })
              }
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>分组</Label>
              <Input
                value={cfg.bark?.group ?? ""}
                onChange={(e) =>
                  setCfg({ ...cfg, bark: { key: "", ...(cfg.bark ?? {}), group: e.target.value } })
                }
                className="mt-1.5"
                maxLength={60}
              />
            </div>
            <div>
              <Label>提示音</Label>
              <Input
                value={cfg.bark?.sound ?? ""}
                onChange={(e) =>
                  setCfg({ ...cfg, bark: { key: "", ...(cfg.bark ?? {}), sound: e.target.value } })
                }
                placeholder="alarm"
                className="mt-1.5"
                maxLength={40}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => test("bark")}>
            {busy === "bark" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发送测试
          </Button>
        </div>
      </section>

      {/* Telegram */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Telegram Bot</h2>
          </div>
          <Switch
            checked={cfg.telegram?.enabled ?? false}
            onCheckedChange={(v) =>
              setCfg({
                ...cfg,
                telegram: { botToken: "", chatId: "", ...(cfg.telegram ?? {}), enabled: v },
              })
            }
          />
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Bot Token</Label>
            <Input
              type="password"
              value={cfg.telegram?.botToken ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  telegram: {
                    ...(cfg.telegram ?? { enabled: false }),
                    chatId: cfg.telegram?.chatId ?? "",
                    botToken: e.target.value,
                  },
                })
              }
              className="mt-1.5 font-mono text-sm"
              placeholder="123456:ABC-DEF..."
              maxLength={200}
            />
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input
              value={cfg.telegram?.chatId ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  telegram: {
                    ...(cfg.telegram ?? { enabled: false }),
                    botToken: cfg.telegram?.botToken ?? "",
                    chatId: e.target.value,
                  },
                })
              }
              className="mt-1.5 font-mono text-sm"
              placeholder="-1001234567890"
              maxLength={60}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          向 @BotFather 申请 Bot，把 Bot 拉入群组后用 getUpdates 获取 chatId。
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => test("telegram")}
          >
            {busy === "telegram" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发送测试
          </Button>
        </div>
      </section>

      {/* SMTP */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">SMTP（邮件）</h2>
          </div>
          <Switch
            checked={cfg.smtp?.enabled ?? false}
            onCheckedChange={(v) =>
              setCfg({
                ...cfg,
                smtp: {
                  webhookUrl: "",
                  from: "",
                  to: "",
                  ...(cfg.smtp ?? {}),
                  enabled: v,
                },
              })
            }
          />
        </header>
        <p className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning-foreground">
          因边缘运行时限制，SMTP 通过 Webhook 中转执行。请填写一个可访问的 webhook URL
          （例如自建的 smtp-relay）；下方 host/port/账号会作为 JSON 负载 POST 给该 URL。
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Webhook URL</Label>
            <Input
              value={cfg.smtp?.webhookUrl ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    webhookUrl: e.target.value,
                  },
                })
              }
              className="mt-1.5 font-mono text-sm"
              placeholder="https://your-relay.example.com/send"
              maxLength={500}
            />
          </div>
          <div>
            <Label>SMTP Host</Label>
            <Input
              value={cfg.smtp?.host ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    host: e.target.value,
                  },
                })
              }
              className="mt-1.5"
              placeholder="smtp.example.com"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Port</Label>
            <Input
              type="number"
              value={cfg.smtp?.port ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    port: Number(e.target.value) || undefined,
                  },
                })
              }
              className="mt-1.5"
              placeholder="465"
            />
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={cfg.smtp?.username ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    username: e.target.value,
                  },
                })
              }
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={cfg.smtp?.password ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    password: e.target.value,
                  },
                })
              }
              className="mt-1.5"
              maxLength={500}
            />
          </div>
          <div>
            <Label>发件人</Label>
            <Input
              type="email"
              value={cfg.smtp?.from ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    to: cfg.smtp?.to ?? "",
                    from: e.target.value,
                  },
                })
              }
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div>
            <Label>收件人</Label>
            <Input
              type="email"
              value={cfg.smtp?.to ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: e.target.value,
                  },
                })
              }
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Webhook Secret（可选，写入 X-Notify-Secret）</Label>
            <Textarea
              value={cfg.smtp?.secret ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  smtp: {
                    ...(cfg.smtp ?? { enabled: false }),
                    webhookUrl: cfg.smtp?.webhookUrl ?? "",
                    from: cfg.smtp?.from ?? "",
                    to: cfg.smtp?.to ?? "",
                    secret: e.target.value,
                  },
                })
              }
              rows={2}
              className="mt-1.5 font-mono text-xs"
              maxLength={200}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => test("smtp")}>
            {busy === "smtp" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发送测试
          </Button>
        </div>
      </section>

      {/* 通知回执 */}
      <section className="rounded-xl border border-border/70 bg-card/40 p-5">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">通知回执（最近 100 条）</h2>
            <span className="text-xs text-muted-foreground">共 {store.notifyReceipts.length}</span>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={filteredReceipts.length === 0}
              onClick={exportReceiptsCsv}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> 导出 CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={store.notifyReceipts.length === 0}
              onClick={() => {
                store.clearNotifyReceipts();
                toast.success("已清空回执");
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 清空
            </Button>
          </div>
        </header>

        {/* Summary stats */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-border/60 bg-background/40 p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">总计</p>
            <p className="font-display text-lg font-semibold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">
              <span className="text-primary">{stats.okTotal}</span> 成功 ·{" "}
              <span className="text-destructive">{stats.failTotal}</span> 失败
            </p>
          </div>
          {stats.byChannel.map((s) => (
            <div key={s.channel} className="rounded-md border border-border/60 bg-background/40 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.channel}</p>
              <p className="font-display text-lg font-semibold">{s.total}</p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-primary">{s.ok}</span> /{" "}
                <span className="text-destructive">{s.fail}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterCh} onValueChange={(v) => setFilterCh(v as typeof filterCh)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部通道</SelectItem>
              <SelectItem value="bark">Bark</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="smtp">SMTP</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="ok">成功</SelectItem>
              <SelectItem value="fail">失败</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder="按标题/消息搜索…"
            className="h-8 w-56 text-xs"
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            筛选后 {filteredReceipts.length} / {store.notifyReceipts.length}
          </span>
        </div>
        {filteredReceipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">没有匹配的发送记录。</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto text-sm">
            {filteredReceipts.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.channel}
                    </span>
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(r.at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  {r.message && (
                    <p
                      className={`mt-0.5 truncate text-xs ${
                        r.ok ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      {r.message}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
