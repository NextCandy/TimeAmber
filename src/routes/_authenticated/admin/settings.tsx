import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Save,
  RotateCcw,
  Info,
  AtSign,
  Settings as SettingsIcon,
  Mail,
  Github,
  Send,
  Twitter,
  MessageCircle,
  MessageSquare,
  Heart,
  Music2,
  QrCode,
  AlertCircle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { useAdminStore, type SiteSettings } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

type ContactFieldConfig = {
  key: string;
  field: keyof SiteSettings;
  label: string;
  icon: LucideIcon;
  placeholder: string;
  /** 'url' 必须填 URL；'urlOrHandle' 允许 @用户名 或链接；'text' 文本（如 QQ/微信号）；'email' 邮件 */
  validate: "url" | "urlOrHandle" | "text" | "email";
  /** 是否支持二维码弹层切换 */
  qrSupported?: boolean;
  /** 二维码键名（写入 settings.contactQR） */
  qrKey?: string;
};

const CONTACT_FIELDS: ContactFieldConfig[] = [
  {
    key: "email",
    field: "contactEmail",
    label: "邮箱",
    icon: Mail,
    placeholder: "hi@example.com",
    validate: "email",
  },
  {
    key: "github",
    field: "contactGithub",
    label: "GitHub",
    icon: Github,
    placeholder: "https://github.com/yourname",
    validate: "url",
  },
  {
    key: "x",
    field: "contactX",
    label: "Twitter / X",
    icon: Twitter,
    placeholder: "https://x.com/yourname",
    validate: "url",
  },
  {
    key: "tg",
    field: "contactTelegram",
    label: "Telegram",
    icon: Send,
    placeholder: "@yourname 或 https://t.me/yourname",
    validate: "urlOrHandle",
  },
  {
    key: "wechat",
    field: "contactWechat",
    label: "微信",
    icon: MessageCircle,
    placeholder: "微信号或二维码内容",
    validate: "text",
    qrSupported: true,
    qrKey: "wechat",
  },
  {
    key: "qq",
    field: "contactQQ",
    label: "QQ",
    icon: MessageSquare,
    placeholder: "QQ 号或二维码内容",
    validate: "text",
    qrSupported: true,
    qrKey: "qq",
  },
  {
    key: "xhs",
    field: "contactXiaohongshu",
    label: "小红书",
    icon: Heart,
    placeholder: "主页链接或二维码内容",
    validate: "text",
    qrSupported: true,
    qrKey: "xiaohongshu",
  },
  {
    key: "douyin",
    field: "contactDouyin",
    label: "抖音",
    icon: Music2,
    placeholder: "主页链接或二维码内容",
    validate: "text",
    qrSupported: true,
    qrKey: "douyin",
  },
];

function validateContact(value: string, type: ContactFieldConfig["validate"]): string | null {
  if (!value) return null;
  if (type === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "邮箱格式不正确";
  }
  if (type === "url") {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:" ? null : "必须以 http(s):// 开头";
    } catch {
      return "URL 格式不正确";
    }
  }
  if (type === "urlOrHandle") {
    if (value.startsWith("http")) {
      try {
        new URL(value);
        return null;
      } catch {
        return "链接格式不正确";
      }
    }
    return /^@?[a-zA-Z0-9_]{3,}$/.test(value) ? null : "用户名格式不正确";
  }
  return null;
}

