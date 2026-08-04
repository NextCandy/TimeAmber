import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Post } from "./sample-posts";
import {
  loadAdminMediaState,
  loadAdminSummaryState,
  loadAdminState,
  persistAdminState,
  recordTelemetry,
  deletePostRow,
  setPostPublished,
  upsertSinglePost,
} from "./state.functions";
import { DEFAULT_AUTHOR_PROFILE, type AuthorProfile } from "./author-profile";
import {
  DEFAULT_PUBLIC_SITE_CONFIG,
  normalizePublicSiteConfig,
  type PublicSiteConfig,
} from "./public-site-settings";

export type Category = { name: string };
export type Tag = { name: string };
export type Friend = { name: string; url: string; desc: string; icon?: string; group?: string };

export type SiteSettings = AuthorProfile & {
  siteTitle: string;
  siteTagline: string;
  siteDescription: string;
  aboutIntro: string;
  aboutQuote: string;
  aboutTechStack: string; // one item per line
  contactEmail: string;
  contactGithub: string;
  contactTwitter: string;
  contactTelegram: string;
  contactX: string;
  contactWechat: string;
  contactQQ: string;
  contactXiaohongshu: string;
  contactDouyin: string;
  contactNote: string;
  /** 公开前台的结构化配置；与旧版字段并存，便于无迁移升级。 */
  publicSite?: PublicSiteConfig;
  /** 渠道是否以二维码弹层方式呈现（key 为渠道 key，如 wechat/qq/xiaohongshu/douyin） */
  contactQR?: Record<string, boolean>;
  /** GitHub 仓库（owner/name 或完整 URL），用于「同步状态」面板 */
  githubRepo?: string;
  /** GitHub 分支（留空使用默认分支） */
  githubBranch?: string;
  /** 是否把站内 AI 问答开放到前台 /ask。默认关闭 —— 开放后每次提问都消耗 AI_API_KEY。 */
  askPublicEnabled?: boolean;
};

/** 公开页面允许进入 root hydration 的站点字段白名单。 */
export type PublicSiteSettings = Partial<
  Pick<
    SiteSettings,
    | "authorName"
    | "authorAvatar"
    | "authorBio"
    | "siteTitle"
    | "siteTagline"
    | "siteDescription"
    | "aboutIntro"
    | "aboutQuote"
    | "aboutTechStack"
    | "contactEmail"
    | "contactGithub"
    | "contactTwitter"
    | "contactTelegram"
    | "contactX"
    | "contactWechat"
    | "contactQQ"
    | "contactXiaohongshu"
    | "contactDouyin"
    | "contactNote"
    | "askPublicEnabled"
    | "publicSite"
  >
>;

export type ImageHostConfig = {
  provider: "supabase" | "see" | "smms" | "custom";
  endpoint: string;
  token: string;
  label?: string;
};

export type NotifyConfig = {
  autoPush?: boolean; // 自动推送 error 级别告警
  autoPushLevel?: "error" | "warning"; // 触发级别阈值（默认 error）
  dedup?: {
    enabled?: boolean;
    windowSec?: number; // 同 key 节流窗口（秒），默认 600
    maxPerKey?: number; // 窗口内单 key 最大推送次数，默认 1
  };
  smtp?: {
    enabled?: boolean;
    webhookUrl: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from: string;
    to: string;
    secret?: string;
  };
  bark?: {
    enabled?: boolean;
    endpoint?: string;
    key: string;
    sound?: string;
    group?: string;
  };
  telegram?: {
    enabled?: boolean;
    botToken: string;
    chatId: string;
  };
};

export type CloudConfig = {
  webdav?: { url: string; username: string; password: string; filename: string };
  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    key: string;
  };
  dropbox?: { token: string; path: string };
  onedrive?: { token: string; path: string };
  gdrive?: { token: string; filename: string };
  notion?: { token: string; databaseId: string };
  see?: { token: string };
  imageHost?: ImageHostConfig;
  notify?: NotifyConfig;
};

export type AIConfig = {
  provider: "deepseek" | "openai" | "custom";
  endpoint: string;
  apiKey: string;
  model: string;
};

export type MediaItem = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  size?: number;
  uploadedAt: string;
  source: "supabase" | "see" | "manual" | "imported";
};

