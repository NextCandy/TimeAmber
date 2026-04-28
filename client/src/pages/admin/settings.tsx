import { useState, useEffect, useCallback } from "react";
import { getToken } from "@/lib/api";
import { Save, Globe, User, Link2, ToggleLeft, ToggleRight, Code, Rss, Wand2, ImageIcon, Handshake, Plus, Trash2 } from "lucide-react";

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
};

type TabId = "general" | "profile" | "social" | "friends" | "images" | "ai" | "advanced";
type TabDefinition = { id: TabId; label: string; icon: typeof Globe };

const TABS: TabDefinition[] = [
  { id: "general", label: "常规设置", icon: Globe },
  { id: "profile", label: "个人资料", icon: User },
  { id: "social", label: "社交与订阅", icon: Link2 },
  { id: "friends", label: "友链", icon: Handshake },
  { id: "images", label: "图片托管", icon: ImageIcon },
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

export function AdminSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" as "" | "success" | "error" });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loadError, setLoadError] = useState("");
  const [avatarError, setAvatarError] = useState(false);

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
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("保存失败");
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

  const updateFriendLinks = (links: FriendLink[]) => {
    updateSetting("friend_links", serializeFriendLinks(links));
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
                <h2 className="text-[16px] font-semibold mb-[4px]">社交网络</h2>
                <p className="text-[12px] text-muted-foreground/50 mb-[16px]">提供连接外部平台与流量留存的入口。</p>
                <div className="rounded-xl border border-border/15 bg-card/5 p-[20px] sm:p-[24px] space-y-[18px]">
                  <SettingField label="GitHub" value={settings.github_url} onChange={(v) => updateSetting("github_url", v)} placeholder="https://github.com/username" />
                  <SettingField label="X / Twitter" value={settings.twitter_url} onChange={(v) => updateSetting("twitter_url", v)} placeholder="https://x.com/username" />
                  <SettingField label="联系邮箱" value={settings.email} onChange={(v) => updateSetting("email", v)} placeholder="you@example.com" />
                  <div className="mt-[8px] flex items-center gap-[6px] text-[11px] text-muted-foreground/30">
                    <div className="h-[12px] w-[2px] bg-cyan-400/50 rounded-full" />
                    填入有效链接后将自动在首页侧边卡片中展示对应图标。
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
                        <SettingField label="名称" value={link.name} onChange={(v) => updateFriendLink(index, "name", v)} placeholder="大佬论坛" />
                        <SettingField label="地址" value={link.url} onChange={(v) => updateFriendLink(index, "url", v)} placeholder="https://www.dalao.net" />
                        <SettingField label="Logo" value={link.logo} onChange={(v) => updateFriendLink(index, "logo", v)} placeholder="https://www.dalao.net/img/dalao-svg.svg" />
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
