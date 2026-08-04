import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Music2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore } from "@/lib/admin-store";
import { savePublicSiteSettings } from "@/lib/public-site-settings.functions";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  normalizePublicSiteConfig,
  PUBLIC_MODULE_IDS,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";

const cardClass =
  "rounded-2xl border border-border/70 bg-card/45 p-5 shadow-[0_18px_45px_-34px_color-mix(in_oklch,var(--foreground)_45%,transparent)] sm:p-6";
const fieldClass =
  "mt-1.5 w-full rounded-xl border border-input bg-background/45 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent-amber focus:ring-2 focus:ring-accent-amber/20";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className="mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{help}</p>}
    </div>
  );
}

function MediaField({
  label,
  value,
  onChange,
  media,
  help,
  idSuffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  media: Array<{ id: string; name: string; url: string }>;
  help?: string;
  idSuffix?: string;
}) {
  const listId = `media-${label.replace(/\W/g, "-")}-${idSuffix ?? "field"}`;
  return (
    <Field label={label} help={help}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          list={listId}
          className="mt-1.5"
          placeholder="/supabase/storage/... 或媒体 URL"
        />
        <a
          href="/admin/media"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:border-accent-amber/60 hover:text-accent-amber"
          title="打开媒体库"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          媒体库
        </a>
      </div>
      <datalist id={listId}>
        {media.map((item) => (
          <option key={item.id} value={item.url}>
            {item.name}
          </option>
        ))}
      </datalist>
    </Field>
  );
}

function LinesField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Textarea
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
        className={`${fieldClass} min-h-24`}
      />
    </Field>
  );
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, order) => ({ ...(item as object), order }) as T);
}

