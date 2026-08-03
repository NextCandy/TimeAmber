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
  /** æ¸ é“æ˜¯å¦ä»¥äºŒç»´ç å¼¹å±‚æ–¹å¼å‘ˆç°ï¼ˆkey ä¸ºæ¸ é“ keyï¼Œå¦‚ wechat/qq/xiaohongshu/douyinï¼‰ */
  contactQR?: Record<string, boolean>;
  /** GitHub ä»“åº“ï¼ˆowner/name æˆ–å®Œæ•´ URLï¼‰ï¼Œç”¨äºã€ŒåŒæ­¥çŠ¶æ€ã€é¢æ¿ */
  githubRepo?: string;
  /** GitHub åˆ†æ”¯ï¼ˆç•™ç©ºä½¿ç”¨é»˜è®¤åˆ†æ”¯ï¼‰ */
  githubBranch?: string;
  /** æ˜¯å¦æŠŠç«™å†… AI é—®ç­”å¼€æ”¾åˆ°å‰å° /askã€‚é»˜è®¤å…³é—­ â€”â€” å¼€æ”¾åæ¯æ¬¡æé—®éƒ½æ¶ˆè€— AI_API_KEYã€‚ */
  askPublicEnabled?: boolean;
};

/** å…¬å¼€é¡µé¢å…è®¸è¿›å…¥ root hydration çš„ç«™ç‚¹å­—æ®µç™½åå•ã€‚ */
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
  >
>;

export type ImageHostConfig = {
  provider: "supabase" | "see" | "smms" | "custom";
  endpoint: string;
  token: string;
  label?: string;
};