export type AnalyticsEvent = { at: string; path: string; referrer?: string };

export type AlertEntry = {
  id: string;
  at: string;
  level: "error" | "warning" | "info";
  source: string;
  message: string;
  acknowledged?: boolean;
};

export type NotifyReceipt = {
  id: string;
  at: string;
  channel: "bark" | "telegram" | "smtp";
  ok: boolean;
  title: string;
  message?: string;
};

export type MediaFailure = {
  id: string;
  at: string;
  name: string;
  size?: number;
  contentType?: string;
  attempts: number;
  error: string;
};

export type DiagnosticsArchive = {
  id: string;
  at: string;
  perfs: number; // count
  logs: number; // count
  errorCount: number;
  warnCount: number;
  payload: string; // JSON string of {perfs, logs}
};

export type CoreData = {
  posts: Post[];
  categories: Category[];
  tags: Tag[];
  friends: Friend[];
  settings: SiteSettings;
};

export type Snapshot = {
  id: string;
  createdAt: string;
  label: string;
  postCount: number;
  data: CoreData;
  auto?: boolean;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: "restore" | "create" | "delete" | "prune" | "import";
  snapshotId?: string;
  snapshotLabel?: string;
  detail?: string;
};

export type BackupSchedule = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  retention: number;
  lastRunAt?: string;
  timezone: string;
  windowStart: number;
  windowEnd: number;
};

export type AdminState = CoreData & {
  postCount: number;
  cloud: CloudConfig;
  snapshots: Snapshot[];
  audit: AuditEntry[];
  schedule: BackupSchedule;
  ai: AIConfig;
  media: MediaItem[];
  analytics: AnalyticsEvent[];
  alerts: AlertEntry[];
  notifyReceipts: NotifyReceipt[];
  mediaFailures: MediaFailure[];
  diagnosticsArchives: DiagnosticsArchive[];
  contactClicks: Record<string, number>;
  contactLastAt: Record<string, string>;
};

const DEFAULT_SETTINGS: SiteSettings = {
  ...DEFAULT_AUTHOR_PROFILE,
  siteTitle: "TimeAmber",
  siteTagline: "时光琥珀",
  siteDescription: "时光成珀，字字如初。",
  aboutIntro:
    "TimeAmber，中文名「时光琥珀」。这里存放我在互联网上读到的、值得封存下来的东西 —— 剪藏、笔记、自建服务的踩坑记录，以及一些关于 AI Agent 的工程实践。",
  aboutQuote: "时光成珀，字字如初。",
  aboutTechStack:
    "前端：React 19 + Vite + Tailwind CSS v4 + shadcn/ui\n后端：Hono + Drizzle ORM + PostgreSQL 16\n部署：Docker，运行在家里的小服务器上\n剪藏来源：自建的 VS.DO 服务，定时同步",
  contactEmail: "hi@timeamber.com",
  contactGithub: "https://github.com/NextCandy/TimeAmber",
  contactTwitter: "",
  contactTelegram: "",
  contactX: "",
  contactWechat: "",
  contactQQ: "",
  contactXiaohongshu: "",
  contactDouyin: "",
  contactNote: "如果你想交换友链，或者只是想说句话，邮件是最稳的方式。",
  publicSite: DEFAULT_PUBLIC_SITE_CONFIG,
  contactQR: {},
  githubRepo: "NextCandy/TimeAmber",
  githubBranch: "",
};

function normalizePost(p: Post): Post {
  return {
    ...p,
    status: p.status ?? "published",
    type: p.type ?? "markdown",
    openIn: p.openIn ?? "_blank",
  };
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  frequency: "daily",
  retention: 10,
  timezone: "Asia/Shanghai",
  windowStart: 2,
  windowEnd: 5,
};

const DEFAULT_AI: AIConfig = {
  provider: "deepseek",
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  apiKey: "",
  model: "deepseek-chat",
};

const INITIAL_STATE: AdminState = {
  posts: [],
  postCount: 0,
  categories: [],
  tags: [],
  friends: [],
  settings: DEFAULT_SETTINGS,
  cloud: {},
  snapshots: [],
  audit: [],
  schedule: DEFAULT_SCHEDULE,
  ai: DEFAULT_AI,
  media: [],
  analytics: [],
  alerts: [],
  notifyReceipts: [],
  mediaFailures: [],
  diagnosticsArchives: [],
  contactClicks: {},
  contactLastAt: {},
};