export function PublicSiteSettingsPanel() {
  const { settings, media, applySavedSettings } = useAdminStore();
  const [draft, setDraft] = useState<PublicSiteConfig>(() =>
    normalizePublicSiteConfig(settings.publicSite ?? settings),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setDraft(normalizePublicSiteConfig(settings.publicSite ?? settings));
  }, [settings]);

  const mark = useCallback(
    (next: PublicSiteConfig | ((current: PublicSiteConfig) => PublicSiteConfig)) => {
      dirtyRef.current = true;
      setDirty(true);
      setDraft(next);
    },
    [],
  );
  const setIdentity = (patch: Partial<PublicSiteConfig["identity"]>) =>
    mark((current) => ({ ...current, identity: { ...current.identity, ...patch } }));
  const setHomepage = (patch: Partial<PublicSiteConfig["homepage"]>) =>
    mark((current) => ({ ...current, homepage: { ...current.homepage, ...patch } }));
  const setAppearance = (patch: Partial<PublicSiteConfig["appearance"]>) =>
    mark((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
  const setStatus = (patch: Partial<PublicSiteConfig["statusMessages"]>) =>
    mark((current) => ({ ...current, statusMessages: { ...current.statusMessages, ...patch } }));
  const setFooter = (patch: Partial<PublicSiteConfig["footer"]>) =>
    mark((current) => ({ ...current, footer: { ...current.footer, ...patch } }));
  const setAbout = (patch: Partial<PublicSiteConfig["about"]>) =>
    mark((current) => ({ ...current, about: { ...current.about, ...patch } }));
  const updateMusicTrack = (
    id: string,
    patch: Partial<PublicSiteConfig["music"]["playlist"][number]>,
  ) =>
    mark((current) => ({
      ...current,
      music: {
        ...current.music,
        playlist: current.music.playlist.map((track) =>
          track.id === id ? { ...track, ...patch } : track,
        ),
      },
    }));

  const sortedNav = useMemo(
    () => [...draft.navigation.items].sort((a, b) => a.order - b.order),
    [draft.navigation.items],
  );
  const sortedSocial = useMemo(
    () => [...draft.socialLinks].sort((a, b) => a.order - b.order),
    [draft.socialLinks],
  );
  const sortedModules = useMemo(
    () => [...draft.modules].sort((a, b) => a.order - b.order),
    [draft.modules],
  );
  const sortedMusic = useMemo(
    () => [...draft.music.playlist].sort((a, b) => a.order - b.order),
    [draft.music.playlist],
  );

  async function save() {
    setSaving(true);
    try {
      const result = await savePublicSiteSettings({ data: { settings: draft } });
      applySavedSettings({ ...settings, publicSite: result.settings });
      dirtyRef.current = false;
      setDirty(false);
      toast.success("公开站点设置已保存，刷新前台即可生效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "公开站点设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!window.confirm("恢复公开站点默认配置？当前未保存内容会丢失。")) return;
    mark(structuredClone(DEFAULT_PUBLIC_SITE_CONFIG));
  }

  return (
    <div id="public-site-settings" className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-accent-amber/25 bg-accent-amber-soft/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs tracking-[0.18em] text-accent-amber uppercase">Public Site</p>
          <h1 className="mt-1 text-2xl font-semibold">公开站点</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            用结构化配置管理公开前台的品牌、背景、导航、首页模块和页脚。配置保存在服务端
            app_config.site JSONB 中，不需要重新构建镜像。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:border-accent-amber/60 hover:text-accent-amber"
          >
            <ExternalLink className="h-4 w-4" />
            预览首页
          </a>
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            恢复默认
          </Button>
        </div>
      </header>

      <Section
        title="基本信息"
        description="这些字段会同步到导航、首页资料卡、SEO 外壳和文章封面回退。"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="站点英文名称">
            <Input
              value={draft.identity.siteName}
              onChange={(e) => setIdentity({ siteName: e.target.value })}
              className={fieldClass}
              maxLength={80}
            />
          </Field>
          <Field label="站点中文名称">
            <Input
              value={draft.identity.siteNameZh}
              onChange={(e) => setIdentity({ siteNameZh: e.target.value })}
              className={fieldClass}
              maxLength={80}
            />
          </Field>
          <Field label="导航名称">
            <Input
              value={draft.identity.navTitle}
              onChange={(e) => setIdentity({ navTitle: e.target.value })}
              className={fieldClass}
              maxLength={80}
            />
          </Field>
          <Field label="标题连接字符">
            <Input
              value={draft.identity.navSuffix}
              onChange={(e) => setIdentity({ navSuffix: e.target.value })}
              className={fieldClass}
              maxLength={12}
            />
          </Field>
          <Field label="站点口号">
            <Input
              value={draft.identity.slogan}
              onChange={(e) => setIdentity({ slogan: e.target.value })}
              className={fieldClass}
              maxLength={160}
            />
          </Field>
          <Field label="站点简介">
            <Textarea
              value={draft.identity.description}
              onChange={(e) => setIdentity({ description: e.target.value })}
              className={`${fieldClass} min-h-24`}
              maxLength={500}
            />
          </Field>
          <MediaField
            label="头像"
            value={draft.identity.avatarUrl}
            onChange={(value) => setIdentity({ avatarUrl: value })}
            media={media}
          />
          <MediaField
            label="Logo"
            value={draft.identity.logoUrl}
            onChange={(value) => setIdentity({ logoUrl: value })}
            media={media}
          />
          <MediaField
            label="favicon"
            value={draft.identity.faviconUrl}
            onChange={(value) => setIdentity({ faviconUrl: value })}
            media={media}
          />
          <MediaField
            label="默认文章封面"
            value={draft.identity.defaultPostCoverUrl}
            onChange={(value) => setIdentity({ defaultPostCoverUrl: value })}
            media={media}
          />
        </div>
      </Section>

      <Section title="首页文字" description="首页所有个性化文案集中在这里，避免散落在组件常量中。">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="顶部小标题">
            <Input
              value={draft.homepage.eyebrow}
              onChange={(e) => setHomepage({ eyebrow: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="首页主标题">
            <Input
              value={draft.homepage.welcomeTitle}
              onChange={(e) => setHomepage({ welcomeTitle: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="首页说明">
            <Textarea
              value={draft.homepage.welcomeDescription}
              onChange={(e) => setHomepage({ welcomeDescription: e.target.value })}
              className={`${fieldClass} min-h-24`}
            />
          </Field>
          <Field label="搜索框占位文字">
            <Input
              value={draft.homepage.searchPlaceholder}
              onChange={(e) => setHomepage({ searchPlaceholder: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="最新文章标题">
            <Input
              value={draft.homepage.articleSectionTitle}
              onChange={(e) => setHomepage({ articleSectionTitle: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="最新文章副标题">
            <Input
              value={draft.homepage.articleSectionSubtitle}
              onChange={(e) => setHomepage({ articleSectionSubtitle: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="归档按钮文字">
            <Input
              value={draft.homepage.archiveButtonText}
              onChange={(e) => setHomepage({ archiveButtonText: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="统计 / 日历 / 分类 / 标签标题">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={draft.homepage.statsTitle}
                onChange={(e) => setHomepage({ statsTitle: e.target.value })}
                className={fieldClass}
                placeholder="统计"
              />
              <Input
                value={draft.homepage.calendarTitle}
                onChange={(e) => setHomepage({ calendarTitle: e.target.value })}
                className={fieldClass}
                placeholder="日历"
              />
              <Input
                value={draft.homepage.categoryTitle}
                onChange={(e) => setHomepage({ categoryTitle: e.target.value })}
                className={fieldClass}
                placeholder="分类"
              />
              <Input
                value={draft.homepage.tagTitle}
                onChange={(e) => setHomepage({ tagTitle: e.target.value })}
                className={fieldClass}
                placeholder="标签"
              />
            </div>
          </Field>
          <Field label="友链入口标题">
            <Input
              value={draft.homepage.friendsTitle}
              onChange={(e) => setHomepage({ friendsTitle: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="友链入口说明">
            <Input
              value={draft.homepage.friendsDescription}
              onChange={(e) => setHomepage({ friendsDescription: e.target.value })}
              className={fieldClass}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="背景与外观"
        description="背景图片请先通过媒体库上传或选择；只保存同源媒体路径或安全的 http(s) 地址。移动端和 reduced motion 会自动降低效果。"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="背景模式">
            <select
              value={draft.appearance.backgroundMode}
              onChange={(e) =>
                setAppearance({ backgroundMode: e.target.value as "image" | "gradient" })
              }
              className={fieldClass}
            >
              <option value="gradient">渐变背景</option>
              <option value="image">图片背景</option>
            </select>
          </Field>
          <Field label="轮播间隔（秒）">
            <Input
              type="number"
              min={12}
              max={3600}
              value={draft.appearance.backgroundIntervalSeconds}
              onChange={(e) => setAppearance({ backgroundIntervalSeconds: Number(e.target.value) })}
              className={fieldClass}
            />
          </Field>
          <LinesField
            label="亮色背景图片（每行一张）"
            value={draft.appearance.lightBackgroundImages}
            onChange={(value) => setAppearance({ lightBackgroundImages: value })}
            help="留空时使用亮色渐变。"
          />
          <LinesField
            label="暗色背景图片（每行一张）"
            value={draft.appearance.darkBackgroundImages}
            onChange={(value) => setAppearance({ darkBackgroundImages: value })}
            help="留空时使用暗色渐变。"
          />
          <LinesField
            label="亮色渐变颜色（每行或逗号分隔）"
            value={draft.appearance.lightGradientColors}
            onChange={(value) => setAppearance({ lightGradientColors: value })}
          />
          <LinesField
            label="暗色渐变颜色（每行或逗号分隔）"
            value={draft.appearance.darkGradientColors}
            onChange={(value) => setAppearance({ darkGradientColors: value })}
          />
          <Field label="背景遮罩透明度">
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.02}
              value={draft.appearance.backgroundOverlayOpacity}
              onChange={(e) => setAppearance({ backgroundOverlayOpacity: Number(e.target.value) })}
              className="mt-3 w-full accent-[var(--accent-amber)]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(draft.appearance.backgroundOverlayOpacity * 100)}%
            </p>
          </Field>
          <Field label="玻璃模糊强度">
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={draft.appearance.glassBlurStrength}
              onChange={(e) => setAppearance({ glassBlurStrength: Number(e.target.value) })}
              className="mt-3 w-full accent-[var(--accent-amber)]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {draft.appearance.glassBlurStrength}px
            </p>
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.appearance.autoRotate}
              onCheckedChange={(value) => setAppearance({ autoRotate: value })}
            />
            自动轮播背景
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.statusMessages.enabled}
              onCheckedChange={(value) => setStatus({ enabled: value })}
            />
            显示背景状态文字
          </label>
        </div>
      </Section>

      <Section
        title="背景状态文字"
        description="每行一条，服务端限制数量和长度；前台装饰层不参与读屏。"
      >
        <LinesField
          label="文案"
          value={draft.statusMessages.messages}
          onChange={(value) => setStatus({ messages: value.slice(0, 12) })}
        />
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="密度">
            <select
              value={draft.statusMessages.density}
              onChange={(e) => setStatus({ density: e.target.value as "low" | "medium" })}
              className={fieldClass}
            >
              <option value="low">低密度</option>
              <option value="medium">中密度</option>
            </select>
          </Field>
          <Field label="动画速度">
            <select
              value={draft.statusMessages.animationSpeed}
              onChange={(e) => setStatus({ animationSpeed: e.target.value as "slow" | "normal" })}
              className={fieldClass}
            >
              <option value="slow">慢</option>
              <option value="normal">正常</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="导航管理"
        description="站内路径使用真实路由；外链只允许 http(s)。隐藏导航不会影响直接 URL 访问后台。"
      >
        <div className="space-y-3">
          {sortedNav.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border/60 bg-background/20 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_0.7fr_auto] md:items-end">
                <Field label="名称">
                  <Input
                    value={item.label}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.map((entry) =>
                            entry.id === item.id ? { ...entry, label: e.target.value } : entry,
                          ),
                        },
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="路径 / URL">
                  <Input
                    value={item.href}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.map((entry) =>
                            entry.id === item.id ? { ...entry, href: e.target.value } : entry,
                          ),
                        },
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="图标名">
                  <Input
                    value={item.icon}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.map((entry) =>
                            entry.id === item.id ? { ...entry, icon: e.target.value } : entry,
                          ),
                        },
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(value) =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.map((entry) =>
                            entry.id === item.id ? { ...entry, enabled: value } : entry,
                          ),
                        },
                      }))
                    }
                    aria-label={`${item.label} 是否显示`}
                  />
                  <span className="text-xs text-muted-foreground">显示</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={item.openInNewTab}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, openInNewTab: e.target.checked }
                              : entry,
                          ),
                        },
                      }))
                    }
                  />
                  新窗口打开
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: moveItem(
                            [...current.navigation.items].sort((a, b) => a.order - b.order),
                            index,
                            -1,
                          ),
                        },
                      }))
                    }
                    disabled={index === 0}
                    aria-label="导航上移"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: moveItem(
                            [...current.navigation.items].sort((a, b) => a.order - b.order),
                            index,
                            1,
                          ),
                        },
                      }))
                    }
                    disabled={index === sortedNav.length - 1}
                    aria-label="导航下移"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        navigation: {
                          ...current.navigation,
                          items: current.navigation.items.filter((entry) => entry.id !== item.id),
                        },
                      }))
                    }
                    aria-label="删除导航"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              mark((current) => ({
                ...current,
                navigation: {
                  items: [
                    ...current.navigation.items,
                    {
                      id: `custom-${Date.now()}`,
                      label: "新导航",
                      href: "/",
                      icon: "Link",
                      enabled: true,
                      order: current.navigation.items.length,
                      openInNewTab: false,
                    },
                  ],
                },
              }))
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            新增导航
          </Button>
        </div>
      </Section>

      <Section
        title="社交链接"
        description="空值或关闭的链接不会出现在前台资料卡。邮箱会自动转为 mailto。"
      >
        <div className="space-y-3">
          {sortedSocial.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border/60 bg-background/20 p-4">
              <div className="grid gap-3 md:grid-cols-[0.7fr_1fr_1.4fr_0.7fr] md:items-end">
                <Field label="名称">
                  <Input
                    value={item.label}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.map((entry) =>
                          entry.id === item.id ? { ...entry, label: e.target.value } : entry,
                        ),
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="类型">
                  <Input
                    value={item.type}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.map((entry) =>
                          entry.id === item.id ? { ...entry, type: e.target.value } : entry,
                        ),
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="URL / 账号">
                  <Input
                    value={item.value}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.map((entry) =>
                          entry.id === item.id ? { ...entry, value: e.target.value } : entry,
                        ),
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="图标名">
                  <Input
                    value={item.icon}
                    onChange={(e) =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.map((entry) =>
                          entry.id === item.id ? { ...entry, icon: e.target.value } : entry,
                        ),
                      }))
                    }
                    className={fieldClass}
                  />
                </Field>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(value) =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.map((entry) =>
                          entry.id === item.id ? { ...entry, enabled: value } : entry,
                        ),
                      }))
                    }
                  />
                  显示
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        socialLinks: moveItem(
                          [...current.socialLinks].sort((a, b) => a.order - b.order),
                          index,
                          -1,
                        ),
                      }))
                    }
                    disabled={index === 0}
                    aria-label="社交链接上移"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        socialLinks: moveItem(
                          [...current.socialLinks].sort((a, b) => a.order - b.order),
                          index,
                          1,
                        ),
                      }))
                    }
                    disabled={index === sortedSocial.length - 1}
                    aria-label="社交链接下移"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        socialLinks: current.socialLinks.filter((entry) => entry.id !== item.id),
                      }))
                    }
                    aria-label="删除社交链接"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              mark((current) => ({
                ...current,
                socialLinks: [
                  ...current.socialLinks,
                  {
                    id: `social-${Date.now()}`,
                    type: "custom",
                    label: "新链接",
                    value: "",
                    icon: "Link",
                    enabled: true,
                    order: current.socialLinks.length,
                    copyValue: false,
                    openInNewTab: true,
                  },
                ],
              }))
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            新增链接
          </Button>
        </div>
      </Section>

      <Section
        title="右栏音乐"
        description="播放器仿照示例站的紧凑卡片。浏览器会阻止未经用户操作的自动播放，请在前台点击播放；音频可使用媒体库地址或公开的 http(s) 地址。"
      >
        <div className="grid gap-5 md:grid-cols-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.music.enabled}
              onCheckedChange={(value) =>
                mark((current) => ({ ...current, music: { ...current.music, enabled: value } }))
              }
            />
            显示音乐模块
          </label>
          <Field label="播放器标题">
            <Input
              value={draft.music.providerLabel}
              onChange={(e) =>
                mark((current) => ({
                  ...current,
                  music: { ...current.music, providerLabel: e.target.value },
                }))
              }
              className={fieldClass}
              maxLength={40}
            />
          </Field>
          <Field label="默认曲目">
            <select
              value={draft.music.activeTrackId}
              onChange={(e) =>
                mark((current) => ({
                  ...current,
                  music: { ...current.music, activeTrackId: e.target.value },
                }))
              }
              className={fieldClass}
            >
              <option value="">第一首已启用曲目</option>
              {sortedMusic.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5 space-y-3">
          {sortedMusic.map((track, index) => (
            <div key={track.id} className="rounded-xl border border-border/60 bg-background/20 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="曲目名称">
                  <Input
                    value={track.title}
                    onChange={(e) => updateMusicTrack(track.id, { title: e.target.value })}
                    className={fieldClass}
                    maxLength={120}
                  />
                </Field>
                <Field label="歌手 / 作者">
                  <Input
                    value={track.artist}
                    onChange={(e) => updateMusicTrack(track.id, { artist: e.target.value })}
                    className={fieldClass}
                    maxLength={80}
                  />
                </Field>
                <Field label="副标题 / 专辑">
                  <Input
                    value={track.subtitle}
                    onChange={(e) => updateMusicTrack(track.id, { subtitle: e.target.value })}
                    className={fieldClass}
                    maxLength={160}
                  />
                </Field>
                <MediaField
                  label="音频 URL"
                  value={track.url}
                  onChange={(value) => updateMusicTrack(track.id, { url: value })}
                  media={media}
                  idSuffix={track.id}
                  help="支持媒体库地址或公开 http(s) 音频地址。"
                />
                <MediaField
                  label="封面"
                  value={track.coverUrl}
                  onChange={(value) => updateMusicTrack(track.id, { coverUrl: value })}
                  media={media}
                  idSuffix={track.id}
                  help="留空使用站点默认封面。"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={track.enabled}
                    onCheckedChange={(value) => updateMusicTrack(track.id, { enabled: value })}
                  />
                  启用曲目
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        music: {
                          ...current.music,
                          playlist: moveItem(
                            [...current.music.playlist].sort((a, b) => a.order - b.order),
                            index,
                            -1,
                          ),
                        },
                      }))
                    }
                    disabled={index === 0}
                    aria-label="曲目上移"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => ({
                        ...current,
                        music: {
                          ...current.music,
                          playlist: moveItem(
                            [...current.music.playlist].sort((a, b) => a.order - b.order),
                            index,
                            1,
                          ),
                        },
                      }))
                    }
                    disabled={index === sortedMusic.length - 1}
                    aria-label="曲目下移"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      mark((current) => {
                        const playlist = current.music.playlist.filter(
                          (entry) => entry.id !== track.id,
                        );
                        return {
                          ...current,
                          music: {
                            ...current.music,
                            playlist,
                            activeTrackId:
                              current.music.activeTrackId === track.id
                                ? (playlist[0]?.id ?? "")
                                : current.music.activeTrackId,
                          },
                        };
                      })
                    }
                    aria-label="删除曲目"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              mark((current) => ({
                ...current,
                music: {
                  ...current.music,
                  playlist: [
                    ...current.music.playlist,
                    {
                      id: `music-${Date.now()}`,
                      title: "新曲目",
                      artist: "",
                      subtitle: "",
                      url: "",
                      coverUrl: "",
                      enabled: true,
                      order: current.music.playlist.length,
                    },
                  ],
                },
              }))
            }
          >
            <Music2 className="mr-1.5 h-4 w-4" />
            新增曲目
          </Button>
        </div>
      </Section>

      <Section
        title="首页模块"
        description="使用上移 / 下移提供非拖动排序方式；隐藏模块不会输出对应的首页区块。"
      >
        <div className="space-y-2">
          {sortedModules.map((module, index) => (
            <div
              key={module.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/20 px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm">{module.id}</span>
              <Switch
                checked={module.enabled}
                onCheckedChange={(value) =>
                  mark((current) => ({
                    ...current,
                    modules: current.modules.map((entry) =>
                      entry.id === module.id ? { ...entry, enabled: value } : entry,
                    ),
                  }))
                }
                aria-label={`${module.id} 是否显示`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  mark((current) => ({
                    ...current,
                    modules: moveItem(
                      [...current.modules].sort((a, b) => a.order - b.order),
                      index,
                      -1,
                    ),
                  }))
                }
                disabled={index === 0}
                aria-label="模块上移"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  mark((current) => ({
                    ...current,
                    modules: moveItem(
                      [...current.modules].sort((a, b) => a.order - b.order),
                      index,
                      1,
                    ),
                  }))
                }
                disabled={index === sortedModules.length - 1}
                aria-label="模块下移"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          可用模块：{PUBLIC_MODULE_IDS.join("、")}
        </p>
      </Section>

      <Section
        title="页脚与关于页"
        description="不填的 ICP、日期和自定义说明不会渲染。关于正文支持 Markdown，但仅在公开关于页使用。"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="建站日期">
            <Input
              type="date"
              value={draft.footer.buildDate}
              onChange={(e) => setFooter({ buildDate: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="版权文字">
            <Input
              value={draft.footer.copyrightText}
              onChange={(e) => setFooter({ copyrightText: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="备案名称">
            <Input
              value={draft.footer.icpName}
              onChange={(e) => setFooter({ icpName: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="备案链接">
            <Input
              value={draft.footer.icpUrl}
              onChange={(e) => setFooter({ icpUrl: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="页脚自定义说明">
            <Input
              value={draft.footer.customText}
              onChange={(e) => setFooter({ customText: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="关于页标题">
            <Input
              value={draft.about.title}
              onChange={(e) => setAbout({ title: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="关于页简介">
            <Textarea
              value={draft.about.summary}
              onChange={(e) => setAbout({ summary: e.target.value })}
              className={`${fieldClass} min-h-24`}
            />
          </Field>
          <Field label="关于页 Markdown 正文">
            <Textarea
              value={draft.about.content}
              onChange={(e) => setAbout({ content: e.target.value })}
              className={`${fieldClass} min-h-40 font-mono text-xs`}
            />
          </Field>
          <MediaField
            label="关于页图片"
            value={draft.about.imageUrl}
            onChange={(value) => setAbout({ imageUrl: value })}
            media={media}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.about.enabled}
              onCheckedChange={(value) => setAbout({ enabled: value })}
            />
            显示关于页自定义内容
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.footer.showCurrentTime}
              onCheckedChange={(value) => setFooter({ showCurrentTime: value })}
            />
            显示当前时间
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.footer.showUptime}
              onCheckedChange={(value) => setFooter({ showUptime: value })}
            />
            显示运行天数
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.footer.showTechBadges}
              onCheckedChange={(value) => setFooter({ showTechBadges: value })}
            />
            显示技术栈标签
          </label>
        </div>
      </Section>

      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/90 p-3 shadow-xl backdrop-blur-xl">
        <span className="text-xs text-muted-foreground">{dirty ? "有未保存修改" : "已保存"}</span>
        <Button type="button" size="lg" onClick={() => void save()} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "保存中…" : "保存公开站点"}
        </Button>
      </div>
    </div>
  );
}
