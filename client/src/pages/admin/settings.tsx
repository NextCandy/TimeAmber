import { useState, useEffect, useCallback } from "react";
import { getToken } from "@/lib/api";
import { Save, Globe, User, Link2, ToggleLeft, ToggleRight, Code, Rss, Wand2, ImageIcon, Handshake, Plus, Trash2, Database, RefreshCw, GripVertical } from "lucide-react";

type FriendLink = {
  name: string;
  url: string;
  logo: string;
};

type Settings = {
  site_title: string;
  site_description: string;
  site_tagline: string;
  author_name: string;
  author_title: string;
  author_bio: string;
  author_avatar: string;
  github_url: string;
  twitter_url: string;
  email: string;
  friend_links: string;
  social_links: string;
  footer_text: string;
  rss_enabled: string;
  custom_header: string;
  custom_footer: string;
  see_image_hosting_enabled: string;
  see_api_token: string;
  ai_provider: string;
  ai_api_key: string;
  ai_model: string;
  ai_base_url: string;
  notion_data_source_id: string;
};

type NotionSyncStatus = {
  configured: boolean;
  dataSourceId: string;
  lastRunAt: string;
  lastStatus: string;
  lastError: string;
  lastCreated: number;
  lastUpdated: number;
  lastSkipped: number;
  lastFailed: number;
  lastDurationMs: number;
};

const defaultSettings: Settings = {
  site_title: "TimeAmber",
  site_description: "书写代码、设计与边缘计算的个人博客",
  site_tagline: "在秩序与混沌的交界处，寻找属于自己的巨石碑。",
  author_name: "TimeAmber",
  author_title: "独立开发者",
  author_bio: "热爱于前端架构、设计系统与边缘计算。\n相信技术应当服务于人，而非反过来。",
  author_avatar: "",
  github_url: "",
  twitter_url: "",
  email: "",
  friend_links: "[]",
  social_links: "",
  footer_text: "© 2026 TimeAmber. 使用 Hono + Vite 构建，部署于 Cloudflare 边缘。",
  rss_enabled: "true",
  custom_header: "",
  custom_footer: "",
  see_image_hosting_enabled: "false",
  see_api_token: "",
  ai_provider: "deepseek",
  ai_api_key: "",
  ai_model: "deepseek-chat",
  ai_base_url: "https://api.deepseek.com",
  notion_data_source_id: "22837041-b78c-81d8-9670-000b9d50c21b",
};

type TabId = "general" | "profile" | "social" | "friends" | "images" | "notion" | "ai" | "advanced";
type TabDefinition = { id: TabId; label: string; icon: typeof Globe };

const TABS: TabDefinition[] = [
  { id: "general", label: "常规设置", icon: Globe },
  { id: "profile", label: "个人资料", icon: User },
  { id: "social", label: "社交与订阅", icon: Link2 },
  { id: "friends", label: "友链", icon: Handshake },
  { id: "images", label: "图片托管", icon: ImageIcon },
  { id: "notion", label: "Notion 同步", icon: Database },
  { id: "ai", label: "AI 编辑", icon: Wand2 },
  { id: "advanced", label: "扩展与注入", icon: Code },
];

function parseFriendLinks(raw: string): FriendLink[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const link = item as Partial<FriendLink>;
      return {
        name: String(link.name || ""),
        url: String(link.url || ""),
        logo: String(link.logo || ""),
      };
    });
  } catch {
    return [];
  }
}

function serializeFriendLinks(links: FriendLink[]): string {
  const normalized = links
    .map((link) => ({
      name: link.name.trim(),
      url: link.url.trim(),
      logo: link.logo.trim(),
    }));
  return JSON.stringify(normalized);
}

type SocialIcon = "github" | "x" | "mail" | "rss" | "link";

type SocialLinkConfig = {
  id: string;
  label: string;
  url: string;
  icon: SocialIcon;
  enabled: boolean;
};

const SOCIAL_ICON_OPTIONS: { value: SocialIcon; label: string }[] = [
  { value: "link", label: "链接" },
  { value: "github", label: "GitHub" },
  { value: "x", label: "X" },
  { value: "mail", label: "邮箱" },
  { value: "rss", label: "RSS" },
];