function SettingsPage() {
  const { settings, updateSettings, resetAll } = useAdminStore();
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  const contactErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const f of CONTACT_FIELDS) {
      const err = validateContact((draft[f.field] as string) ?? "", f.validate);
      if (err) errs[f.key] = err;
    }
    return errs;
  }, [draft]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(contactErrors).length > 0) {
      toast.error("联系方式存在格式错误，请修正后再保存");
      return;
    }
    updateSettings(draft);
    toast.success("已保存");
  }

  function setQR(qrKey: string, on: boolean) {
    setDraft({ ...draft, contactQR: { ...(draft.contactQR ?? {}), [qrKey]: on } });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold">站点设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          这些字段会显示在前台 Hero、关于页与页脚（演示效果，仅本地存储）。
        </p>
      </header>

      <form onSubmit={save} className="space-y-8">
        {/* 基础信息 */}
        <section className="rounded-xl border border-border/70 bg-card/40 p-6">
          <div className="mb-4 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">基础信息</h2>
          </div>
          <div className="space-y-5">
            <div>
              <Label htmlFor="siteTitle">站点标题</Label>
              <Input
                id="siteTitle"
                value={draft.siteTitle}
                onChange={(e) => setDraft({ ...draft, siteTitle: e.target.value })}
                className="mt-1.5"
                maxLength={80}
                required
              />
            </div>
            <div>
              <Label htmlFor="siteTagline">副标题</Label>
              <Input
                id="siteTagline"
                value={draft.siteTagline}
                onChange={(e) => setDraft({ ...draft, siteTagline: e.target.value })}
                className="mt-1.5"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="siteDescription">描述</Label>
              <Textarea
                id="siteDescription"
                value={draft.siteDescription}
                onChange={(e) => setDraft({ ...draft, siteDescription: e.target.value })}
                className="mt-1.5"
                maxLength={300}
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* 关于页 */}
        <section className="rounded-xl border border-border/70 bg-card/40 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">关于页内容</h2>
          </div>
          <div className="space-y-5">
            <div>
              <Label htmlFor="aboutIntro">简介正文</Label>
              <Textarea
                id="aboutIntro"
                value={draft.aboutIntro}
                onChange={(e) => setDraft({ ...draft, aboutIntro: e.target.value })}
                className="mt-1.5"
                rows={5}
                maxLength={2000}
                placeholder="支持空行分段"
              />
              <p className="mt-1 text-xs text-muted-foreground">用空行分隔段落。</p>
            </div>
            <div>
              <Label htmlFor="aboutQuote">高亮引言（可选）</Label>
              <Input
                id="aboutQuote"
                value={draft.aboutQuote}
                onChange={(e) => setDraft({ ...draft, aboutQuote: e.target.value })}
                className="mt-1.5"
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="aboutTechStack">技术栈（每行一条）</Label>
              <Textarea
                id="aboutTechStack"
                value={draft.aboutTechStack}
                onChange={(e) => setDraft({ ...draft, aboutTechStack: e.target.value })}
                className="mt-1.5 font-mono text-sm"
                rows={5}
                maxLength={1000}
              />
            </div>
          </div>
        </section>

        {/* 联系方式 */}
        <section className="rounded-xl border border-border/70 bg-card/40 p-6">
          <div className="mb-4 flex items-center gap-2">
            <AtSign className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">联系方式</h2>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {CONTACT_FIELDS.map((f) => {
                const Icon = f.icon;
                const value = (draft[f.field] as string) ?? "";
                const err = contactErrors[f.key];
                const qrOn = f.qrKey ? !!draft.contactQR?.[f.qrKey] : false;
                const inputId = `field-${f.key}`;
                return (
                  <div key={f.key}>
                    <Label htmlFor={inputId} className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span>{f.label}</span>
                      {value && !err && (
                        <CheckCircle2 className="h-3 w-3 text-success" aria-label="格式有效" />
                      )}
                    </Label>
                    <Input
                      id={inputId}
                      type={f.validate === "email" ? "email" : "text"}
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (f.field === "contactX") {
                          setDraft({ ...draft, contactX: v, contactTwitter: v });
                        } else {
                          setDraft({ ...draft, [f.field]: v } as SiteSettings);
                        }
                      }}
                      className="mt-1.5"
                      maxLength={300}
                      placeholder={f.placeholder}
                      aria-invalid={!!err}
                      aria-describedby={err ? `${inputId}-err` : undefined}
                    />
                    {err && (
                      <p
                        id={`${inputId}-err`}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-destructive"
                      >
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        {err}
                      </p>
                    )}
                    {!value && (
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        留空则前台不显示该图标
                      </p>
                    )}
                    {f.qrSupported && f.qrKey && value && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={qrOn}
                          onCheckedChange={(v) => setQR(f.qrKey!, v)}
                          aria-label={`${f.label} 显示二维码`}
                        />
                        <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                        点击图标时显示二维码（否则复制内容
                        {f.validate === "text" ? "" : " / 跳转链接"}）
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <Label htmlFor="contactNote">联系说明（显示在关于页底部）</Label>
              <Textarea
                id="contactNote"
                value={draft.contactNote}
                onChange={(e) => setDraft({ ...draft, contactNote: e.target.value })}
                className="mt-1.5"
                rows={2}
                maxLength={300}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-base font-semibold">前台功能</h2>
          <label className="mt-4 flex items-start gap-3">
            <Switch
              checked={draft.askPublicEnabled === true}
              onCheckedChange={(v) => setDraft({ ...draft, askPublicEnabled: v })}
              aria-label="开放站内问答到前台"
            />
            <span className="text-sm">
              开放站内问答到前台 <code className="text-xs text-muted-foreground">/ask</code>
              <span className="mt-1 block text-xs text-muted-foreground">
                开启后任何访客都能提问，<strong>每次提问都会消耗你配置的 AI_API_KEY</strong>。
                已内置全站限流（每分钟 6 次、每天 300 次）作为成本上限。默认关闭。
              </span>
            </span>
          </label>
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button type="submit" size="lg" className="shadow-lg">
            <Save className="mr-1.5 h-4 w-4" />
            保存全部设置
          </Button>
        </div>
      </form>

      <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="font-display text-base font-semibold text-destructive">危险区</h2>
        <p className="mt-1 text-sm text-muted-foreground">重置会清空本地所有改动并恢复示例数据。</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              重置所有数据
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认重置所有数据？</AlertDialogTitle>
              <AlertDialogDescription>
                文章、分类、标签、友链、关于页与设置都会回到示例状态。这一步无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  resetAll();
                  toast.success("已重置");
                }}
              >
                重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