const MAX_SNAPSHOTS = 30;
const MAX_AUDIT = 200;
const MAX_ANALYTICS = 500;
const MAX_ALERTS = 100;
const MAX_MEDIA_FAIL = 100;
const MAX_DIAG_ARCHIVE = 20;

type AdminActions = {
  upsertPost: (post: Post) => void;
  deletePost: (slug: string) => void;
  setPostStatus: (slug: string, status: "draft" | "published") => void;
  addCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
  removeCategory: (name: string) => void;
  addTag: (name: string) => void;
  renameTag: (oldName: string, newName: string) => void;
  removeTag: (name: string) => void;
  upsertFriend: (friend: Friend, originalName?: string) => void;
  removeFriend: (name: string) => void;
  updateSettings: (s: Partial<SiteSettings>) => void;
  applySavedSettings: (s: SiteSettings) => void;
  suppressNextPersist: () => void;
  updateCloud: (c: Partial<CloudConfig>) => void;
  replaceState: (state: Partial<CoreData>) => void;
  resetAll: () => void;
  createSnapshot: (label: string, opts?: { actor?: string; auto?: boolean }) => Snapshot;
  restoreSnapshot: (id: string, opts?: { actor?: string }) => void;
  removeSnapshot: (id: string, opts?: { actor?: string }) => void;
  updateSchedule: (s: Partial<BackupSchedule>) => void;
  clearAudit: () => void;
  updateAI: (a: Partial<AIConfig>) => void;
  addMedia: (
    item: Omit<MediaItem, "id" | "uploadedAt"> & { id?: string; uploadedAt?: string },
  ) => MediaItem;
  removeMedia: (id: string) => void;
  recordAnalytics: (e: AnalyticsEvent) => void;
  addAlert: (a: Omit<AlertEntry, "id" | "at"> & { at?: string }) => void;
  ackAlert: (id: string) => void;
  clearAlerts: () => void;
  addNotifyReceipt: (r: Omit<NotifyReceipt, "id" | "at"> & { at?: string }) => void;
  clearNotifyReceipts: () => void;
  addMediaFailure: (f: Omit<MediaFailure, "id" | "at"> & { at?: string }) => void;
  removeMediaFailure: (id: string) => void;
  clearMediaFailures: () => void;
  archiveDiagnostics: (a: Omit<DiagnosticsArchive, "id" | "at"> & { at?: string }) => void;
  removeDiagnosticsArchive: (id: string) => void;
  clearDiagnosticsArchives: () => void;
  recordContactClick: (channel: string) => void;
  resetContactClicks: () => void;
};

const AdminContext = createContext<
  (AdminState & AdminActions & { hydrated: boolean; fullHydrated: boolean }) | null
>(null);

function coreFrom(s: AdminState): CoreData {
  return {
    posts: s.posts,
    categories: s.categories,
    tags: s.tags,
    friends: s.friends,
    settings: s.settings,
  };
}