function createSocialLink(link: Partial<SocialLinkConfig> = {}): SocialLinkConfig {
  return {
    id: link.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `social-${Date.now()}`),
    label: link.label || "",
    url: link.url || "",
    icon: link.icon || "link",
    enabled: link.enabled ?? true,
  };
}

function isSocialIcon(value: unknown): value is SocialIcon {
  return typeof value === "string" && SOCIAL_ICON_OPTIONS.some((option) => option.value === value);
}

function parseSocialLinks(value: string): SocialLinkConfig[] | null {
  if (!value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => createSocialLink({
        id: typeof item.id === "string" ? item.id : undefined,
        label: typeof item.label === "string" ? item.label : "",
        url: typeof item.url === "string" ? item.url : "",
        icon: isSocialIcon(item.icon) ? item.icon : "link",
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      }));
  } catch {
    return null;
  }
}

function getLegacySocialLinks(settings: Settings): SocialLinkConfig[] {
  const links: SocialLinkConfig[] = [];
  if (settings.github_url) links.push(createSocialLink({ id: "legacy-github", label: "GitHub", url: settings.github_url, icon: "github" }));
  if (settings.twitter_url) links.push(createSocialLink({ id: "legacy-x", label: "X", url: settings.twitter_url, icon: "x" }));
  if (settings.email) links.push(createSocialLink({ id: "legacy-email", label: "邮箱", url: settings.email, icon: "mail" }));
  return links;
}

function getSocialLinks(settings: Settings): SocialLinkConfig[] {
  if (!settings.social_links.trim()) return getLegacySocialLinks(settings);
  const parsed = parseSocialLinks(settings.social_links);
  return parsed === null ? getLegacySocialLinks(settings) : parsed;
}

function serializeSocialLinks(links: SocialLinkConfig[]) {
  return JSON.stringify(links.map((link) => ({
    id: link.id,
    label: link.label.trim(),
    url: link.url.trim(),
    icon: link.icon,
    enabled: link.enabled,
  })));
}

function toLegacySocialFields(links: SocialLinkConfig[]) {
  const enabledLinks = links.filter((link) => link.enabled);
  const github = enabledLinks.find((link) => link.icon === "github");
  const x = enabledLinks.find((link) => link.icon === "x");
  const email = enabledLinks.find((link) => link.icon === "mail");

  return {
    github_url: github?.url.trim() || "",
    twitter_url: x?.url.trim() || "",
    email: email?.url.trim().replace(/^mailto:/i, "") || "",
  };
}