export type NotifyConfig = {
  autoPush?: boolean; // è‡ªåŠ¨æ¨é€ error çº§åˆ«å‘Šè­¦
  autoPushLevel?: "error" | "warning"; // è§¦å‘çº§åˆ«é˜ˆå€¼ï¼ˆé»˜è®¤ errorï¼‰
  dedup?: {
    enabled?: boolean;
    windowSec?: number; // åŒ key èŠ‚æµçª—å£ï¼ˆç§’ï¼‰ï¼Œé»˜è®¤ 600
    maxPerKey?: number; // çª—å£å†…å• key æœ€å¤§æ¨é€æ¬¡æ•°ï¼Œé»˜è®¤ 1
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
  siteTagline: "æ—¶å…‰ç¥ç€",
  siteDescription: "æ—¶å…‰æˆç€ï¼Œå­—å­—å¦‚åˆã€‚",
  aboutIntro:
    "TimeAmberï¼Œä¸­æ–‡åã€Œæ—¶å…‰ç¥ç€ã€ã€‚è¿™é‡Œå­˜æ”¾æˆ‘åœ¨äº’è”ç½‘ä¸Šè¯»åˆ°çš„ã€å€¼å¾—å°å­˜ä¸‹æ¥çš„ä¸œè¥¿ â€”â€” å‰ªè—ã€ç¬”è®°ã€è‡ªå»ºæœåŠ¡çš„è¸©å‘è®°å½•ï¼Œä»¥åŠä¸€äº›å…³äº AI Agent çš„å·¥ç¨‹å®è·µã€‚",
  aboutQuote: "æ—¶å…‰æˆç€ï¼Œå­—å­—å¦‚åˆã€‚",
  aboutTechStack:
    "å‰ç«¯ï¼šReact 19 + Vite + Tailwind CSS v4 + shadcn/ui\nåç«¯ï¼šHono + Drizzle ORM + PostgreSQL 16\néƒ¨ç½²ï¼šDockerï¼Œè¿è¡Œåœ¨å®¶é‡Œçš„å°æœåŠ¡å™¨ä¸Š\nå‰ªè—æ¥æºï¼šè‡ªå»ºçš„ VS.DO æœåŠ¡ï¼Œå®šæ—¶åŒæ­¥",
  contactEmail: "hi@timeamber.com",
  contactGithub: "https://github.com/NextCandy/TimeAmber",
  contactTwitter: "",
  contactTelegram: "",
  contactX: "",
  contactWechat: "",
  contactQQ: "",
  contactXiaohongshu: "",
  contactDouyin: "",
  contactNote: "å¦‚æœä½ æƒ³äº¤æ¢å‹é“¾ï¼Œæˆ–è€…åªæ˜¯æƒ³è¯´å¥è¯ï¼Œé‚®ä»¶æ˜¯æœ€ç¨³çš„æ–¹å¼ã€‚",
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
  /** åªæœ‰åå°è·¯ç”±éœ€è¦è®¤è¯ä¸åå°æ•°æ®ï¼›å‰å°å¼€ç€å®ƒç­‰äºæ¯é¡µç™½å‘ä¸¤ä¸ªè¯·æ±‚ã€‚ */
  enableAdminSync?: boolean;
}) {
  const [state, setState] = useState<AdminState>(() =>
    initialState
      ? {
          ...INITIAL_STATE,
          ...initialState,
          posts: (initialState.posts ?? INITIAL_STATE.posts).map(normalizePost),
          settings: { ...INITIAL_STATE.settings, ...(initialState.settings ?? {}) },
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
        settings: { ...s.settings, ...(parsed.settings ?? {}) },
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
      // queueMicrotask é‡Œçš„å¤ä½æ¯” useEffect å…ˆæ‰§è¡Œï¼Œå…‰é  applyingRemoteRef æŒ¡ä¸ä½
      // æ°´åˆåé‚£ä¸€æ¬¡ persist â€”â€” æ¯æ¬¡è¿›åå°éƒ½ä¼šå…¨é‡é‡å†™ä¸Šåƒç¯‡æ–‡ç« ï¼ŒæŠŠåº“å†™æ­»ã€‚
      // è¿™é‡Œé¢å¤–ç½®ä¸€ä¸ªè·³è¿‡æ ‡è®°ï¼Œç”± persist effect è‡ªå·±æ¶ˆè´¹ï¼Œæ—¶åºç¡®å®šã€‚
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

    // å‰å°é¡µé¢åˆ°æ­¤ä¸ºæ­¢ï¼šç«™ç‚¹è®¾ç½®ä¸å‹é“¾å·²ç»éš SSR çš„ initialState ä¸‹å‘è¿‡ï¼Œ
    // å†æ‹‰ä¸€æ¬¡ loadPublicChrome åªæ˜¯æŠŠåŒä¸€ä»½æ•°æ®ä¼ ä¸¤éï¼›è®¤è¯çŠ¶æ€æ›´æ˜¯åªæœ‰åå°ç”¨å¾—ä¸Šã€‚
    // è¿™ä¸¤ä¸ªè¯·æ±‚åŸæ¥æ˜¯ä¸²è¡Œçš„ï¼Œè¯»è€…æ‰“å¼€ä»»ä½•ä¸€ä¸ªå‰å°é¡µé¢éƒ½è¦å¤šç­‰å®ƒä»¬è·‘å®Œã€‚
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

        // é¦–å±åªç­‰å¾…æ‘˜è¦ï¼›å®Œæ•´æ–‡ç« ã€åª’ä½“å’Œåå°è¿ç»´çŠ¶æ€åœ¨é¡µé¢å¯äº¤äº’åå¹¶è¡Œå›å¡«ã€‚
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
    void load();×Ÿx¶‰ËkºwµçtøĞ¹¹…µ”€„ôô¹…µ”¤°4(€€€€€Á½ÍÑÌèÌ¹Á½ÍÑÌ¹µ…À ¡À¤€ôø€¡ì€¸¸¹À°Ñ…ÌèÀ¹Ñ…Ì¹™¥±Ñ•È ¡à¤€ôøà€„ôô¹…µ”¤ô¤¤°4(€€€ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÕÁÍ•ÉÑÉ¥•¹€ôÕÍ•…±±‰…¬ ¡™É¥•¹èÉ¥•¹°½É¥¥¹…±9…µ”üèÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôøì4(€€€€€½¹ÍĞ™É¥•¹‘Ì€ôl¸¸¹Ì¹™É¥•¹‘Ítì4(€€€€€½¹ÍĞ­•ä€ô½É¥¥¹…±9…µ”€üü™É¥•¹¹¹…µ”ì4(€€€€€½¹ÍĞ¥‘à€ô™É¥•¹‘Ì¹™¥¹‘%¹‘•à ¡˜¤€ôø˜¹¹…µ”€ôôô­•ä¤ì4(€€€€€¥˜€¡¥‘à€øô€À¤™É¥•¹‘Ím¥‘át€ô™É¥•¹ì4(€€€€€•±Í”™É¥•¹‘Ì¹ÁÕÍ ¡™É¥•¹¤ì4(€€€€€É•ÑÕÉ¸ì€¸¸¹Ì°™É¥•¹‘Ìôì4(€€€ô¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•µ½Ù•É¥•¹€ôÕÍ•…±±‰…¬ ¡¹…µ”èÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°™É¥•¹‘ÌèÌ¹™É¥•¹‘Ì¹™¥±Ñ•È ¡˜¤€ôø˜¹¹…µ”€„ôô¹…µ”¤ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÕÁ‘…Ñ•M•ÑÑ¥¹Ì€ôÕÍ•…±±‰…¬ ¡Á…Ñ èA…ÉÑ¥…°ñM¥Ñ•M•ÑÑ¥¹Ìø¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°Í•ÑÑ¥¹Ìèì€¸¸¹Ì¹Í•ÑÑ¥¹Ì°€¸¸¹Á…Ñ ôô¤¤ì4(€ô°mt¤ì4(4(€€¼¼ƒ¢ºûö»¦†×’şw–¶cš^Û–ŞË–6W.³–g––ô…ÁÁ}½¹™¥œ¹Í¥Ñ—¾ò3¢şg¦3–>«–B3š¶—šr³–rÃ*Ûš¾ò04(€€¼¼ƒ–æÛ¢ŞÏ¢ş¦j?–B;j–£¦<Á•ÉÍ¥ÍÓ¾ò#¦
’òk¢ş{–â›¦7–g–£¦£šZ®ƒ¾ò'4(€½¹ÍĞ…ÁÁ±åM…Ù•‘M•ÑÑ¥¹Ì€ôÕÍ•…±±‰…¬ ¡¹•áĞèM¥Ñ•M•ÑÑ¥¹Ì¤€ôøì4(€€€Í­¥ÁA•ÉÍ¥ÍÑI•˜¹ÕÉÉ•¹Ğ€ôÑÉÕ”ì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°Í•ÑÑ¥¹Ìè¹•áĞô¤¤ì4(€ô°mt¤ì4(4(€€¼¼ƒ¢ÂR£šZç–ŞËî?R£’âOR£š:—–>–g¢ş–êO’ê¾ò3¢ŞÏ¢ş¦j?–B;¦
š²‡–£¦<Á•ÉÍ¥ÍÓ4(€½¹ÍĞÍÕÁÁÉ•ÍÍ9•áÑA•ÉÍ¥ÍĞ€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í­¥ÁA•ÉÍ¥ÍÑI•˜¹ÕÉÉ•¹Ğ€ôÑÉÕ”ì4(€ô°mt¤ì4(4(€½¹ÍĞÕÁ‘…Ñ•±½Õ€ôÕÍ•…±±‰…¬ ¡Á…Ñ èA…ÉÑ¥…°ñ±½Õ‘½¹™¥œø¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°±½Õèì€¸¸¹Ì¹±½Õ°€¸¸¹Á…Ñ ôô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•Á±…•MÑ…Ñ”€ôÕÍ•…±±‰…¬ ¡¹•áĞèA…ÉÑ¥…°ñ½É•…Ñ„ø¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€¸¸¹Ì°4(€€€€€Á½ÍÑÌè€¡¹•áĞ¹Á½ÍÑÌ€üüÌ¹Á½ÍÑÌ¤¹µ…À¡¹½Éµ…±¥é•A½ÍĞ¤°4(€€€€€…Ñ•½É¥•Ìè¹•áĞ¹…Ñ•½É¥•Ì€üüÌ¹…Ñ•½É¥•Ì°4(€€€€€Ñ…Ìè¹•áĞ¹Ñ…Ì€üüÌ¹Ñ…Ì°4(€€€€€™É¥•¹‘Ìè¹•áĞ¹™É¥•¹‘Ì€üüÌ¹™É¥•¹‘Ì°4(€€€€€Í•ÑÑ¥¹Ìèì€¸¸¹Ì¹Í•ÑÑ¥¹Ì°€¸¸¸¡¹•áĞ¹Í•ÑÑ¥¹Ì€üüíô¤ô°4(€€€ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•Í•Ñ±°€ôÕÍ•…±±‰…¬  ¤€ôøÍ•ÑMÑ…Ñ”¡%9%Q%1}MQQ¤°mt¤ì4(4(€½¹ÍĞÉ•…Ñ•M¹…ÁÍ¡½Ğ€ôÕÍ•…±±‰…¬ ¡±…‰•°èÍÑÉ¥¹œ°½ÁÑÌüèì…Ñ½ÈüèÍÑÉ¥¹œì…ÕÑ¼üè‰½½±•…¸ô¤€ôøì4(€€€±•ĞÉ•…Ñ•„èM¹…ÁÍ¡½Ğì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôøì4(€€€€€½¹ÍĞ‘…Ñ„€ô½É•É½´¡Ì¤ì4(€€€€€É•…Ñ•€ôì4(€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€€€É•…Ñ•‘Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€±…‰•°è±…‰•°¹ÑÉ¥´ ¤ñğ€‹š&/–*£–ş¯œˆ°4(€€€€€€€Á½ÍÑ½Õ¹Ğè‘…Ñ„¹Á½ÍÑÌ¹±•¹Ñ °4(€€€€€€€‘…Ñ„°4(€€€€€€€…ÕÑ¼è½ÁÑÌü¹…ÕÑ¼°4(€€€€€ôì4(€€€€€½¹ÍĞÉ•Ñ•¹Ñ¥½¸€ô5…Ñ ¹µ…à Ä°Ì¹Í¡•‘Õ±”¹É•Ñ•¹Ñ¥½¸ñğ5a}M9AM!=QL¤ì4(€€€€€½¹ÍĞ…À€ô5…Ñ ¹µ¥¸¡5a}M9AM!=QL°É•Ñ•¹Ñ¥½¸¤ì4(€€€€€½¹ÍĞÍ¹…ÁÍ¡½ÑÌ€ômÉ•…Ñ•°€¸¸¹Ì¹Í¹…ÁÍ¡½ÑÍt¹Í±¥” À°…À¤ì4(€€€€€½¹ÍĞ…Õ‘¥ĞèÕ‘¥Ñ¹ÑÉä€ôì4(€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥ôµ€°4(€€€€€€€…Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€…Ñ½Èè½ÁÑÌü¹…Ñ½È€üü€‰ÍåÍÑ•´ˆ°4(€€€€€€€…Ñ¥½¸è€‰É•…Ñ”ˆ°4(€€€€€€€Í¹…ÁÍ¡½Ñ%èÉ•…Ñ•¹¥°4(€€€€€€€Í¹…ÁÍ¡½Ñ1…‰•°èÉ•…Ñ•¹±…‰•°°4(€€€€€€€‘•Ñ…¥°è½ÁÑÌü¹…ÕÑ¼€ü€‹¢«–* ˆ€è€‹š&/–* ˆ°4(€€€€€ôì4(€€€€€É•ÑÕÉ¸ì€¸¸¹Ì°Í¹…ÁÍ¡½ÑÌ°…Õ‘¥Ğèm…Õ‘¥Ğ°€¸¸¹Ì¹…Õ‘¥Ñt¹Í±¥” À°5a}U%P¤ôì4(€€€ô¤ì4(€€€É•ÑÕÉ¸É•…Ñ•ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•ÍÑ½É•M¹…ÁÍ¡½Ğ€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ°½ÁÑÌüèì…Ñ½ÈüèÍÑÉ¥¹œô¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôøì4(€€€€€½¹ÍĞÍ¹…À€ôÌ¹Í¹…ÁÍ¡½ÑÌ¹™¥¹ ¡à¤€ôøà¹¥€ôôô¥¤ì4(€€€€€¥˜€ …Í¹…À¤É•ÑÕÉ¸Ìì4(€€€€€½¹ÍĞ…Õ‘¥ĞèÕ‘¥Ñ¹ÑÉä€ôì4(€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥ôµÉ€°4(€€€€€€€…Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€…Ñ½Èè½ÁÑÌü¹…Ñ½È€üü€‹šr«~—R£š"Üˆ°4(€€€€€€€…Ñ¥½¸è€‰É•ÍÑ½É”ˆ°4(€€€€€€€Í¹…ÁÍ¡½Ñ%èÍ¹…À¹¥°4(€€€€€€€Í¹…ÁÍ¡½Ñ1…‰•°èÍ¹…À¹±…‰•°°4(€€€€€€€‘•Ñ…¥°èƒ–n{šîk¢Ì€‘íÍ¹…À¹Á½ÍÑ½Õ¹Ñôƒ¾šZ®€°4(€€€€€ôì4(€€€€€É•ÑÕÉ¸ì4(€€€€€€€€¸¸¹Ì°4(€€€€€€€Á½ÍÑÌèÍ¹…À¹‘…Ñ„¹Á½ÍÑÌ¹µ…À¡¹½Éµ…±¥é•A½ÍĞ¤°4(€€€€€€€…Ñ•½É¥•ÌèÍ¹…À¹‘…Ñ„¹…Ñ•½É¥•Ì°4(€€€€€€€Ñ…ÌèÍ¹…À¹‘…Ñ„¹Ñ…Ì°4(€€€€€€€™É¥•¹‘ÌèÍ¹…À¹‘…Ñ„¹™É¥•¹‘Ì°4(€€€€€€€Í•ÑÑ¥¹Ìèì€¸¸¹Ì¹Í•ÑÑ¥¹Ì°€¸¸¹Í¹…À¹‘…Ñ„¹Í•ÑÑ¥¹Ìô°4(€€€€€€€…Õ‘¥Ğèm…Õ‘¥Ğ°€¸¸¹Ì¹…Õ‘¥Ñt¹Í±¥” À°5a}U%P¤°4(€€€€€ôì4(€€€ô¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•µ½Ù•M¹…ÁÍ¡½Ğ€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ°½ÁÑÌüèì…Ñ½ÈüèÍÑÉ¥¹œô¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôøì4(€€€€€½¹ÍĞÍ¹…À€ôÌ¹Í¹…ÁÍ¡½ÑÌ¹™¥¹ ¡à¤€ôøà¹¥€ôôô¥¤ì4(€€€€€¥˜€ …Í¹…À¤É•ÑÕÉ¸Ìì4(€€€€€½¹ÍĞ…Õ‘¥ĞèÕ‘¥Ñ¹ÑÉä€ôì4(€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥ôµ‘€°4(€€€€€€€…Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€…Ñ½Èè½ÁÑÌü¹…Ñ½È€üü€‹šr«~—R£š"Üˆ°4(€€€€€€€…Ñ¥½¸è€‰‘•±•Ñ”ˆ°4(€€€€€€€Í¹…ÁÍ¡½Ñ%èÍ¹…À¹¥°4(€€€€€€€Í¹…ÁÍ¡½Ñ1…‰•°èÍ¹…À¹±…‰•°°4(€€€€€ôì4(€€€€€É•ÑÕÉ¸ì4(€€€€€€€€¸¸¹Ì°4(€€€€€€€Í¹…ÁÍ¡½ÑÌèÌ¹Í¹…ÁÍ¡½ÑÌ¹™¥±Ñ•È ¡à¤€ôøà¹¥€„ôô¥¤°4(€€€€€€€…Õ‘¥Ğèm…Õ‘¥Ğ°€¸¸¹Ì¹…Õ‘¥Ñt¹Í±¥” À°5a}U%P¤°4(€€€€€ôì4(€€€ô¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÕÁ‘…Ñ•M¡•‘Õ±”€ôÕÍ•…±±‰…¬ ¡Á…Ñ èA…ÉÑ¥…°ñ	…­ÕÁM¡•‘Õ±”ø¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°Í¡•‘Õ±”èì€¸¸¹Ì¹Í¡•‘Õ±”°€¸¸¹Á…Ñ ôô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ±•…ÉÕ‘¥Ğ€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°…Õ‘¥Ğèmtô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÕÁ‘…Ñ•$€ôÕÍ•…±±‰…¬ ¡Á…Ñ èA…ÉÑ¥…°ñ%½¹™¥œø¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°…¤èì€¸¸¹Ì¹…¤°€¸¸¹Á…Ñ ôô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…‘‘5•‘¥„€ôÕÍ•…±±‰…¬ 4(€€€€¡¥Ñ•´è=µ¥Ğñ5•‘¥…%Ñ•´°€‰¥ˆğ€‰ÕÁ±½…‘•‘Ğˆø€˜ì¥üèÍÑÉ¥¹œìÕÁ±½…‘•‘ĞüèÍÑÉ¥¹œô¤€ôøì4(€€€€€½¹ÍĞ´è5•‘¥…%Ñ•´€ôì(€€€€€€€¥è¥Ñ•´¹¥€üü€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€€€¹…µ”è¥Ñ•´¹¹…µ”°4(€€€€€€€ÕÉ°è¥Ñ•´¹ÕÉ°°(€€€€€€€Ñ¡Õµ‰¹…¥±UÉ°è¥Ñ•´¹Ñ¡Õµ‰¹…¥±UÉ°°(€€€€€€€Í¥é”è¥Ñ•´¹Í¥é”°4(€€€€€€€Í½ÕÉ”è¥Ñ•´¹Í½ÕÉ”°4(€€€€€€€ÕÁ±½…‘•‘Ğè¥Ñ•´¹ÕÁ±½…‘•‘Ğ€üü¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€ôì4(€€€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°µ•‘¥„èm´°€¸¸¹Ì¹µ•‘¥…t¹Í±¥” À°€ÔÀÀ¤ô¤¤ì4(€€€€€É•ÑÕÉ¸´ì4(€€€ô°4(€€€mt°4(€€¤ì4(4(€½¹ÍĞÉ•µ½Ù•5•‘¥„€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°µ•‘¥„èÌ¹µ•‘¥„¹™¥±Ñ•È ¡´¤€ôø´¹¥€„ôô¥¤ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•½É‘¹…±åÑ¥Ì€ôÕÍ•…±±‰…¬ ¡”è¹…±åÑ¥ÍÙ•¹Ğ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°…¹…±åÑ¥Ìèm”°€¸¸¹Ì¹…¹…±åÑ¥Ít¹Í±¥” À°5a}91eQ%L¤ô¤¤ì4(€€€Ù½¥É•½É‘Q•±•µ•ÑÉä¡ì4(€€€€€‘…Ñ„èìÑåÁ”è€‰Á…•}Ù¥•Üˆ°Á…Ñ è”¹Á…Ñ °É•™•ÉÉ•Èè”¹É•™•ÉÉ•Èô°4(€€€ô¤¹…Ñ   ¤€ôøíô¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…‘‘±•ÉĞ€ôÕÍ•…±±‰…¬ ¡„è=µ¥Ğñ±•ÉÑ¹ÑÉä°€‰¥ˆğ€‰…Ğˆø€˜ì…ĞüèÍÑÉ¥¹œô¤€ôøì4(€€€½¹ÍĞ•¹ÑÉäè±•ÉÑ¹ÑÉä€ôì4(€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€…Ğè„¹…Ğ€üü¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€±•Ù•°è„¹±•Ù•°°4(€€€€€Í½ÕÉ”è„¹Í½ÕÉ”°4(€€€€€µ•ÍÍ…”è„¹µ•ÍÍ…”°4(€€€€€…­¹½İ±•‘•è™…±Í”°4(€€€ôì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°…±•ÉÑÌèm•¹ÑÉä°€¸¸¹Ì¹…±•ÉÑÍt¹Í±¥” À°5a}1IQL¤ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…­±•ÉĞ€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€¸¸¹Ì°4(€€€€€…±•ÉÑÌèÌ¹…±•ÉÑÌ¹µ…À ¡à¤€ôø€¡à¹¥€ôôô¥€üì€¸¸¹à°…­¹½İ±•‘•èÑÉÕ”ô€èà¤¤°4(€€€ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ±•…É±•ÉÑÌ€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°…±•ÉÑÌèmtô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…‘‘9½Ñ¥™åI••¥ÁĞ€ôÕÍ•…±±‰…¬ ¡Èè=µ¥Ğñ9½Ñ¥™åI••¥ÁĞ°€‰¥ˆğ€‰…Ğˆø€˜ì…ĞüèÍÑÉ¥¹œô¤€ôøì4(€€€½¹ÍĞ•¹ÑÉäè9½Ñ¥™åI••¥ÁĞ€ôì4(€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€…ĞèÈ¹…Ğ€üü¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€¡…¹¹•°èÈ¹¡…¹¹•°°4(€€€€€½¬èÈ¹½¬°4(€€€€€Ñ¥Ñ±”èÈ¹Ñ¥Ñ±”°4(€€€€€µ•ÍÍ…”èÈ¹µ•ÍÍ…”°4(€€€ôì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°¹½Ñ¥™åI••¥ÁÑÌèm•¹ÑÉä°€¸¸¹Ì¹¹½Ñ¥™åI••¥ÁÑÍt¹Í±¥” À°€ÄÀÀ¤ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ±•…É9½Ñ¥™åI••¥ÁÑÌ€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°¹½Ñ¥™åI••¥ÁÑÌèmtô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…‘‘5•‘¥……¥±ÕÉ”€ôÕÍ•…±±‰…¬ ¡˜è=µ¥Ğñ5•‘¥……¥±ÕÉ”°€‰¥ˆğ€‰…Ğˆø€˜ì…ĞüèÍÑÉ¥¹œô¤€ôøì4(€€€½¹ÍĞ•¹ÑÉäè5•‘¥……¥±ÕÉ”€ôì4(€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€…Ğè˜¹…Ğ€üü¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€¹…µ”è˜¹¹…µ”°4(€€€€€Í¥é”è˜¹Í¥é”°4(€€€€€½¹Ñ•¹ÑQåÁ”è˜¹½¹Ñ•¹ÑQåÁ”°4(€€€€€…ÑÑ•µÁÑÌè˜¹…ÑÑ•µÁÑÌ°4(€€€€€•ÉÉ½Èè˜¹•ÉÉ½È°4(€€€ôì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€¸¸¹Ì°4(€€€€€µ•‘¥……¥±ÕÉ•Ìèm•¹ÑÉä°€¸¸¹Ì¹µ•‘¥……¥±ÕÉ•Ít¹Í±¥” À°5a}5%}%0¤°4(€€€ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•µ½Ù•5•‘¥……¥±ÕÉ”€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°µ•‘¥……¥±ÕÉ•ÌèÌ¹µ•‘¥……¥±ÕÉ•Ì¹™¥±Ñ•È ¡à¤€ôøà¹¥€„ôô¥¤ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ±•…É5•‘¥……¥±ÕÉ•Ì€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°µ•‘¥……¥±ÕÉ•Ìèmtô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ…É¡¥Ù•¥…¹½ÍÑ¥Ì€ôÕÍ•…±±‰…¬ 4(€€€€¡„è=µ¥Ğñ¥…¹½ÍÑ¥ÍÉ¡¥Ù”°€‰¥ˆğ€‰…Ğˆø€˜ì…ĞüèÍÑÉ¥¹œô¤€ôøì4(€€€€€½¹ÍĞ•¹ÑÉäè¥…¹½ÍÑ¥ÍÉ¡¥Ù”€ôì4(€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€€€…Ğè„¹…Ğ€üü¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€Á•É™Ìè„¹Á•É™Ì°4(€€€€€€€±½Ìè„¹±½Ì°4(€€€€€€€•ÉÉ½É½Õ¹Ğè„¹•ÉÉ½É½Õ¹Ğ°4(€€€€€€€İ…É¹½Õ¹Ğè„¹İ…É¹½Õ¹Ğ°4(€€€€€€€Á…å±½…è„¹Á…å±½…°4(€€€€€ôì4(€€€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€€€¸¸¹Ì°4(€€€€€€€‘¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ìèm•¹ÑÉä°€¸¸¹Ì¹‘¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ít¹Í±¥” À°5a}%}I!%Y¤°4(€€€€€ô¤¤ì4(€€€ô°4(€€€mt°4(€€¤ì4(4(€½¹ÍĞÉ•µ½Ù•¥…¹½ÍÑ¥ÍÉ¡¥Ù”€ôÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€¸¸¹Ì°4(€€€€€‘¥…¹½ÍÑ¥ÍÉ¡¥Ù•ÌèÌ¹‘¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ì¹™¥±Ñ•È ¡à¤€ôøà¹¥€„ôô¥¤°4(€€€ô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞ±•…É¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ì€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°‘¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ìèmtô¤¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•½É‘½¹Ñ…Ñ±¥¬€ôÕÍ•…±±‰…¬ ¡¡…¹¹•°èÍÑÉ¥¹œ¤€ôøì4(€€€½¹ÍĞ­•ä€ô¡…¹¹•°¹ÑÉ¥´ ¤ì4(€€€¥˜€ …­•ä¤É•ÑÕÉ¸ì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì4(€€€€€€¸¸¹Ì°4(€€€€€½¹Ñ…Ñ±¥­Ìèì€¸¸¹Ì¹½¹Ñ…Ñ±¥­Ì°m­•åtè€¡Ì¹½¹Ñ…Ñ±¥­Ím­•åt€üü€À¤€¬€Äô°4(€€€€€½¹Ñ…Ñ1…ÍÑĞèì€¸¸¹Ì¹½¹Ñ…Ñ1…ÍÑĞ°m­•åtè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ô°4(€€€ô¤¤ì4(€€€Ù½¥É•½É‘Q•±•µ•ÑÉä¡ì4(€€€€€‘…Ñ„èì4(€€€€€€€ÑåÁ”è€‰½¹Ñ…Ğˆ°4(€€€€€€€¡…¹¹•°è­•ä°4(€€€€€€€Á…Ñ èÑåÁ•½˜İ¥¹‘½Ü€ôôô€‰Õ¹‘•™¥¹•ˆ€üÕ¹‘•™¥¹•€èİ¥¹‘½Ü¹±½…Ñ¥½¸¹Á…Ñ¡¹…µ”°4(€€€€€ô°4(€€€ô¤¹…Ñ   ¤€ôøíô¤ì4(€ô°mt¤ì4(4(€½¹ÍĞÉ•Í•Ñ½¹Ñ…Ñ±¥­Ì€ôÕÍ•…±±‰…¬  ¤€ôøì4(€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôø€¡ì€¸¸¹Ì°½¹Ñ…Ñ±¥­Ìèíô°½¹Ñ…Ñ1…ÍÑĞèíôô¤¤ì4(€ô°mt¤ì4(4(€€¼¼M¡•‘Õ±•…ÕÑ¼‰…­ÕÀ€¬É•Ñ•¹Ñ¥½¸ÁÉÕ¹¥¹œ4(€ÕÍ•™™•Ğ  ¤€ôøì4(€€€¥˜€ …¡å‘É…Ñ•¤É•ÑÕÉ¸ì4(€€€½¹ÍĞÑ¥¬€ô€ ¤€ôøì4(€€€€€Í•ÑMÑ…Ñ” ¡Ì¤€ôøì4(€€€€€€€½¹ÍĞìÍ¡•‘Õ±”ô€ôÌì4(€€€€€€€±•Ğ¹•áĞ€ôÌì4(€€€€€€€¥˜€¡Í¡•‘Õ±”¹•¹…‰±•¤ì4(€€€€€€€€€½¹ÍĞ¥¹Ñ•ÉÙ…±5Ì€ô4(€€€€€€€€€€€Í¡•‘Õ±”¹™É•ÅÕ•¹ä€ôôô€‰‘…¥±äˆ€ü€ÈĞ€¨€ØÀ€¨€ØÀ€¨€ÄÀÀÀ€è€Ü€¨€ÈĞ€¨€ØÀ€¨€ØÀ€¨€ÄÀÀÀì4(€€€€€€€€€½¹ÍĞ±…ÍĞ€ôÍ¡•‘Õ±”¹±…ÍÑIÕ¹Ğ€ü¹•Ü…Ñ”¡Í¡•‘Õ±”¹±…ÍÑIÕ¹Ğ¤¹•ÑQ¥µ” ¤€è€Àì4(€€€€€€€€€€¼¼ƒš^Û–2ë’â;š&Ÿ¢†3ª_–>š‚‡¦ª04(€€€€€€€€€±•Ğ¥¹]¥¹‘½Ü€ôÑÉÕ”ì4(€€€€€€€€€ÑÉäì4(€€€€€€€€€€€½¹ÍĞ¡½ÕÉMÑÈ€ô¹•Ü%¹Ñ°¹…Ñ•Q¥µ•½Éµ…Ğ ‰•¸µˆ°ì4(€€€€€€€€€€€€€Ñ¥µ•i½¹”èÍ¡•‘Õ±”¹Ñ¥µ•é½¹”ñğ€‰UQˆ°4(€€€€€€€€€€€€€¡½ÕÈè€ˆÈµ‘¥¥Ğˆ°4(€€€€€€€€€€€€€¡½ÕÈÄÈè™…±Í”°4(€€€€€€€€€€€ô¤¹™½Éµ…Ğ¡¹•Ü…Ñ” ¤¤ì4(€€€€€€€€€€€½¹ÍĞ¡½ÕÈ€ô9Õµ‰•È¡¡½ÕÉMÑÈ¤ì4(€€€€€€€€€€€½¹ÍĞ„€ôÍ¡•‘Õ±”¹İ¥¹‘½İMÑ…ÉĞì4(€€€€€€€€€€€½¹ÍĞˆ€ôÍ¡•‘Õ±”¹İ¥¹‘½İ¹ì4(€€€€€€€€€€€¥¹]¥¹‘½Ü€ô„€ğôˆ€ü¡½ÕÈ€øô„€˜˜¡½ÕÈ€ğôˆ€è¡½ÕÈ€øô„ñğ¡½ÕÈ€ğôˆì4(€€€€€€€€€ô…Ñ ì4(€€€€€€€€€€€¥¹]¥¹‘½Ü€ôÑÉÕ”ì4(€€€€€€€€€ô4(€€€€€€€€€¥˜€¡¥¹]¥¹‘½Ü€˜˜…Ñ”¹¹½Ü ¤€´±…ÍĞ€øô¥¹Ñ•ÉÙ…±5Ì¤ì4(€€€€€€€€€€€½¹ÍĞ‘…Ñ„€ô½É•É½´¡Ì¤ì4(€€€€€€€€€€€½¹ÍĞÍ¹…ÀèM¹…ÁÍ¡½Ğ€ôì4(€€€€€€€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¤¹Ñ½MÑÉ¥¹œ ÌØ¤¹Í±¥” È°€à¥õ€°4(€€€€€€€€€€€€€É•…Ñ•‘Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€€€€€€€±…‰•°èƒ¢«–* ‘íÍ¡•‘Õ±”¹™É•ÅÕ•¹ä€ôôô€‰‘…¥±äˆ€ü€‹š¾?š^”ˆ€è€‹š¾?–F ‰÷–’’îõ€°4(€€€€€€€€€€€€€Á½ÍÑ½Õ¹Ğè‘…Ñ„¹Á½ÍÑÌ¹±•¹Ñ °4(€€€€€€€€€€€€€‘…Ñ„°4(€€€€€€€€€€€€€…ÕÑ¼èÑÉÕ”°4(€€€€€€€€€€€ôì4(€€€€€€€€€€€½¹ÍĞ…Õ‘¥ĞèÕ‘¥Ñ¹ÑÉä€ôì4(€€€€€€€€€€€€€¥è€‘íÍ¹…À¹¥‘ôµ…€°4(€€€€€€€€€€€€€…ĞèÍ¹…À¹É•…Ñ•‘Ğ°4(€€€€€€€€€€€€€…Ñ½Èè€‰Í¡•‘Õ±•Èˆ°4(€€€€€€€€€€€€€…Ñ¥½¸è€‰É•…Ñ”ˆ°4(€€€€€€€€€€€€€Í¹…ÁÍ¡½Ñ%èÍ¹…À¹¥°4(€€€€€€€€€€€€€Í¹…ÁÍ¡½Ñ1…‰•°èÍ¹…À¹±…‰•°°4(€€€€€€€€€€€€€‘•Ñ…¥°è€‹¢º‡–"K’îï–*„ˆ°4(€€€€€€€€€€€ôì4(€€€€€€€€€€€¹•áĞ€ôì4(€€€€€€€€€€€€€€¸¸¹Ì°4(€€€€€€€€€€€€€Í¹…ÁÍ¡½ÑÌèmÍ¹…À°€¸¸¹Ì¹Í¹…ÁÍ¡½ÑÍt°4(€€€€€€€€€€€€€Í¡•‘Õ±”èì€¸¸¹Í¡•‘Õ±”°±…ÍÑIÕ¹ĞèÍ¹…À¹É•…Ñ•‘Ğô°4(€€€€€€€€€€€€€…Õ‘¥Ğèm…Õ‘¥Ğ°€¸¸¹Ì¹…Õ‘¥Ñt¹Í±¥” À°5a}U%P¤°4(€€€€€€€€€€€ôì4(€€€€€€€€€ô4(€€€€€€€ô4(€€€€€€€€¼¼I•Ñ•¹Ñ¥½¸ÁÉÕ¹”4(€€€€€€€½¹ÍĞÉ•Ñ•¹Ñ¥½¸€ô5…Ñ ¹µ…à 4(€€€€€€€€€€Ä°4(€€€€€€€€€5…Ñ ¹µ¥¸¡5a}M9AM!=QL°¹•áĞ¹Í¡•‘Õ±”¹É•Ñ•¹Ñ¥½¸ñğ5a}M9AM!=QL¤°4(€€€€€€€€¤ì4(€€€€€€€¥˜€¡¹•áĞ¹Í¹…ÁÍ¡½ÑÌ¹±•¹Ñ €øÉ•Ñ•¹Ñ¥½¸¤ì4(€€€€€€€€€½¹ÍĞ­•ÁĞ€ô¹•áĞ¹Í¹…ÁÍ¡½ÑÌ¹Í±¥” À°É•Ñ•¹Ñ¥½¸¤ì4(€€€€€€€€€½¹ÍĞ‘É½ÁÁ•€ô¹•áĞ¹Í¹…ÁÍ¡½ÑÌ¹±•¹Ñ €´­•ÁĞ¹±•¹Ñ ì4(€€€€€€€€€½¹ÍĞ…Õ‘¥ĞèÕ‘¥Ñ¹ÑÉä€ôì4(€€€€€€€€€€€¥è€‘í…Ñ”¹¹½Ü ¥ôµÁÉÕ¹•€°4(€€€€€€€€€€€…Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€€€€€€€€€…Ñ½Èè€‰Í¡•‘Õ±•Èˆ°4(€€€€€€€€€€€…Ñ¥½¸è€‰ÁÉÕ¹”ˆ°4(€€€€€€€€€€€‘•Ñ…¥°èƒš2'’şwVg¶[V—šâB€‘í‘É½ÁÁ•‘ôƒ’î÷š^Ÿ–ş¯€°4(€€€€€€€€€ôì4(€€€€€€€€€¹•áĞ€ôì€¸¸¹¹•áĞ°Í¹…ÁÍ¡½ÑÌè­•ÁĞ°…Õ‘¥Ğèm…Õ‘¥Ğ°€¸¸¹¹•áĞ¹…Õ‘¥Ñt¹Í±¥” À°5a}U%P¤ôì4(€€€€€€€ô4(€€€€€€€É•ÑÕÉ¸¹•áĞì4(€€€€€ô¤ì4(€€€ôì4(€€€Ñ¥¬ ¤ì4(€€€½¹ÍĞĞ€ôÍ•Ñ%¹Ñ•ÉÙ…°¡Ñ¥¬°€ØÀ€¨€ØÀ€¨€ÄÀÀÀ¤ì€¼¼¡½ÕÉ±ä4(€€€É•ÑÕÉ¸€ ¤€ôø±•…É%¹Ñ•ÉÙ…°¡Ğ¤ì4(€ô°m¡å‘É…Ñ•‘t¤ì4(4(€½¹ÍĞÙ…±Õ”€ôÕÍ•5•µ¼ 4(€€€€ ¤€ôø€¡ì4(€€€€€€¸¸¹ÍÑ…Ñ”°4(€€€€€¡å‘É…Ñ•°4(€€€€€™Õ±±!å‘É…Ñ•°4(€€€€€ÕÁÍ•ÉÑA½ÍĞ°4(€€€€€‘•±•Ñ•A½ÍĞ°4(€€€€€Í•ÑA½ÍÑMÑ…ÑÕÌ°4(€€€€€…‘‘…Ñ•½Éä°4(€€€€€É•¹…µ•…Ñ•½Éä°4(€€€€€É•µ½Ù•…Ñ•½Éä°4(€€€€€…‘‘Q…œ°4(€€€€€É•¹…µ•Q…œ°4(€€€€€É•µ½Ù•Q…œ°4(€€€€€ÕÁÍ•ÉÑÉ¥•¹°4(€€€€€É•µ½Ù•É¥•¹°4(€€€€€ÕÁ‘…Ñ•M•ÑÑ¥¹Ì°4(€€€€€…ÁÁ±åM…Ù•‘M•ÑÑ¥¹Ì°4(€€€€€ÍÕÁÁÉ•ÍÍ9•áÑA•ÉÍ¥ÍĞ°4(€€€€€ÕÁ‘…Ñ•±½Õ°4(€€€€€É•Á±…•MÑ…Ñ”°4(€€€€€É•Í•Ñ±°°4(€€€€€É•…Ñ•M¹…ÁÍ¡½Ğ°4(€€€€€É•ÍÑ½É•M¹…ÁÍ¡½Ğ°4(€€€€€É•µ½Ù•M¹…ÁÍ¡½Ğ°4(€€€€€ÕÁ‘…Ñ•M¡•‘Õ±”°4(€€€€€±•…ÉÕ‘¥Ğ°4(€€€€€ÕÁ‘…Ñ•$°4(€€€€€…‘‘5•‘¥„°4(€€€€€É•µ½Ù•5•‘¥„°4(€€€€€É•½É‘¹…±åÑ¥Ì°4(€€€€€…‘‘±•ÉĞ°4(€€€€€…­±•ÉĞ°4(€€€€€±•…É±•ÉÑÌ°4(€€€€€…‘‘9½Ñ¥™åI••¥ÁĞ°4(€€€€€±•…É9½Ñ¥™åI••¥ÁÑÌ°4(€€€€€…‘‘5•‘¥……¥±ÕÉ”°4(€€€€€É•µ½Ù•5•‘¥……¥±ÕÉ”°4(€€€€€±•…É5•‘¥……¥±ÕÉ•Ì°4(€€€€€…É¡¥Ù•¥…¹½ÍÑ¥Ì°4(€€€€€É•µ½Ù•¥…¹½ÍÑ¥ÍÉ¡¥Ù”°4(€€€€€±•…É¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ì°4(€€€€€É•½É‘½¹Ñ…Ñ±¥¬°4(€€€€€É•Í•Ñ½¹Ñ…Ñ±¥­Ì°4(€€€ô¤°4(€€€l4(€€€€€ÍÑ…Ñ”°4(€€€€€¡å‘É…Ñ•°4(€€€€€™Õ±±!å‘É…Ñ•°4(€€€€€ÕÁÍ•ÉÑA½ÍĞ°4(€€€€€‘•±•Ñ•A½ÍĞ°4(€€€€€Í•ÑA½ÍÑMÑ…ÑÕÌ°4(€€€€€…‘‘…Ñ•½Éä°4(€€€€€É•¹…µ•…Ñ•½Éä°4(€€€€€É•µ½Ù•…Ñ•½Éä°4(€€€€€…‘‘Q…œ°4(€€€€€É•¹…µ•Q…œ°4(€€€€€É•µ½Ù•Q…œ°4(€€€€€ÕÁÍ•ÉÑÉ¥•¹°4(€€€€€É•µ½Ù•É¥•¹°4(€€€€€ÕÁ‘…Ñ•M•ÑÑ¥¹Ì°4(€€€€€…ÁÁ±åM…Ù•‘M•ÑÑ¥¹Ì°4(€€€€€ÍÕÁÁÉ•ÍÍ9•áÑA•ÉÍ¥ÍĞ°4(€€€€€ÕÁ‘…Ñ•±½Õ°4(€€€€€É•Á±…•MÑ…Ñ”°4(€€€€€É•Í•Ñ±°°4(€€€€€É•…Ñ•M¹…ÁÍ¡½Ğ°4(€€€€€É•ÍÑ½É•M¹…ÁÍ¡½Ğ°4(€€€€€É•µ½Ù•M¹…ÁÍ¡½Ğ°4(€€€€€ÕÁ‘…Ñ•M¡•‘Õ±”°4(€€€€€±•…ÉÕ‘¥Ğ°4(€€€€€ÕÁ‘…Ñ•$°4(€€€€€…‘‘5•‘¥„°4(€€€€€É•µ½Ù•5•‘¥„°4(€€€€€É•½É‘¹…±åÑ¥Ì°4(€€€€€…‘‘±•ÉĞ°4(€€€€€…­±•ÉĞ°4(€€€€€±•…É±•ÉÑÌ°4(€€€€€…‘‘9½Ñ¥™åI••¥ÁĞ°4(€€€€€±•…É9½Ñ¥™åI••¥ÁÑÌ°4(€€€€€…‘‘5•‘¥……¥±ÕÉ”°4(€€€€€É•µ½Ù•5•‘¥……¥±ÕÉ”°4(€€€€€±•…É5•‘¥……¥±ÕÉ•Ì°4(€€€€€…É¡¥Ù•¥…¹½ÍÑ¥Ì°4(€€€€€É•µ½Ù•¥…¹½ÍÑ¥ÍÉ¡¥Ù”°4(€€€€€±•…É¥…¹½ÍÑ¥ÍÉ¡¥Ù•Ì°4(€€€€€É•½É‘½¹Ñ…Ñ±¥¬°4(€€€€€É•Í•Ñ½¹Ñ…Ñ±¥­Ì°4(€€€t°4(€€¤ì4(4(€É•ÑÕÉ¸€ñ‘µ¥¹½¹Ñ•áĞ¹AÉ½Ù¥‘•ÈÙ…±Õ”õíÙ…±Õ•ôùí¡¥±‘É•¹ôğ½‘µ¥¹½¹Ñ•áĞ¹AÉ½Ù¥‘•Èøì4)ô4(4)•áÁ½ÉĞ™Õ¹Ñ¥½¸ÕÍ•‘µ¥¹MÑ½É” ¤ì4(€½¹ÍĞÑà€ôÕÍ•½¹Ñ•áĞ¡‘µ¥¹½¹Ñ•áĞ¤ì4(€¥˜€ …Ñà¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰ÕÍ•‘µ¥¹MÑ½É”µÕÍĞ‰”ÕÍ•İ¥Ñ¡¥¸‘µ¥¹MÑ½É•AÉ½Ù¥‘•Èˆ¤ì4(€ô4(€É•ÑÕÉ¸Ñàì4)ô4