export function AdminStoreProvider({
  children,
  initialState,
  enableAdminSync = true,
}: {
  children: ReactNode;
  initialState?: Partial<AdminState> | null;
  /** 只有后台路由需要认证与后台数据；前台开着它等于每页白发两个请求。 */
  enableAdminSync?: boolean;
}) {
  const [state, setState] = useState<AdminState>(() =>
    initialState
      ? {
          ...INITIAL_STATE,
          ...initialState,
          posts: (initialState.posts ?? INITIAL_STATE.posts).map(normalizePost),
          settings: {
            ...INITIAL_STATE.settings,
            ...(initialState.settings ?? {}),
            publicSite: normalizePublicSiteConfig(initialState.settings ?? {}),
          },
        }
      : INITIAL_STATE,
  );
  const [hydrated, setHydrated] = useState(false);
  const [fullHydrated, setFullHydrated] = useState(false);
  const adminSessionRef = useRef(false);
  const applyingRemoteRef = useRef(true);
  const skipPersistRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const mergeRemote = (parsed: Partial<AdminState>) => {
      if (cancelled) return;
      applyingRemoteRef.current = true;
      setState((s) => ({
        posts: (parsed.posts ?? s.posts).map(normalizePost),
        postCount: parsed.postCount ?? (parsed.posts ? parsed.posts.length : s.postCount),
        categories: parsed.categories ?? s.categories,
        tags: parsed.tags ?? s.tags,
        friends: parsed.friends ?? s.friends,
        settings: {
          ...s.settings,
          ...(parsed.settings ?? {}),
          publicSite: parsed.settings
            ? normalizePublicSiteConfig({ ...s.settings, ...parsed.settings })
            : s.settings.publicSite,
        },
        cloud: { ...s.cloud, ...(parsed.cloud ?? {}) },
        snapshots: parsed.snapshots ?? s.snapshots,
        audit: parsed.audit ?? s.audit,
        schedule: { ...s.schedule, ...(parsed.schedule ?? {}) },
        ai: { ...s.ai, ...(parsed.ai ?? {}) },
        media: parsed.media ?? s.media,
        analytics: parsed.analytics ?? s.analytics,
        alerts: parsed.alerts ?? s.alerts,
        notifyReceipts: parsed.notifyReceipts ?? s.notifyReceipts,
        mediaFailures: parsed.mediaFailures ?? s.mediaFailures,
        diagnosticsArchives: parsed.diagnosticsArchives ?? s.diagnosticsArchives,
        contactClicks: { ...s.contactClicks, ...(parsed.contactClicks ?? {}) },
        contactLastAt: { ...s.contactLastAt, ...(parsed.contactLastAt ?? {}) },
      }));
      // queueMicrotask 里的复位比 useEffect 先执行，光靠 applyingRemoteRef 挡不住
      // 水合后那一次 persist —— 每次进后台都会全量重写上千篇文章，把库写死。
      // 这里额外置一个跳过标记，由 persist effect 自己消费，时序确定。
      skipPersistRef.current = true;
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
    };

    if (enableAdminSync) {
      setHydrated(false);
      setFullHydrated(false);
      adminSessionRef.current = false;
    }

    // 前台页面到此为止：站点设置与友链已经随 SSR 的 initialState 下发过，
    // 再拉一次 loadPublicChrome 只是把同一份数据传两遍；认证状态更是只有后台用得上。
    // 这两个请求原来是串行的，读者打开任何一个前台页面都要多等它们跑完。
    if (!enableAdminSync) {
      setHydrated(true);
      setFullHydrated(true);
      return;
    }

    const load = async () => {
      try {
        const summary = await loadAdminSummaryState();
        adminSessionRef.current = true;
        mergeRemote(summary);
        if (!cancelled) setHydrated(true);

        // 首屏只等待摘要；完整文章、媒体和后台运维状态在页面可交互后并行回填。
        window.setTimeout(() => {
          if (cancelled) return;
          void Promise.all([loadAdminState(), loadAdminMediaState()])
            .then(([adminData, mediaData]) => {
              mergeRemote({ ...adminData, ...mediaData });
              if (!cancelled) setFullHydrated(true);
            })
            .catch((error) => {
              console.error("[TimeAmber] failed to load full admin state", error);
            });
        }, 250);
      } catch (error) {
        console.error("[TimeAmber] failed to load server state", error);
      } finally {
        if (!cancelled && !adminSessionRef.current) setHydrated(true);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [enableAdminSync]);

  useEffect(() => {
    if (!hydrated || !fullHydrated || !adminSessionRef.current || applyingRemoteRef.current) return;
    // 设置页已经通过 saveSiteSettings 单独写过库了，跳过这一次全量 persist。
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistAdminState({ data: { state } }).catch((error) => {
        console.error("[TimeAmber] failed to persist admin state", error);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state, hydrated, fullHydrated]);

  const upsertPost = useCallback((post: Post) => {
    const next = normalizePost(post);
    // 新建/编辑文章走单篇专用接口（单篇事务 upsert + 标签 + 分类），
    // 避免整库全删全建经隧道超时；同时抑制随后的全量 persist。
    applyingRemoteRef.current = true;
    setState((s) => {
      const idx = s.posts.findIndex((p) => p.slug === next.slug);
      const posts = [...s.posts];
      if (idx >= 0) posts[idx] = next;
      else posts.unshift(next);
      const categories = s.categories.some((c) => c.name === next.category)
        ? s.categories
        : [...s.categories, { name: next.category }];
      const existingTags = new Set(s.tags.map((t) => t.name));
      const tags = [...s.tags];
      for (const t of next.tags) {
        if (!existingTags.has(t)) tags.push({ name: t });
      }
      return { ...s, posts, categories, tags };
    });
    void upsertSinglePost({ data: { post: next } })
      .catch((error) => {
        console.error("[TimeAmber] failed to upsert post", error);
      })
      .finally(() => {
        applyingRemoteRef.current = false;
      });
  }, []);

  const deletePost = useCallback((slug: string) => {
    // 与 upsertPost / setPostStatus 同样走单篇接口：全量 persist 会重写整库，
    // 又慢又容易超时，删除常常没真正落库。这里同时抑制随后的全量 persist。
    applyingRemoteRef.current = true;
    setState((s) => ({ ...s, posts: s.posts.filter((p) => p.slug !== slug) }));
    void deletePostRow({ data: { slug } })
      .catch((error) => {
        console.error("[TimeAmber] failed to delete post", error);
      })
      .finally(() => {
        applyingRemoteRef.current = false;
      });
  }, []);

  const setPostStatus = useCallback((slug: string, status: "draft" | "published") => {
    // 发布状态改动走单篇专用接口（单行 UPDATE），避免整库全删全建经隧道超时；
    // 同时抑制随后的全量 persist，防止误触发 delete-all。
    applyingRemoteRef.current = true;
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => (p.slug === slug ? { ...p, status } : p)),
    }));
    void setPostPublished({
      data: { slug, published: status === "published" },
    })
      .catch((error) => {
        console.error("[TimeAmber] failed to set post status", error);
      })
      .finally(() => {
        applyingRemoteRef.current = false;
      });
  }, []);

  const addCategory = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setState((s) =>
      s.categories.some((c) => c.name === n)
        ? s
        : { ...s, categories: [...s.categories, { name: n }] },
    );
  }, []);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    const n = newName.trim();
    if (!n) return;
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.name === oldName ? { name: n } : c)),
      posts: s.posts.map((p) => (p.category === oldName ? { ...p, category: n } : p)),
    }));
  }, []);

  const removeCategory = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.name !== name),
    }));
  }, []);

  const addTag = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setState((s) =>
      s.tags.some((t) => t.name === n) ? s : { ...s, tags: [...s.tags, { name: n }] },
    );
  }, []);

  const renameTag = useCallback((oldName: string, newName: string) => {
    const n = newName.trim();
    if (!n) return;
    setState((s) => ({
      ...s,
      tags: s.tags.map((t) => (t.name === oldName ? { name: n } : t)),
      posts: s.posts.map((p) => ({
        ...p,
        tags: p.tags.map((x) => (x === oldName ? n : x)),
      })),
    }));
  }, []);

  const removeTag = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      tags: s.tags.filter((t) => t.name !== name),
      posts: s.posts.map((p) => ({ ...p, tags: p.tags.filter((x) => x !== name) })),
    }));
  }, []);

  const upsertFriend = useCallback((friend: Friend, originalName?: string) => {
    setState((s) => {
      const friends = [...s.friends];
      const key = originalName ?? friend.name;
      const idx = friends.findIndex((f) => f.name === key);
      if (idx >= 0) friends[idx] = friend;
      else friends.push(friend);
      return { ...s, friends };
    });
  }, []);

  const removeFriend = useCallback((name: string) => {
    setState((s) => ({ ...s, friends: s.friends.filter((f) => f.name !== name) }));
  }, []);

  const updateSettings = useCallback((patch: Partial<SiteSettings>) => {
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        ...patch,
        publicSite: patch.publicSite
          ? normalizePublicSiteConfig(patch.publicSite)
          : s.settings.publicSite,
      },
    }));
  }, []);

  // 设置页保存时已单独写好 app_config.site，这里只同步本地状态，
  // 并跳过随后的全量 persist（那会连带重写全部文章）。
  const applySavedSettings = useCallback((next: SiteSettings) => {
    skipPersistRef.current = true;
    setState((s) => ({
      ...s,
      settings: { ...next, publicSite: normalizePublicSiteConfig(next) },
    }));
  }, []);

  // 调用方已经用专用接口写过库了，跳过随后那次全量 persist。
  const suppressNextPersist = useCallback(() => {
    skipPersistRef.current = true;
  }, []);

  const updateCloud = useCallback((patch: Partial<CloudConfig>) => {
    setState((s) => ({ ...s, cloud: { ...s.cloud, ...patch } }));
  }, []);

  const replaceState = useCallback((next: Partial<CoreData>) => {
    setState((s) => ({
      ...s,
      posts: (next.posts ?? s.posts).map(normalizePost),
      categories: next.categories ?? s.categories,
      tags: next.tags ?? s.tags,
      friends: next.friends ?? s.friends,
      settings: {
        ...s.settings,
        ...(next.settings ?? {}),
        publicSite: next.settings
          ? normalizePublicSiteConfig({ ...s.settings, ...next.settings })
          : s.settings.publicSite,
      },
    }));
  }, []);

  const resetAll = useCallback(() => setState(INITIAL_STATE), []);

  const createSnapshot = useCallback((label: string, opts?: { actor?: string; auto?: boolean }) => {
    let created!: Snapshot;
    setState((s) => {
      const data = coreFrom(s);
      created = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        label: label.trim() || "手动快照",
        postCount: data.posts.length,
        data,
        auto: opts?.auto,
      };
      const retention = Math.max(1, s.schedule.retention || MAX_SNAPSHOTS);
      const cap = Math.min(MAX_SNAPSHOTS, retention);
      const snapshots = [created, ...s.snapshots].slice(0, cap);
      const audit: AuditEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-c`,
        at: new Date().toISOString(),
        actor: opts?.actor ?? "system",
        action: "create",
        snapshotId: created.id,
        snapshotLabel: created.label,
        detail: opts?.auto ? "自动" : "手动",
      };
      return { ...s, snapshots, audit: [audit, ...s.audit].slice(0, MAX_AUDIT) };
    });
    return created;
  }, []);

  const restoreSnapshot = useCallback((id: string, opts?: { actor?: string }) => {
    setState((s) => {
      const snap = s.snapshots.find((x) => x.id === id);
      if (!snap) return s;
      const audit: AuditEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-r`,
        at: new Date().toISOString(),
        actor: opts?.actor ?? "未知用户",
        action: "restore",
        snapshotId: snap.id,
        snapshotLabel: snap.label,
        detail: `回滚至 ${snap.postCount} 篇文章`,
      };
      return {
        ...s,
        posts: snap.data.posts.map(normalizePost),
        categories: snap.data.categories,
        tags: snap.data.tags,
        friends: snap.data.friends,
        settings: { ...s.settings, ...snap.data.settings },
        audit: [audit, ...s.audit].slice(0, MAX_AUDIT),
      };
    });
  }, []);

  const removeSnapshot = useCallback((id: string, opts?: { actor?: string }) => {
    setState((s) => {
      const snap = s.snapshots.find((x) => x.id === id);
      if (!snap) return s;
      const audit: AuditEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-d`,
        at: new Date().toISOString(),
        actor: opts?.actor ?? "未知用户",
        action: "delete",
        snapshotId: snap.id,
        snapshotLabel: snap.label,
      };
      return {
        ...s,
        snapshots: s.snapshots.filter((x) => x.id !== id),
        audit: [audit, ...s.audit].slice(0, MAX_AUDIT),
      };
    });
  }, []);

  const updateSchedule = useCallback((patch: Partial<BackupSchedule>) => {
    setState((s) => ({ ...s, schedule: { ...s.schedule, ...patch } }));
  }, []);

  const clearAudit = useCallback(() => {
    setState((s) => ({ ...s, audit: [] }));
  }, []);

  const updateAI = useCallback((patch: Partial<AIConfig>) => {
    setState((s) => ({ ...s, ai: { ...s.ai, ...patch } }));
  }, []);

  const addMedia = useCallback(
    (item: Omit<MediaItem, "id" | "uploadedAt"> & { id?: string; uploadedAt?: string }) => {
      const m: MediaItem = {
        id: item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: item.name,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        size: item.size,
        source: item.source,
        uploadedAt: item.uploadedAt ?? new Date().toISOString(),
      };
      setState((s) => ({ ...s, media: [m, ...s.media].slice(0, 500) }));
      return m;
    },
    [],
  );

  const removeMedia = useCallback((id: string) => {
    setState((s) => ({ ...s, media: s.media.filter((m) => m.id !== id) }));
  }, []);

  const recordAnalytics = useCallback((e: AnalyticsEvent) => {
    setState((s) => ({ ...s, analytics: [e, ...s.analytics].slice(0, MAX_ANALYTICS) }));
    void recordTelemetry({
      data: { type: "page_view", path: e.path, referrer: e.referrer },
    }).catch(() => {});
  }, []);

  const addAlert = useCallback((a: Omit<AlertEntry, "id" | "at"> & { at?: string }) => {
    const entry: AlertEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: a.at ?? new Date().toISOString(),
      level: a.level,
      source: a.source,
      message: a.message,
      acknowledged: false,
    };
    setState((s) => ({ ...s, alerts: [entry, ...s.alerts].slice(0, MAX_ALERTS) }));
  }, []);

  const ackAlert = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      alerts: s.alerts.map((x) => (x.id === id ? { ...x, acknowledged: true } : x)),
    }));
  }, []);

  const clearAlerts = useCallback(() => {
    setState((s) => ({ ...s, alerts: [] }));
  }, []);

  const addNotifyReceipt = useCallback((r: Omit<NotifyReceipt, "id" | "at"> & { at?: string }) => {
    const entry: NotifyReceipt = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: r.at ?? new Date().toISOString(),
      channel: r.channel,
      ok: r.ok,
      title: r.title,
      message: r.message,
    };
    setState((s) => ({ ...s, notifyReceipts: [entry, ...s.notifyReceipts].slice(0, 100) }));
  }, []);

  const clearNotifyReceipts = useCallback(() => {
    setState((s) => ({ ...s, notifyReceipts: [] }));
  }, []);

  const addMediaFailure = useCallback((f: Omit<MediaFailure, "id" | "at"> & { at?: string }) => {
    const entry: MediaFailure = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: f.at ?? new Date().toISOString(),
      name: f.name,
      size: f.size,
      contentType: f.contentType,
      attempts: f.attempts,
      error: f.error,
    };
    setState((s) => ({
      ...s,
      mediaFailures: [entry, ...s.mediaFailures].slice(0, MAX_MEDIA_FAIL),
    }));
  }, []);

  const removeMediaFailure = useCallback((id: string) => {
    setState((s) => ({ ...s, mediaFailures: s.mediaFailures.filter((x) => x.id !== id) }));
  }, []);

  const clearMediaFailures = useCallback(() => {
    setState((s) => ({ ...s, mediaFailures: [] }));
  }, []);

  const archiveDiagnostics = useCallback(
    (a: Omit<DiagnosticsArchive, "id" | "at"> & { at?: string }) => {
      const entry: DiagnosticsArchive = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: a.at ?? new Date().toISOString(),
        perfs: a.perfs,
        logs: a.logs,
        errorCount: a.errorCount,
        warnCount: a.warnCount,
        payload: a.payload,
      };
      setState((s) => ({
        ...s,
        diagnosticsArchives: [entry, ...s.diagnosticsArchives].slice(0, MAX_DIAG_ARCHIVE),
      }));
    },
    [],
  );

  const removeDiagnosticsArchive = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      diagnosticsArchives: s.diagnosticsArchives.filter((x) => x.id !== id),
    }));
  }, []);

  const clearDiagnosticsArchives = useCallback(() => {
    setState((s) => ({ ...s, diagnosticsArchives: [] }));
  }, []);

  const recordContactClick = useCallback((channel: string) => {
    const key = channel.trim();
    if (!key) return;
    setState((s) => ({
      ...s,
      contactClicks: { ...s.contactClicks, [key]: (s.contactClicks[key] ?? 0) + 1 },
      contactLastAt: { ...s.contactLastAt, [key]: new Date().toISOString() },
    }));
    void recordTelemetry({
      data: {
        type: "contact",
        channel: key,
        path: typeof window === "undefined" ? undefined : window.location.pathname,
      },
    }).catch(() => {});
  }, []);

  const resetContactClicks = useCallback(() => {
    setState((s) => ({ ...s, contactClicks: {}, contactLastAt: {} }));
  }, []);

  // Scheduled auto backup + retention pruning
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      setState((s) => {
        const { schedule } = s;
        let next = s;
        if (schedule.enabled) {
          const intervalMs =
            schedule.frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
          const last = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
          // 时区与执行窗口校验
          let inWindow = true;
          try {
            const hourStr = new Intl.DateTimeFormat("en-GB", {
              timeZone: schedule.timezone || "UTC",
              hour: "2-digit",
              hour12: false,
            }).format(new Date());
            const hour = Number(hourStr);
            const a = schedule.windowStart;
            const b = schedule.windowEnd;
            inWindow = a <= b ? hour >= a && hour <= b : hour >= a || hour <= b;
          } catch {
            inWindow = true;
          }
          if (inWindow && Date.now() - last >= intervalMs) {
            const data = coreFrom(s);
            const snap: Snapshot = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
              label: `自动${schedule.frequency === "daily" ? "每日" : "每周"}备份`,
              postCount: data.posts.length,
              data,
              auto: true,
            };
            const audit: AuditEntry = {
              id: `${snap.id}-a`,
              at: snap.createdAt,
              actor: "scheduler",
              action: "create",
              snapshotId: snap.id,
              snapshotLabel: snap.label,
              detail: "计划任务",
            };
            next = {
              ...s,
              snapshots: [snap, ...s.snapshots],
              schedule: { ...schedule, lastRunAt: snap.createdAt },
              audit: [audit, ...s.audit].slice(0, MAX_AUDIT),
            };
          }
        }
        // Retention prune
        const retention = Math.max(
          1,
          Math.min(MAX_SNAPSHOTS, next.schedule.retention || MAX_SNAPSHOTS),
        );
        if (next.snapshots.length > retention) {
          const kept = next.snapshots.slice(0, retention);
          const dropped = next.snapshots.length - kept.length;
          const audit: AuditEntry = {
            id: `${Date.now()}-prune`,
            at: new Date().toISOString(),
            actor: "scheduler",
            action: "prune",
            detail: `按保留策略清理 ${dropped} 份旧快照`,
          };
          next = { ...next, snapshots: kept, audit: [audit, ...next.audit].slice(0, MAX_AUDIT) };
        }
        return next;
      });
    };
    tick();
    const t = setInterval(tick, 60 * 60 * 1000); // hourly
    return () => clearInterval(t);
  }, [hydrated]);

  const value = useMemo(
    () => ({
      ...state,
      hydrated,
      fullHydrated,
      upsertPost,
      deletePost,
      setPostStatus,
      addCategory,
      renameCategory,
      removeCategory,
      addTag,
      renameTag,
      removeTag,
      upsertFriend,
      removeFriend,
      updateSettings,
      applySavedSettings,
      suppressNextPersist,
      updateCloud,
      replaceState,
      resetAll,
      createSnapshot,
      restoreSnapshot,
      removeSnapshot,
      updateSchedule,
      clearAudit,
      updateAI,
      addMedia,
      removeMedia,
      recordAnalytics,
      addAlert,
      ackAlert,
      clearAlerts,
      addNotifyReceipt,
      clearNotifyReceipts,
      addMediaFailure,
      removeMediaFailure,
      clearMediaFailures,
      archiveDiagnostics,
      removeDiagnosticsArchive,
      clearDiagnosticsArchives,
      recordContactClick,
      resetContactClicks,
    }),
    [
      state,
      hydrated,
      fullHydrated,
      upsertPost,
      deletePost,
      setPostStatus,
      addCategory,
      renameCategory,
      removeCategory,
      addTag,
      renameTag,
      removeTag,
      upsertFriend,
      removeFriend,
      updateSettings,
      applySavedSettings,
      suppressNextPersist,
      updateCloud,
      replaceState,
      resetAll,
      createSnapshot,
      restoreSnapshot,
      removeSnapshot,
      updateSchedule,
      clearAudit,
      updateAI,
      addMedia,
      removeMedia,
      recordAnalytics,
      addAlert,
      ackAlert,
      clearAlerts,
      addNotifyReceipt,
      clearNotifyReceipts,
      addMediaFailure,
      removeMediaFailure,
      clearMediaFailures,
      archiveDiagnostics,
      removeDiagnosticsArchive,
      clearDiagnosticsArchives,
      recordContactClick,
      resetContactClicks,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminStore() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdminStore must be used within AdminStoreProvider");
  }
  return ctx;
}