export function AdminSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" as "" | "success" | "error" });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loadError, setLoadError] = useState("");
  const [avatarError, setAvatarError] = useState(false);
  const [notionStatus, setNotionStatus] = useState<NotionSyncStatus | null>(null);
  const [notionSyncing, setNotionSyncing] = useState(false);

  useEffect(() => {
    document.title = "站点设置 | TimeAmber";
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error("设置加载失败");
      }
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setSettings((prev) => ({ ...prev, ...data }));
      }
      fetchNotionStatus();
      setLoadError("");
    } catch {
      setSettings(defaultSettings);
      setLoadError("设置加载失败，请检查网络或稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const showMsg = useCallback((text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 3000);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const socialLinks = getSocialLinks(settings);
    const nextSettings = {
      ...settings,
      ...toLegacySocialFields(socialLinks),
      social_links: serializeSocialLinks(socialLinks),
    };
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(nextSettings),
      });
      if (!res.ok) throw new Error("保存失败");
      setSettings(nextSettings);
      showMsg("设置已保存", "success");
    } catch {
      showMsg("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setAvatarError(false);
  }, [settings.author_avatar]);

  const rssEnabled = settings.rss_enabled !== "false";
  const seeHostingEnabled = settings.see_image_hosting_enabled === "true";
  const friendLinks = parseFriendLinks(settings.friend_links);
  const socialLinks = getSocialLinks(settings);

  const updateFriendLinks = (links: FriendLink[]) => {
    updateSetting("friend_links", serializeFriendLinks(links));
  };

  const fetchNotionStatus = async () => {
    try {
      const res = await fetch("/api/admin/notion-sync/status", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setNotionStatus(await res.json());
      }
    } catch {
      setNotionStatus(null);
    }
  };

  const runNotionSync = async () => {
    setNotionSyncing(true);
    try {
      const res = await fetch("/api/admin/notion-sync/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json().catch(() => null);
      await fetchNotionStatus();
      if (!res.ok) {
        throw new Error(data?.errors?.[0] || "Notion 同步失败");
      }
      showMsg(`Notion 同步完成：新增 ${data.created || 0}，更新 ${data.updated || 0}`, "success");
    } catch (error) {
      showMsg(error instanceof Error ? error.message : "Notion 同步失败", "error");
    } finally {
      setNotionSyncing(false);
    }
  };

  const updateFriendLink = (index: number, key: keyof FriendLink, value: string) => {
    updateFriendLinks(friendLinks.map((link, i) => i === index ? { ...link, [key]: value } : link));
  };

  const addFriendLink = () => {
    updateFriendLinks([...friendLinks, { name: "", url: "", logo: "" }]);
  };

  const removeFriendLink = (index: number) => {
    updateFriendLinks(friendLinks.filter((_, i) => i !== index));
  };

  const updateSocialLinks = (links: SocialLinkConfig[]) => {
    setSettings((prev) => ({ ...prev, social_links: serializeSocialLinks(links) }));
  };

  const updateSocialLink = (id: string, patch: Partial<SocialLinkConfig>) => {
    updateSocialLinks(socialLinks.map((link) => link.id === id ? { ...link, ...patch } : link));
  };

  const addSocialLink = () => {
    updateSocialLinks([...socialLinks, createSocialLink({ label: "新链接", icon: "link" })]);
  };

  const removeSocialLink = (id: string) => {
    updateSocialLinks(socialLinks.filter((link) => link.id !== id));
  };

  if (loading) return <div className="py-[60px] text-center text-muted-foreground/40">加载中...</div>;

  return (
    <div className="mx-auto w-full max-w-[960px] py-[24px] sm:py-[36px] px-[16px] sm:px-[20px]">
      {/* 顶栏 */}
      <div className="mb-[28px] flex items-center justify-between">
        <div className="flex items-center gap-[16px]">
          <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.02em]">站点设置</h1>
        </div>
        <div className="flex items-center gap-[12px]">
          {message.text && (
            <span className={`text-[12px] px-[12px] py-[6px] rounded-md animate-fade-in ${
              message.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {message.type === "success" ? "已保存 ✓" : "失败 ✕"}
            </span>
          )}
          <button onClick={handleSave} disabled={saving || !!loadError} className="inline-flex items-center gap-[6px] h-[36px] px-[16px] rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            <Save className="h-[14px] w-[14px]" />{saving ? "保存中..." : "保存更改"}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-[20px] rounded-lg border border-red-500/20 bg-red-500/10 px-[14px] py-[12px] text-[12px] text-red-400">
          <div className="flex items-center justify-between gap-[12px]">
            <span>{loadError}</span>
            <button onClick={fetchSettings} className="rounded-md border border-red-500/20 px-[10px] py-[4px] text-[11px] text-red-300 transition-colors hover:bg-red-500/10">
              重试
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-[24px] lg:gap-[36px]">
        {/* 左侧边栏导航 */}
        <div className="w-full md:w-[220px] shrink-0 flex md:flex-col gap-[4px] overflow-x-auto md:overflow-visible pb-[8px] md:pb-0 scrollbar-hide" role="tablist" aria-label="站点设置分类标签">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 w-auto md:w-full flex items-center gap-[10px] px-[14px] py-[10px] md:py-[12px] rounded-lg text-[13px] md:text-[14px] transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? "bg-card border border-border/15 text-foreground font-medium shadow-sm" 
                  : "text-muted-foreground/60 hover:text-foreground/85 hover:bg-card/40 border border-transparent"
              }`}
            >
              <tab.icon className={`h-[15px] w-[15px] ${activeTab === tab.id ? "text-cyan-400" : "opacity-60"}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 右侧面板主体内容 */}
        <div className="flex-1 min-w-0">
          
          {/* TAB: 常规设置 */}
          {activeTab === "general" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px]">常规设置</h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">管理站点的基础身份信息与大纲结构。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <SettingField label="站点标题" value={settings.site_title} onChange={(v) => updateSetting("site_title", v)} placeholder="TimeAmber" />
                  <SettingField label="站点描述" value={settings.site_description} onChange={(v) => updateSetting("site_description", v)} placeholder="一句话描述你的博客（用于 SEO Meta）" />
                  <SettingField label="首页标语 (Tagline)" value={settings.site_tagline} onChange={(v) => updateSetting("site_tagline", v)} placeholder="显示在首页 Hero 区域的引言" />
                  <SettingField label="页脚文本" value={settings.footer_text} onChange={(v) => updateSetting("footer_text", v)} placeholder="© 2026 ..."  />
                </div>
              </div>
            </div>
          )}

          {/* TAB: 个人资料 */}
          {activeTab === "profile" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-profile" aria-labelledby="settings-tab-profile">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px]">个人资料</h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">维护博主名片栏目，向访客展示个人特写。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <div>
                    <label className="mb-[6px] block text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider">头像</label>
                    <div className="flex items-start sm:items-center gap-[16px] flex-col sm:flex-row">
                      <div className="relative shrink-0">
                        {settings.author_avatar && !avatarError ? (
                          <img
                            src={settings.author_avatar}
                            alt="头像预览"
                            className="h-[64px] w-[64px] rounded-full object-cover border-[3px] border-card shadow-sm"
                            onError={() => setAvatarError(true)}
                          />
                        ) : (
                          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-[24px] font-bold text-cyan-400 border-[3px] border-card shadow-sm">
                            {(settings.author_name || 'M').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 w-full">
                        <input
                          value={settings.author_avatar}
                          onChange={(e) => updateSetting("author_avatar", e.target.value)}
                          placeholder="输入头像图片 URL，留空则显示简称"
                          className="w-full rounded-lg border border-border/20 bg-background/30 px-[14px] h-[38px] text-[13px] text-foreground placeholder:text-muted-foreground/20 outline-none focus:border-foreground/30 focus:bg-background/50 transition-all font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground/30 mt-[6px]">将图片上传至媒体库后粘贴其 URL 地址。</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px]">
                    <SettingField label="显示名称" value={settings.author_name} onChange={(v) => updateSetting("author_name", v)} placeholder="你的名字" />
                    <SettingField label="身份头衔" value={settings.author_title} onChange={(v) => updateSetting("author_title", v)} placeholder="例如：全栈工程师" />
                  </div>
                  <SettingField label="个人简介" value={settings.author_bio} onChange={(v) => updateSetting("author_bio", v)} placeholder="一段简短的自我介绍" multiline />
                </div>
              </div>
            </div>
          )}

          {/* TAB: 社交与订阅 */}
          {activeTab === "social" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-social" aria-labelledby="settings-tab-social">
              <div>
                <div className="mb-[16px] flex flex-col gap-[12px] sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-[16px] font-semibold mb-[4px]">友链与社交入口</h2>
                    <p className="text-[12px] text-muted-foreground/50">按需添加任意平台链接，启用后会展示在首页博主名片中。</p>
                  </div>
                  <button
                    type="button"
                    onClick={addSocialLink}
                    className="inline-flex min-h-[44px] items-center justify-center gap-[6px] rounded-lg border border-border/20 bg-background/40 px-[14px] text-[13px] font-medium text-foreground transition-all hover:-translate-y-[2px] hover:bg-accent/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Plus className="h-[14px] w-[14px]" />
                    添加链接
                  </button>
                </div>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[14px] sm:p-[20px]">
                  {socialLinks.length > 0 ? (
                    <div className="space-y-[10px]">
                      {socialLinks.map((link) => (
                        <div key={link.id} className="grid gap-[10px] rounded-lg border border-border/15 bg-background/25 p-[12px] lg:grid-cols-[28px_minmax(110px,0.85fr)_minmax(180px,1.4fr)_112px_44px_44px] lg:items-center">
                          <div className="hidden h-[28px] w-[28px] items-center justify-center rounded-md text-muted-foreground/25 lg:flex">
                            <GripVertical className="h-[14px] w-[14px]" />
                          </div>
                          <label className="block">
                            <span className="mb-[6px] block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 lg:sr-only">名称</span>
                            <input
                              value={link.label}
                              onChange={(e) => updateSocialLink(link.id, { label: e.target.value })}
                              placeholder="平台名称"
                              className="h-[40px] w-full rounded-lg border border-border/20 bg-background/30 px-[12px] text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground/25 focus:border-foreground/30 focus:bg-background/50"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-[6px] block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 lg:sr-only">地址</span>
                            <input
                              value={link.url}
                              onChange={(e) => updateSocialLink(link.id, { url: e.target.value })}
                              placeholder={link.icon === "mail" ? "you@example.com" : "https://example.com"}
                              className="h-[40px] w-full rounded-lg border border-border/20 bg-background/30 px-[12px] font-mono text-[12px] text-foreground outline-none transition-all placeholder:text-muted-foreground/25 focus:border-foreground/30 focus:bg-background/50"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-[6px] block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 lg:sr-only">图标</span>
                            <select
                              value={link.icon}
                              onChange={(e) => updateSocialLink(link.id, { icon: e.target.value as SocialIcon })}
                              className="h-[40px] w-full rounded-lg border border-border/20 bg-background/30 px-[10px] text-[13px] text-foreground outline-none transition-all focus:border-foreground/30 focus:bg-background/50"
                            >
                              {SOCIAL_ICON_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => updateSocialLink(link.id, { enabled: !link.enabled })}
                            aria-label={link.enabled ? `停用 ${link.label || "链接"}` : `启用 ${link.label || "链接"}`}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/15 bg-background/25 text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {link.enabled ? (
                              <ToggleRight className="h-[28px] w-[28px] text-emerald-400" />
                            ) : (
                              <ToggleLeft className="h-[28px] w-[28px] text-muted-foreground/30" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSocialLink(link.id)}
                            aria-label={`删除 ${link.label || "链接"}`}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/15 bg-background/25 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <Trash2 className="h-[15px] w-[15px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/20 px-[18px] py-[28px] text-center">
                      <p className="text-[13px] font-medium text-foreground/80">还没有配置链接</p>
                      <p className="mt-[6px] text-[12px] text-muted-foreground/45">添加 GitHub、邮箱、项目页或任意友链入口。</p>
                    </div>
                  )}
                  <div className="mt-[14px] flex items-center gap-[6px] text-[11px] text-muted-foreground/35">
                    <div className="h-[12px] w-[2px] rounded-full bg-cyan-400/50" />
                    旧版 GitHub、X、邮箱字段会自动迁移为列表项，保存后继续兼容旧接口。
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-[16px] font-semibold mb-[4px]">RSS 订阅流</h2>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-foreground flex items-center gap-[6px]">
                        <Rss className="h-[14px] w-[14px] text-orange-400" /> RSS Feed 源
                      </p>
                      <p className="text-[12px] text-muted-foreground/40 mt-[4px]">
                        {rssEnabled ? "开启状态，访客可订阅最新发布的文章" : "已隐藏，页脚不再展示订阅入口"}
                      </p>
                    </div>
                    <button onClick={() => updateSetting("rss_enabled", rssEnabled ? "false" : "true")}
                      className="inline-flex items-center transition-opacity hover:opacity-80"
                    >
                      {rssEnabled ? (
                        <ToggleRight className="h-[32px] w-[32px] text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-[32px] w-[32px] text-muted-foreground/20" />
                      )}
                    </button>
                  </div>
                  {rssEnabled && (
                    <div className="mt-[16px] rounded-lg border border-border/10 bg-background/20 px-[14px] py-[10px] flex justify-between items-center">
                      <span className="text-[12px] text-muted-foreground/50 font-mono tracking-tight">
                        {typeof window !== "undefined" ? window.location.origin : ""}/rss.xml
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: 友链 */}
          {activeTab === "friends" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-friends" aria-labelledby="settings-tab-friends">
              <div>
                <div className="mb-[16px] flex items-start justify-between gap-[16px]">
                  <div>
                    <h2 className="text-[16px] font-semibold mb-[4px] flex items-center gap-[6px]">
                      <Handshake className="h-[15px] w-[15px] text-cyan-400" /> 友链
                    </h2>
                    <p className="text-[12px] text-muted-foreground/50">管理前台 /friends 页面展示的网站名称、地址与 Logo。</p>
                  </div>
                  <button
                    type="button"
                    onClick={addFriendLink}
                    className="inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-lg border border-border/20 bg-card/10 px-[12px] text-[12px] text-foreground transition-colors hover:bg-card/30"
                  >
                    <Plus className="h-[13px] w-[13px]" /> 添加
                  </button>
                </div>

                <div className="space-y-[12px]">
                  {friendLinks.length === 0 && (
                    <div className="rounded-lg border border-border/15 bg-card/5 px-[16px] py-[22px] text-[13px] text-muted-foreground/45">
                      暂未添加友链，点击“添加”创建第一条。
                    </div>
                  )}

                  {friendLinks.map((link, index) => (
                    <div key={index} className="rounded-lg border border-border/15 bg-card/5 p-[16px]">
                      <div className="mb-[12px] flex items-center justify-between gap-[12px]">
                        <div className="flex min-w-0 items-center gap-[10px]">
                          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/15 bg-background/40">
                            {link.logo ? (
                              <img src={link.logo} alt="" className="h-full w-full object-contain p-[4px]" />
                            ) : (
                              <span className="text-[13px] text-muted-foreground/40">{link.name?.charAt(0) || "#"}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-foreground">{link.name || `友链 ${index + 1}`}</p>
                            <p className="truncate text-[11px] text-muted-foreground/35">{link.url || "未填写地址"}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFriendLink(index)}
                          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          aria-label="删除友链"
                        >
                          <Trash2 className="h-[14px] w-[14px]" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
                        <SettingField label="名称" value={link.name} onChange={(v) => updateFriendLink(index, "name", v)} placeholder="时光琥珀" />
                        <SettingField label="地址" value={link.url} onChange={(v) => updateFriendLink(index, "url", v)} placeholder="https://TimeAmber.com" />
                        <SettingField label="Logo" value={link.logo} onChange={(v) => updateFriendLink(index, "logo", v)} placeholder="https://i.see.you/2026/04/28/7fmF/TimeAmberSVG.svg" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: 图片托管 */}
          {activeTab === "images" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-images" aria-labelledby="settings-tab-images">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px] flex items-center gap-[6px]">
                  <ImageIcon className="h-[15px] w-[15px] text-cyan-400" /> S.EE 图床
                </h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">开启后，新增、编辑文章和批量导入 Markdown 时，会自动把正文里的外部图片上传到 S.EE，并用新链接覆盖原链接。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <div className="flex items-center justify-between gap-[16px]">
                    <div>
                      <p className="text-[14px] font-medium text-foreground">自动上传外部图片</p>
                      <p className="text-[12px] text-muted-foreground/40 mt-[4px]">
                        {seeHostingEnabled ? "已开启，保存文章时会自动替换正文图片链接" : "未开启，文章正文图片保持原链接"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting("see_image_hosting_enabled", seeHostingEnabled ? "false" : "true")}
                      className="inline-flex items-center transition-opacity hover:opacity-80"
                    >
                      {seeHostingEnabled ? (
                        <ToggleRight className="h-[32px] w-[32px] text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-[32px] w-[32px] text-muted-foreground/20" />
                      )}
                    </button>
                  </div>
                  <SettingField label="S.EE API Token" value={settings.see_api_token} onChange={(v) => updateSetting("see_api_token", v)} placeholder="S.EE API Token" />
                  <p className="text-[11px] text-muted-foreground/35">只处理 HTTPS 图片地址；已经是 S.EE 的图片会自动跳过。</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Notion 同步 */}
          {activeTab === "notion" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-notion" aria-labelledby="settings-tab-notion">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px] flex items-center gap-[6px]">
                  <Database className="h-[15px] w-[15px] text-violet-400" /> Notion 文章同步
                </h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">每 10 分钟从指定 Notion 数据库同步文章，默认同步页面正文块。首次同步进入草稿，发布仍由后台单独控制。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <SettingField label="Data Source ID" value={settings.notion_data_source_id} onChange={(v) => updateSetting("notion_data_source_id", v)} placeholder="22837041-b78c-81d8-9670-000b9d50c21b" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
                    <StatusPill label="Token" value={notionStatus?.configured ? "已配置" : "未配置"} tone={notionStatus?.configured ? "success" : "error"} />
                    <StatusPill label="最近状态" value={notionStatus?.lastStatus || "never"} tone={notionStatus?.lastStatus === "success" ? "success" : notionStatus?.lastStatus === "error" ? "error" : "neutral"} />
                    <StatusPill label="最近同步" value={formatDateTime(notionStatus?.lastRunAt)} tone="neutral" />
                    <StatusPill label="耗时" value={notionStatus?.lastDurationMs ? `${notionStatus.lastDurationMs} ms` : "-"} tone="neutral" />
                  </div>
                  <div className="rounded-lg border border-border/10 bg-background/20 px-[14px] py-[12px]">
                    <div className="grid grid-cols-4 gap-[8px] text-center">
                      <SyncMetric label="新增" value={notionStatus?.lastCreated || 0} />
                      <SyncMetric label="更新" value={notionStatus?.lastUpdated || 0} />
                      <SyncMetric label="跳过" value={notionStatus?.lastSkipped || 0} />
                      <SyncMetric label="失败" value={notionStatus?.lastFailed || 0} />
                    </div>
                    {notionStatus?.lastError && (
                      <pre className="mt-[12px] max-h-[120px] overflow-auto whitespace-pre-wrap rounded-md bg-red-500/5 px-[10px] py-[8px] text-[11px] leading-[1.5] text-red-400">{notionStatus.lastError}</pre>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[12px]">
                    <p className="text-[11px] text-muted-foreground/35">需要在 Cloudflare Worker secret 中配置 NOTION_TOKEN，并把 Notion 数据库分享给对应 Integration。若只想同步摘要和原文链接，可在设置中保存 notion_sync_include_page_body=false。</p>
                    <button
                      type="button"
                      onClick={runNotionSync}
                      disabled={notionSyncing}
                      className="inline-flex h-[36px] shrink-0 items-center justify-center gap-[6px] rounded-lg border border-border/20 px-[14px] text-[12px] font-medium text-foreground transition-colors hover:bg-card/60 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-[14px] w-[14px] ${notionSyncing ? "animate-spin" : ""}`} />
                      {notionSyncing ? "同步中" : "立即同步"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AI 编辑 */}
          {activeTab === "ai" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-ai" aria-labelledby="settings-tab-ai">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px] flex items-center gap-[6px]">
                  <Wand2 className="h-[15px] w-[15px] text-amber-400" /> AI 编辑
                </h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">配置后可在文章编辑页直接润色、续写或按要求修改 Markdown。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <div>
                    <label className="mb-[6px] block text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider">Provider</label>
                    <select
                      value={settings.ai_provider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        setSettings((prev) => ({
                          ...prev,
                          ai_provider: provider,
                          ai_model: provider === "gemini" ? "gemini-2.0-flash" : provider === "deepseek" ? "deepseek-chat" : prev.ai_model,
                          ai_base_url: provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : provider === "deepseek" ? "https://api.deepseek.com" : prev.ai_base_url,
                        }));
                      }}
                      className="h-[38px] w-full rounded-lg border border-border/20 bg-background/30 px-[14px] text-[13px] text-foreground outline-none focus:border-foreground/30 focus:bg-background/50 transition-all"
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI Compatible</option>
                    </select>
                  </div>
                  <SettingField label="API Key" value={settings.ai_api_key} onChange={(v) => updateSetting("ai_api_key", v)} placeholder="sk-... / AIza..." />
                  <SettingField label="Model" value={settings.ai_model} onChange={(v) => updateSetting("ai_model", v)} placeholder="deepseek-chat / gemini-2.0-flash" />
                  <SettingField label="Base URL" value={settings.ai_base_url} onChange={(v) => updateSetting("ai_base_url", v)} placeholder="https://api.deepseek.com" />
                  <p className="text-[11px] text-muted-foreground/35">API Key 只用于后台服务端调用，不会出现在前台公开设置中。</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: 扩展与注入 */}
          {activeTab === "advanced" && (
            <div className="space-y-[24px] animate-fade-in" role="tabpanel" id="settings-panel-advanced" aria-labelledby="settings-tab-advanced">
              <div>
                <h2 className="text-[16px] font-semibold mb-[4px] flex items-center gap-[6px]">
                  危险操作区 <span className="text-[10px] px-[6px] py-[2px] rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">Expert</span>
                </h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">向站点核心区域注入自定义脚本或标签。错误的语法可能导致前端崩溃。</p>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-[12px] py-[8px] mb-[16px] text-[11px] text-amber-400/80">
                  ⚠️ 隐私提醒：注入的分析脚本（如 Google Analytics）会在访客浏览器中执行。根据 GDPR 等隐私法规，您需确保已获得访客明示同意。TimeAmber 内置 Cookie 同意横幅，访客接受后才会加载第三方脚本。
                </div>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[20px]">
                  <div>
                    <label className="mb-[6px] block text-[11px] font-bold text-amber-500/70 uppercase tracking-wider">&lt;head&gt; 注入区域</label>
                    <p className="text-[11px] text-muted-foreground/30 mb-[10px]">适用于统计服务 (Analytics)、搜索引擎持有权验证 (SEO 元标签) 以及全局 CSS 覆盖。</p>
                    <textarea
                      value={settings.custom_header}
                      onChange={(e) => setSettings({ ...settings, custom_header: e.target.value })}
                      placeholder={"<!-- Google tag (gtag.js) -->\n<script async src=\"...\"></script>"}
                      rows={5}
                      className="w-full rounded-lg border border-border/20 bg-black/20 px-[16px] py-[12px] text-[12px] text-emerald-400/80 font-mono placeholder:text-muted-foreground/15 outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20 transition-all resize-y leading-[1.6]"
                    />
                  </div>
                  <div>
                    <label className="mb-[6px] block text-[11px] font-bold text-amber-500/70 uppercase tracking-wider">&lt;/body&gt; 前方注入</label>
                    <p className="text-[11px] text-muted-foreground/30 mb-[10px]">位于文档末尾，主要用于非阻塞广告联盟脚本、客服悬浮窗或第三方交互集成。</p>
                    <textarea
                      value={settings.custom_footer}
                      onChange={(e) => setSettings({ ...settings, custom_footer: e.target.value })}
                      placeholder={"<script>\n  console.log('Hello from footer!');\n</script>"}
                      rows={5}
                      className="w-full rounded-lg border border-border/20 bg-black/20 px-[16px] py-[12px] text-[12px] text-amber-400/80 font-mono placeholder:text-muted-foreground/15 outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20 transition-all resize-y leading-[1.6]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 底部 */}        </div>
      </div>
    </div>
  );
}

function SettingField({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const inputClass = "w-full rounded-lg border border-border/20 bg-background/30 px-[14px] text-[13px] text-foreground placeholder:text-muted-foreground/20 outline-none focus:border-foreground/30 focus:bg-background/50 transition-all";

  return (
    <div>
      <label className="mb-[6px] block text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className={`${inputClass} py-[10px] resize-y leading-[1.6]`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputClass} h-[38px]`} />
      )}
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "success" | "error" | "neutral" }) {
  const toneClass = tone === "success"
    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
    : tone === "error"
      ? "border-red-500/20 bg-red-500/5 text-red-400"
      : "border-border/15 bg-background/20 text-muted-foreground/60";

  return (
    <div className={`rounded-lg border px-[12px] py-[10px] ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-55">{label}</p>
      <p className="mt-[4px] truncate text-[12px] font-medium">{value || "-"}</p>
    </div>
  );
}

function SyncMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[18px] font-semibold text-foreground">{value}</p>
      <p className="mt-[2px] text-[11px] text-muted-foreground/40">{label}</p>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
