import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AdminState,
  CoreData,
  Friend,
  PublicSiteSettings,
  SiteSettings,
} from "@/lib/admin-store";
import type { Post } from "@/lib/sample-posts";
import { renderMarkdown } from "@/lib/markdown.server";

let database: ReturnType<typeof postgres> | undefined;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  database ??= postgres(url, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return database;
}

function cryptoKey() {
  const secret = process.env.TIMEAMBER_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("TIMEAMBER_SECRET_KEY must contain at least 32 characters");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const [version, iv, tag, payload] = value.split(".");
    if (version !== "v1" || !iv || !tag || !payload) return fallback;
    const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch (error) {
    console.error("[TimeAmber] failed to decrypt server configuration", error);
    return fallback;
  }
}

function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mediaPublicUrl(row: Record<string, unknown>): string {
  const bucket = String(row.bucket ?? "");
  const objectPath = String(row.object_path ?? "");
  if (bucket === "media" && objectPath) {
    const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
    return `/supabase/storage/v1/object/public/media/${encoded}`;
  }
  return String(row.public_url ?? "");
}

function mediaThumbnailUrl(row: Record<string, unknown>): string | undefined {
  const bucket = String(row.bucket ?? "");
  const objectPath = String(row.object_path ?? "");
  if (bucket !== "media" || !objectPath) return undefined;
  return mediaPublicUrl({ bucket, object_path: `thumbnails/${objectPath}.260.webp` });
}

async function loadMediaItems(): Promise<AdminState["media"]> {
  const rows = await db()`
    select * from public.media_items order by created_at desc limit 500
  `;
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    url: mediaPublicUrl(row),
    thumbnailUrl: mediaThumbnailUrl(row),
    size: row.size_bytes == null ? undefined : Number(row.size_bytes),
    source: row.source as AdminState["media"][number]["source"],
    uploadedAt: asDate(row.created_at),
  }));
}

type DatabaseRow = Record<string, unknown>;

function mapPostRow(row: DatabaseRow, tagMap: Map<number, string[]>): Post {
  const post: Post = {
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.excerpt ?? ""),
    category: String(row.category ?? ""),
    tags: tagMap.get(Number(row.id)) ?? [],
    publishAt: asDate(row.publish_at ?? row.created_at),
    readingMinutes: Number(row.reading_minutes ?? 1),
    status: row.published ? "published" : "draft",
    type: row.post_type === "html" ? "html" : "markdown",
    openIn: row.open_in === "_self" ? "_self" : "_blank",
  };
  if (row.source) post.source = String(row.source);
  if (row.content != null) post.content = String(row.content);
  if (row.cover_image) post.cover = String(row.cover_image);
  if (row.external_url) post.externalUrl = String(row.external_url);
  if (row.notion_id) post.notionId = String(row.notion_id);
  if (row.notion_last_edited) post.notionLastEdited = asDate(row.notion_last_edited);
  return post;
}

async function loadPosts(admin: boolean, includeContent = false): Promise<Post[]> {
  const sql = db();
  // å…¬å¼€æŸ¥è¯¢åˆ»æ„ä¸å– source / notion_id / notion_last_editedï¼š
  // è¿™ä»½ç»“æœä¼šè¢« root loader åºåˆ—åŒ–è¿›**æ¯ä¸€ä¸ªé¡µé¢**çš„ hydration payloadï¼ˆ1921 ç¯‡ï¼‰ï¼Œ
  // è€Œè¿™ä¸‰ä¸ªå­—æ®µå‰å°åˆ—è¡¨ä¸€ä¸ªéƒ½ç”¨ä¸åˆ° â€”â€” notion_* åªæœ‰åå° backup é¡µåœ¨ç”¨ï¼ˆèµ° admin åˆ†æ”¯çš„
  // select *ï¼‰ï¼Œåå°åˆ—è¡¨é»˜è®¤ä¸å–æ­£æ–‡ï¼›å¤‡ä»½æŒ‰é¡µã€ç¼–è¾‘é¡µæŒ‰ slug è¯»å–å®Œæ•´æ–‡ç« ã€‚
  const rows = admin
    ? includeContent
      ? await sql`select * from public.posts order by pinned desc, created_at desc`
      : await sql`
          select
            id, slug, title, excerpt, category, publish_at, created_at,
            reading_minutes, published, cover_image, post_type,
            external_url, open_in
          from public.posts
          order by pinned desc, created_at desc
        `
    : await sql`
        select
          id, slug, title, excerpt, category, publish_at, created_at,
          reading_minutes, published, cover_image, post_type,
          external_url, open_in
        from public.posts
        where published = true and (publish_at is null or publish_at <= now())
        order by pinned desc, created_at desc
      `;
  const tagRows = await sql`
    select pt.post_id, t.name
    from public.post_tags pt
    join public.tags t on t.id = pt.tag_id
  `;
  const tagMap = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagMap.get(Number(row.post_id)) ?? [];
    list.push(String(row.name));
    tagMap.set(Number(row.post_id), list);
  }
  return rows.map((row) => mapPostRow(row, tagMap));
}

async function readConfig<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db()`select value from public.app_config where key = ${key}`;
  return (row?.value as T | undefined) ?? fallback;
}

async function readSecret<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db()`select encrypted_value from public.secret_config where key = ${key}`;
  return decryptJson<T>(row?.encrypted_value as string | undefined, fallback);
}

const PUBLIC_SETTING_KEYS = [
  "authorName",
  "authorAvatar",
  "authorBio",
  "siteTitle",
  "siteTagline",
  "siteDescription",
  "aboutIntro",
  "aboutQuote",
  "aboutTechStack",
  "contactEmail",
  "contactGithub",
  "contactTwitter",
  "contactTelegram",
  "contactX",
  "contactWechat",
  "contactQQ",
  "contactXiaohongshu",
  "contactDouyin",
  "contactNote",
  "askPublicEnabled",
] as const satisfies ReadonlyArray<keyof SiteSettings>;

function pickPublicSettings(value: unknown): PublicSiteSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result: PublicSiteSettings = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    const item = source[key];
    if (typeof item === "string" || typeof item === "boolean") {
      result[key] = item as never;
    }
  }
  return result;
}

function mapFriends(rows: Array<Record<string, unknown>>): Friend[] {
  return rows.map((row) => ({
    name: String(row.name),
    url: String(row.url),
    desc: String(row.description ?? ""),
    icon: row.icon ? String(row.icon) : undefined,
    group: row.group_name ? String(row.group_name) : undefined,
  }));
}

/** å…¬å¼€ root åªè¿”å›å¸ƒå±€çœŸæ­£éœ€è¦çš„ friend ä¸è®¾ç½®ç™½åå•ï¼Œä¸å¸¦ taxonomy æˆ–åå°è®¡åˆ’ã€‚ */
async function loadChrome(admin: boolean): Promise<Partial<AdminState>> {
  const sql = db();
  const [friends, settings] = await Promise.all([
    admin
      ? sql`select * from public.friends order by sort_order, name`
      : sql`select * from public.friends where published = true order by sort_order, name`,
    readConfig("site", {}),
  ]);
  const mappedFriends = mapFriends(friends as Array<Record<string, unknown>>);

  if (!admin) {
    // Provider ä¼šæŠŠè¿™ä»½ç™½åå•åˆå¹¶åˆ°æœ¬åœ°é»˜è®¤ settingsï¼›æ­¤å¤„åªä¸ºå¤ç”¨ AdminState
    // çš„ç°æœ‰ server-function ç±»å‹åšè¾¹ç•Œæ–­è¨€ï¼Œè¿è¡Œæ—¶ä¸ä¼šæŠŠæœªåˆ—å…¥ç™½åå•çš„å­—æ®µå¸¦å‡ºã€‚
    return {
      friends: mappedFriends,
      settings: pickPublicSettings(settings) as AdminState["settings"],
    };
  }

  const [categories, tags, schedule] = await Promise.all([
    sql`select name from public.categories order by name`,
    sql`select name from public.tags order by name`,
    readConfig("backup_schedule", {}),
  ]);
  return {
    categories: categories.map((row) => ({ name: String(row.name) })),
    tags: tags.map((row) => ({ name: String(row.name) })),
    friends: mappedFriends,
    settings: settings as AdminState["settings"],
    schedule: schedule as AdminState["schedule"],
  };
}

/** åå°è¦çš„å®Œæ•´ä¸€ä»½ï¼šå¤–å£³ + å…¨éƒ¨æ–‡ç« ï¼ˆå«è‰ç¨¿ï¼‰ã€‚ */
async function loadCore(admin: boolean): Promise<Partial<AdminState>> {
  const [chrome, posts] = await Promise.all([loadChrome(admin), loadPosts(admin)]);
  return { ...chrome, posts };
}

async function assertAdmin(userId: string) {
  const [profile] = await db()`
    select role from public.profiles where user_id = ${userId}::uuid
  `;
  if (profile?.role !== "admin") throw new Error("Administrator access required");
}

export const loadAdminSummaryState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Partial<AdminState>> => {
    await assertAdmin(context.userId);
    const sql = db();
    const [chrome, recentRows, countRows, cloud, ai, alerts] = await Promise.all([
      loadChrome(true),
      sql`
        select
          id, slug, title, excerpt, category, publish_at, created_at,
          reading_minutes, published, cover_image, post_type,
          external_url, open_in
        from public.posts
        order by pinned desc, created_at desc
        limit 5
      `,
      sql`select count(*)::int as count from public.posts`,
      readSecret("cloud", {}),
      readSecret("ai", {}),
      sql`select * from public.alerts order by created_at desc limit 100`,
    ]);

    const emptyTagMap = new Map<number, string[]>();
    return {
      ...chrome,
      posts: recentRows.map((row) => mapPostRow(row, emptyTagMap)),
      postCount: Number(countRows[0]?.count ?? 0),
      cloud,
      ai: ai as AdminState["ai"],
      alerts: alerts.map((row) => ({
        id: String(row.id),
        at: asDate(row.created_at),
        level: row.level,
        source: String(row.source),
        message: String(row.message),
        acknowledged: Boolean(row.acknowledged),
      })),
    };
  });

export const loadPublicChrome = createServerFn({ method: "GET" }).handler(
  async (): Promise<Partial<AdminState>> => loadChrome(false),
);

export type VisitTrendPoint = { date: string; count: number };

export const loadPublicVisitTrend = createServerFn({ method: "GET" }).handler(
  async (): Promise<VisitTrendPoint[]> => {
    const rows = await db()`
      with days as (
        select generate_series(
          (now() at time zone 'Asia/Shanghai')::date - 6,
          (now() at time zone 'Asia/Shanghai')::date,
          interval '1 day'
        )::date as day
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as date,
        count(events.id)::int as count
      from days
      left join public.diagnostic_events events
        on events.event_type = 'page_view'
       and (events.created_at at time zone 'Asia/Shanghai')::date = days.day
      group by days.day
      order by days.day
    `;
    return rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count),
    }));
  },
);

const publicPostInput = z.object({ slug: z.string().min(1).max(300) });

export const loadPublicPost = createServerFn({ method: "GET" })
  .validator((value: z.infer<typeof publicPostInput>) => publicPostInput.parse(value))
  .handler(async ({ data }): Promise<{ post: Post; contentHtml: string } | null> => {
    const sql = db();
    const [row] = await sql`
        select
          p.id, p.slug, p.title, p.excerpt, p.category,
          p.publish_at, p.created_at, p.reading_minutes, p.source,
          p.content, p.cover_image, p.post_type, p.external_url,
          p.open_in, p.notion_id, p.notion_last_edited,
          coalesce(
            (
              select array_agg(t.name order by t.name)
              from public.post_tags pt
              join public.tags t on t.id = pt.tag_id
              where pt.post_id = p.id
            ),
            '{}'::text[]
          ) as tag_names
        from public.posts p
        where p.slug = ${data.slug}
          and p.published = true
          and (p.publish_at is null or p.publish_at <= now())
        limit 1
      `;
    if (!row) return null;

    const post: Post = {
      slug: String(row.slug),
      title: String(row.title),
      excerpt: String(row.excerpt ?? ""),
      category: String(row.category ?? ""),
      tags: Array.isArray(row.tag_names) ? row.tag_names.map((tag) => String(tag)) : [],
      publishAt: asDate(row.publish_at ?? row.created_at),
      readingMinutes: Number(row.reading_minutes ?? 1),
      source: row.source ? String(row.source) : undefined,
      content: String(row.content ?? ""),
      status: "published",
      cover: row.cover_image ? String(row.cover_image) : undefined,
      type: row.post_type === "html" ? "html" : "markdown",
      externalUrl: row.external_url ? String(row.external_url) : undefined,
      openIn: row.open_in === "_self" ? "_self" : "_blank",
      notionId: row.notion_id ? String(row.notion_id) : undefined,
      notionLastEdited: row.notion_last_edited ? asDate(row.notion_last_edited) : undefined,
    };

    // å®¢æˆ·ç«¯å¯¼èˆªæœ€æ…¢çš„ä¸€æ®µåŸæ¥æ˜¯å¦ä¸€ä¸ª renderMarkdown server function è¯·æ±‚ã€‚
    // å’Œæ–‡ç« æŸ¥è¯¢æ”¾è¿›åŒä¸€ä¸ªæœåŠ¡ç«¯å‡½æ•°ï¼Œå‘½ä¸­ markdown LRU æ—¶ä¹Ÿèƒ½ç›´æ¥å¤ç”¨ç¼“å­˜ã€‚
    const contentHtml =
      post.content && !(post.type === "html" && post.externalUrl)
        ? await renderMarkdown(post.content)
        : "";
    return { post, contentHtmlïm¸¶‰ËkºwµçpÉ½ÕÁ}¹…µ”€ô•á±Õ‘•¹É½ÕÁ}¹…µ”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€€€ì4(€€€€€ô4(€€€€€½¹ÍĞ¹…µ•Ì€ô±¥ÍĞ¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹¹…µ”¤ì4(€€€€€¥˜€¡¹…µ•Ì¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹™É¥•¹‘Ìİ¡•É”¹…µ”¹½Ğ¥¸€‘íÑà¡¹…µ•Ì¥õ€ì4(€€€€€ô•±Í”ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹™É¥•¹‘Í€ì4(€€€€€ô4(€€€ô¤ì4(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”…Ì½¹ÍĞôì4(€ô¤ì4(4)½¹ÍĞÍ¥Ñ•M•ÑÑ¥¹Í%¹ÁÕĞ€ôè¹½‰©•Ğ¡ìÍ•ÑÑ¥¹Ìèè¹…¹ä ¤ô¤ì4(4(¼¨¨4(€¨ƒ–>«–g®g
ç¢ºûö»4(€¨Á•ÉÍ¥ÍÑ‘µ¥¹MÑ…Ñ”ƒ’òk–r£–B3’â’â«’ê/–*‡¦3¦7–g–£¦£šZ®ƒ¾ò3¢ºûö»¦†×’şw–¶c’â7¢¾—’îc¢şg’â«’î’îß¾ò04(€¨ƒ’æš¶–nƒ’âë¦7¾ò3–º–>«¢÷¦bËš*[–îÛ–B;š&Ÿ¢†3š^ƒšÎWîg–ër–º{j’şw–¶cîOšzs4(€¨ƒ¢şg¦3–6W.³–d…ÁÁ}½¹™¥œ¹Í¥Ñ—¾ò3¢ºûö»¦†×–ÂÇ¢÷–B3š¶—¶'îOšzs–7š>C’ëš"C–*|¿–’Ç¢Ò—4(€¨¼4)•áÁ½ÉĞ½¹ÍĞÍ…Ù•M¥Ñ•M•ÑÑ¥¹Ì€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤4(€€¹µ¥‘‘±•İ…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤4(€€¹Ù…±¥‘…Ñ½È ¡Ù…±Õ”èè¹¥¹™•ÈñÑåÁ•½˜Í¥Ñ•M•ÑÑ¥¹Í%¹ÁÕĞø¤€ôøÍ¥Ñ•M•ÑÑ¥¹Í%¹ÁÕĞ¹Á…ÉÍ”¡Ù…±Õ”¤¤4(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áĞô¤€ôøì4(€€€…İ…¥Ğ…ÍÍ•ÉÑ‘µ¥¸¡½¹Ñ•áĞ¹ÕÍ•É%¤ì4(€€€½¹ÍĞÍÅ°€ô‘ˆ ¤ì4(€€€…İ…¥ĞÍÅ±€4(€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…ÁÁ}½¹™¥œ€¡­•ä°Ù…±Õ”°ÁÕ‰±¥}É•…°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€Ù…±Õ•Ì€ Í¥Ñ”œ°€‘íÍÅ°¹©Í½¸¡‘…Ñ„¹Í•ÑÑ¥¹Ì¥ô°ÑÉÕ”°¹½Ü ¤¤4(€€€€€½¸½¹™±¥Ğ€¡­•ä¤‘¼ÕÁ‘…Ñ”4(€€€€€€€Í•ĞÙ…±Õ”€ô•á±Õ‘•¹Ù…±Õ”°ÁÕ‰±¥}É•…€ôÑÉÕ”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€ì4(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”…Ì½¹ÍĞôì4(€ô¤ì4(4)½¹ÍĞÍÑ…Ñ•%¹ÁÕĞ€ôè¹½‰©•Ğ¡ìÍÑ…Ñ”èè¹…¹ä ¤ô¤ì4(4)•áÁ½ÉĞ½¹ÍĞÁ•ÉÍ¥ÍÑ‘µ¥¹MÑ…Ñ”€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤4(€€¹µ¥‘‘±•İ…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤4(€€¹Ù…±¥‘…Ñ½È ¡Ù…±Õ”èè¹¥¹™•ÈñÑåÁ•½˜ÍÑ…Ñ•%¹ÁÕĞø¤€ôøÍÑ…Ñ•%¹ÁÕĞ¹Á…ÉÍ”¡Ù…±Õ”¤¤4(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áĞô¤€ôøì4(€€€…İ…¥Ğ…ÍÍ•ÉÑ‘µ¥¸¡½¹Ñ•áĞ¹ÕÍ•É%¤ì4(€€€½¹ÍĞÍÑ…Ñ”€ô‘…Ñ„¹ÍÑ…Ñ”…Ì‘µ¥¹MÑ…Ñ”ì4(€€€½¹ÍĞÍÅ°€ô‘ˆ ¤ì4(€€€…İ…¥ĞÍÅ°¹‰•¥¸¡…Íå¹Œ€¡Ñà¤€ôøì4(€€€€€…İ…¥ĞÑáÍ•±•ĞÁ}…‘Ù¥Í½Éå}á…Ñ}±½¬¡¡…Í¡Ñ•áĞ Ñ¥µ•…µ‰•É}½¹Ñ•¹Ñ}İÉ¥Ñ”œ¤¥€ì4(4(€€€€€…İ…¥ĞÑá€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…ÁÁ}½¹™¥œ€¡­•ä°Ù…±Õ”°ÁÕ‰±¥}É•…°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€Ù…±Õ•Ì€ Í¥Ñ”œ°€‘íÑà¹©Í½¸¡ÍÑ…Ñ”¹Í•ÑÑ¥¹Ì¥ô°ÑÉÕ”°¹½Ü ¤¤4(€€€€€€€½¸½¹™±¥Ğ€¡­•ä¤‘¼ÕÁ‘…Ñ”4(€€€€€€€€€Í•ĞÙ…±Õ”€ô•á±Õ‘•¹Ù…±Õ”°ÁÕ‰±¥}É•…€ôÑÉÕ”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€ì4(€€€€€…İ…¥ĞÑá€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…ÁÁ}½¹™¥œ€¡­•ä°Ù…±Õ”°ÁÕ‰±¥}É•…°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€Ù…±Õ•Ì€ ‰…­ÕÁ}Í¡•‘Õ±”œ°€‘íÑà¹©Í½¸¡ÍÑ…Ñ”¹Í¡•‘Õ±”¥ô°™…±Í”°¹½Ü ¤¤4(€€€€€€€½¸½¹™±¥Ğ€¡­•ä¤‘¼ÕÁ‘…Ñ”4(€€€€€€€€€Í•ĞÙ…±Õ”€ô•á±Õ‘•¹Ù…±Õ”°ÁÕ‰±¥}É•…€ô™…±Í”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€ì4(€€€€€…İ…¥ĞÑá€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Í•É•Ñ}½¹™¥œ€¡­•ä°•¹ÉåÁÑ•‘}Ù…±Õ”°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€Ù…±Õ•Ì€ ±½Õœ°€‘í•¹ÉåÁÑ)Í½¸¡ÍÑ…Ñ”¹±½Õ¥ô°¹½Ü ¤¤°€ …¤œ°€‘í•¹ÉåÁÑ)Í½¸¡ÍÑ…Ñ”¹…¤¥ô°¹½Ü ¤¤4(€€€€€€€½¸½¹™±¥Ğ€¡­•ä¤‘¼ÕÁ‘…Ñ”4(€€€€€€€€€Í•Ğ•¹ÉåÁÑ•‘}Ù…±Õ”€ô•á±Õ‘•¹•¹ÉåÁÑ•‘}Ù…±Õ”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€ì4(4(€€€€€™½È€¡½¹ÍĞ…Ñ•½Éä½˜ÍÑ…Ñ”¹…Ñ•½É¥•Ì¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…Ñ•½É¥•Ì€¡¹…µ”°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€€€Ù…±Õ•Ì€ ‘í…Ñ•½Éä¹¹…µ•ô°¹½Ü ¤¤4(€€€€€€€€€½¸½¹™±¥Ğ€¡¹…µ”¤‘¼ÕÁ‘…Ñ”Í•ĞÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€€€ì4(€€€€€ô4(€€€€€½¹ÍĞ…Ñ•½Éå9…µ•Ì€ôÍÑ…Ñ”¹…Ñ•½É¥•Ì¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹¹…µ”¤ì4(€€€€€¥˜€¡…Ñ•½Éå9…µ•Ì¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹…Ñ•½É¥•Ìİ¡•É”¹…µ”¹½Ğ¥¸€‘íÑà¡…Ñ•½Éå9…µ•Ì¥õ€ì4(€€€€€ô4(4(€€€€€™½È€¡½¹ÍĞ™É¥•¹½˜ÍÑ…Ñ”¹™É¥•¹‘Ì¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹™É¥•¹‘Ì€¡¹…µ”°ÕÉ°°‘•ÍÉ¥ÁÑ¥½¸°¥½¸°É½ÕÁ}¹…µ”°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€€€Ù…±Õ•Ì€ ‘í™É¥•¹¹¹…µ•ô°€‘í™É¥•¹¹ÕÉ±ô°€‘í™É¥•¹¹‘•Íô°€‘í™É¥•¹¹¥½¸€üü¹Õ±±ô°€‘í™É¥•¹¹É½ÕÀ€üü¹Õ±±ô°¹½Ü ¤¤4(€€€€€€€€€½¸½¹™±¥Ğ€¡¹…µ”¤‘¼ÕÁ‘…Ñ”4(€€€€€€€€€€€Í•ĞÕÉ°€ô•á±Õ‘•¹ÕÉ°°‘•ÍÉ¥ÁÑ¥½¸€ô•á±Õ‘•¹‘•ÍÉ¥ÁÑ¥½¸°4(€€€€€€€€€€€€€€€¥½¸€ô•á±Õ‘•¹¥½¸°É½ÕÁ}¹…µ”€ô•á±Õ‘•¹É½ÕÁ}¹…µ”°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€€€ì4(€€€€€ô4(€€€€€½¹ÍĞ™É¥•¹‘9…µ•Ì€ôÍÑ…Ñ”¹™É¥•¹‘Ì¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹¹…µ”¤ì4(€€€€€¥˜€¡™É¥•¹‘9…µ•Ì¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹™É¥•¹‘Ìİ¡•É”¹…µ”¹½Ğ¥¸€‘íÑà¡™É¥•¹‘9…µ•Ì¥õ€ì4(€€€€€ô•±Í”ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹™É¥•¹‘Í€ì4(€€€€€ô4(4(€€€€€€¼¼ƒš&ç¦<ÕÁÍ•ÉĞƒšZ®ƒ¾ò#šnÿ’î¦Cšv‡–g¾ò3¦ÿ–7¢Ú¦Vÿ’ê/–*‡î?¦jŸ¦O¢Úš^Û¾ò$4(€€€€€½¹ÍĞ¹½İ%Í¼€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì4(€€€€€½¹ÍĞ¥‘	åM±Õœ€ô¹•Ü5…ÀñÍÑÉ¥¹œ°¹Õµ‰•Èø ¤ì4(€€€€€¥˜€¡ÍÑ…Ñ”¹Á½ÍÑÌ¹±•¹Ñ ¤ì4(€€€€€€€½¹ÍĞÁ½ÍÑI½İÌ€ôÍÑ…Ñ”¹Á½ÍÑÌ¹µ…À ¡Á½ÍĞ¤€ôø€¡ì4(€€€€€€€€€Í±ÕœèÁ½ÍĞ¹Í±Õœ°4(€€€€€€€€€Ñ¥Ñ±”èÁ½ÍĞ¹Ñ¥Ñ±”°4(€€€€€€€€€½¹Ñ•¹ĞèÁ½ÍĞ¹½¹Ñ•¹Ğ€üü€ˆˆ°4(€€€€€€€€€•á•ÉÁĞèÁ½ÍĞ¹•á•ÉÁĞ°4(€€€€€€€€€½Ù•É}¥µ…”èÁ½ÍĞ¹½Ù•È€üü€ˆˆ°4(€€€€€€€€€ÁÕ‰±¥Í¡•èÁ½ÍĞ¹ÍÑ…ÑÕÌ€„ôô€‰‘É…™Ğˆ°4(€€€€€€€€€±¥ÍÑ•èÑÉÕ”°4(€€€€€€€€€ÁÕ‰±¥Í¡}…ĞèÁ½ÍĞ¹ÁÕ‰±¥Í¡Ğñğ¹Õ±°°4(€€€€€€€€€…Ñ•½ÉäèÁ½ÍĞ¹…Ñ•½Éä°4(€€€€€€€€€Á½ÍÑ}ÑåÁ”èÁ½ÍĞ¹ÑåÁ”€üü€‰µ…É­‘½İ¸ˆ°4(€€€€€€€€€•áÑ•É¹…±}ÕÉ°èÁ½ÍĞ¹•áÑ•É¹…±UÉ°€üü¹Õ±°°4(€€€€€€€€€½Á•¹}¥¸èÁ½ÍĞ¹½Á•¹%¸€üü€‰}‰±…¹¬ˆ°4(€€€€€€€€€Í½ÕÉ”èÁ½ÍĞ¹Í½ÕÉ”€üü¹Õ±°°4(€€€€€€€€€¹½Ñ¥½¹}¥èÁ½ÍĞ¹¹½Ñ¥½¹%€üü¹Õ±°°4(€€€€€€€€€¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•èÁ½ÍĞ¹¹½Ñ¥½¹1…ÍÑ‘¥Ñ•€üü¹Õ±°°4(€€€€€€€€€É•…‘¥¹}µ¥¹ÕÑ•ÌèÁ½ÍĞ¹É•…‘¥¹5¥¹ÕÑ•Ìñğ€Ä°4(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğè¹½İ%Í¼°4(€€€€€€€ô¤¤ì4(€€€€€€€½¹ÍĞÍ…Ù•‘A½ÍÑÌ€ô…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Á½ÍÑÌ€‘íÑà 4(€€€€€€€€€€€Á½ÍÑI½İÌ°4(€€€€€€€€€€€€‰Í±Õœˆ°4(€€€€€€€€€€€€‰Ñ¥Ñ±”ˆ°4(€€€€€€€€€€€€‰½¹Ñ•¹Ğˆ°4(€€€€€€€€€€€€‰•á•ÉÁĞˆ°4(€€€€€€€€€€€€‰½Ù•É}¥µ…”ˆ°4(€€€€€€€€€€€€‰ÁÕ‰±¥Í¡•ˆ°4(€€€€€€€€€€€€‰±¥ÍÑ•ˆ°4(€€€€€€€€€€€€‰ÁÕ‰±¥Í¡}…Ğˆ°4(€€€€€€€€€€€€‰…Ñ•½Éäˆ°4(€€€€€€€€€€€€‰Á½ÍÑ}ÑåÁ”ˆ°4(€€€€€€€€€€€€‰•áÑ•É¹…±}ÕÉ°ˆ°4(€€€€€€€€€€€€‰½Á•¹}¥¸ˆ°4(€€€€€€€€€€€€‰Í½ÕÉ”ˆ°4(€€€€€€€€€€€€‰¹½Ñ¥½¹}¥ˆ°4(€€€€€€€€€€€€‰¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•ˆ°4(€€€€€€€€€€€€‰É•…‘¥¹}µ¥¹ÕÑ•Ìˆ°4(€€€€€€€€€€€€‰ÕÁ‘…Ñ•‘}…Ğˆ°4(€€€€€€€€€€¥ô4(€€€€€€€€€½¸½¹™±¥Ğ€¡Í±Õœ¤‘¼ÕÁ‘…Ñ”Í•Ğ4(€€€€€€€€€€€Ñ¥Ñ±”€ô•á±Õ‘•¹Ñ¥Ñ±”°4(€€€€€€€€€€€½¹Ñ•¹Ğ€ô•á±Õ‘•¹½¹Ñ•¹Ğ°4(€€€€€€€€€€€•á•ÉÁĞ€ô•á±Õ‘•¹•á•ÉÁĞ°4(€€€€€€€€€€€½Ù•É}¥µ…”€ô•á±Õ‘•¹½Ù•É}¥µ…”°4(€€€€€€€€€€€ÁÕ‰±¥Í¡•€ô•á±Õ‘•¹ÁÕ‰±¥Í¡•°4(€€€€€€€€€€€ÁÕ‰±¥Í¡}…Ğ€ô•á±Õ‘•¹ÁÕ‰±¥Í¡}…Ğ°4(€€€€€€€€€€€…Ñ•½Éä€ô•á±Õ‘•¹…Ñ•½Éä°4(€€€€€€€€€€€Á½ÍÑ}ÑåÁ”€ô•á±Õ‘•¹Á½ÍÑ}ÑåÁ”°4(€€€€€€€€€€€•áÑ•É¹…±}ÕÉ°€ô•á±Õ‘•¹•áÑ•É¹…±}ÕÉ°°4(€€€€€€€€€€€½Á•¹}¥¸€ô•á±Õ‘•¹½Á•¹}¥¸°4(€€€€€€€€€€€Í½ÕÉ”€ô•á±Õ‘•¹Í½ÕÉ”°4(€€€€€€€€€€€¹½Ñ¥½¹}¥€ô•á±Õ‘•¹¹½Ñ¥½¹}¥°4(€€€€€€€€€€€¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•€ô•á±Õ‘•¹¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•°4(€€€€€€€€€€€É•…‘¥¹}µ¥¹ÕÑ•Ì€ô•á±Õ‘•¹É•…‘¥¹}µ¥¹ÕÑ•Ì°4(€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğ€ô•á±Õ‘•¹ÕÁ‘…Ñ•‘}…Ğ4(€€€€€€€€€É•ÑÕÉ¹¥¹œ¥°Í±Õœ4(€€€€€€€€ì4(€€€€€€€™½È€¡½¹ÍĞÉ½Ü½˜Í…Ù•‘A½ÍÑÌ¤¥‘	åM±Õœ¹Í•Ğ¡MÑÉ¥¹œ¡É½Ü¹Í±Õœ¤°9Õµ‰•È¡É½Ü¹¥¤¤ì4(€€€€€ô4(4(€€€€€½¹ÍĞÍ±ÕÌ€ôÍÑ…Ñ”¹Á½ÍÑÌ¹µ…À ¡Á½ÍĞ¤€ôøÁ½ÍĞ¹Í±Õœ¤ì4(€€€€€¥˜€¡Í±ÕÌ¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹Á½ÍÑÌİ¡•É”Í±Õœ¹½Ğ¥¸€‘íÑà¡Í±ÕÌ¥õ€ì4(€€€€€ô•±Í”ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹Á½ÍÑÍ€ì4(€€€€€ô4(4(€€€€€€¼¼ƒš&ç¦<ÕÁÍ•ÉĞƒš‚¶û–æÛ¦7–îëšZ®€·š‚¶û–Ï¢P4(€€€€€½¹ÍĞ…±±Q…9…µ•Ì€ôl¸¸¹¹•ÜM•Ğ¡ÍÑ…Ñ”¹Á½ÍÑÌ¹™±…Ñ5…À ¡Á½ÍĞ¤€ôøÁ½ÍĞ¹Ñ…Ì¤¥tì4(€€€€€½¹ÍĞÑ…%‘	å9…µ”€ô¹•Ü5…ÀñÍÑÉ¥¹œ°¹Õµ‰•Èø ¤ì4(€€€€€¥˜€¡…±±Q…9…µ•Ì¹±•¹Ñ ¤ì4(€€€€€€€½¹ÍĞÍ…Ù•‘Q…Ì€ô…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Ñ…Ì€‘íÑà 4(€€€€€€€€€€€…±±Q…9…µ•Ì¹µ…À ¡¹…µ”¤€ôø€¡ì¹…µ”ô¤¤°4(€€€€€€€€€€€€‰¹…µ”ˆ°4(€€€€€€€€€€¥ô4(€€€€€€€€€½¸½¹™±¥Ğ€¡¹…µ”¤‘¼ÕÁ‘…Ñ”Í•Ğ¹…µ”€ô•á±Õ‘•¹¹…µ”4(€€€€€€€€€É•ÑÕÉ¹¥¹œ¥°¹…µ”4(€€€€€€€€ì4(€€€€€€€™½È€¡½¹ÍĞÉ½Ü½˜Í…Ù•‘Q…Ì¤Ñ…%‘	å9…µ”¹Í•Ğ¡MÑÉ¥¹œ¡É½Ü¹¹…µ”¤°9Õµ‰•È¡É½Ü¹¥¤¤ì4(€€€€€ô4(4(€€€€€½¹ÍĞ­•ÁÑA½ÍÑ%‘Ì€ôl¸¸¹¥‘	åM±Õœ¹Ù…±Õ•Ì ¥tì4(€€€€€¥˜€¡­•ÁÑA½ÍÑ%‘Ì¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹Á½ÍÑ}Ñ…Ìİ¡•É”Á½ÍÑ}¥¥¸€‘íÑà¡­•ÁÑA½ÍÑ%‘Ì¥õ€ì4(€€€€€ô4(€€€€€½¹ÍĞÁ½ÍÑQ…I½İÌèìÁ½ÍÑ}¥è¹Õµ‰•ÈìÑ…}¥è¹Õµ‰•Èõmt€ômtì4(€€€€€™½È€¡½¹ÍĞÁ½ÍĞ½˜ÍÑ…Ñ”¹Á½ÍÑÌ¤ì4(€€€€€€€½¹ÍĞÁ¥€ô¥‘	åM±Õœ¹•Ğ¡Á½ÍĞ¹Í±Õœ¤ì4(€€€€€€€¥˜€ …Á¥¤½¹Ñ¥¹Õ”ì4(€€€€€€€™½È€¡½¹ÍĞÑ…9…µ”½˜Á½ÍĞ¹Ñ…Ì¤ì4(€€€€€€€€€½¹ÍĞÑ¥€ôÑ…%‘	å9…µ”¹•Ğ¡Ñ…9…µ”¤ì4(€€€€€€€€€¥˜€¡Ñ¥¤Á½ÍÑQ…I½İÌ¹ÁÕÍ ¡ìÁ½ÍÑ}¥èÁ¥°Ñ…}¥èÑ¥ô¤ì4(€€€€€€€ô4(€€€€€ô4(€€€€€¥˜€¡Á½ÍÑQ…I½İÌ¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Á½ÍÑ}Ñ…Ì€‘íÑà¡Á½ÍÑQ…I½İÌ°€‰Á½ÍÑ}¥ˆ°€‰Ñ…}¥ˆ¥ô4(€€€€€€€€€½¸½¹™±¥Ğ‘¼¹½Ñ¡¥¹œ4(€€€€€€€€ì4(€€€€€ô4(4(€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹Í¹…ÁÍ¡½ÑÍ€ì4(€€€€€™½È€¡½¹ÍĞÍ¹…ÁÍ¡½Ğ½˜ÍÑ…Ñ”¹Í¹…ÁÍ¡½ÑÌ¹Í±¥” À°€ÌÀ¤¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Í¹…ÁÍ¡½ÑÌ€ 4(€€€€€€€€€€€¥°±…‰•°°Á…å±½…°Á½ÍÑ}½Õ¹Ğ°…ÕÑ½µ…Ñ¥Œ°É•…Ñ•‘}‰ä°É•…Ñ•‘}…Ğ4(€€€€€€€€€€¤Ù…±Õ•Ì€ 4(€€€€€€€€€€€€‘íÍ¹…ÁÍ¡½Ğ¹¥‘ô°€‘íÍ¹…ÁÍ¡½Ğ¹±…‰•±ô°€‘íÑà¹©Í½¸¡Í¹…ÁÍ¡½Ğ¹‘…Ñ„¥ô°4(€€€€€€€€€€€€‘íÍ¹…ÁÍ¡½Ğ¹Á½ÍÑ½Õ¹Ñô°€‘í	½½±•…¸¡Í¹…ÁÍ¡½Ğ¹…ÕÑ¼¥ô°4(€€€€€€€€€€€€‘í½¹Ñ•áĞ¹ÕÍ•É%‘ôèéÕÕ¥°€‘íÍ¹…ÁÍ¡½Ğ¹É•…Ñ•‘Ñô4(€€€€€€€€€€¤4(€€€€€€€€ì4(€€€€€ô4(€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹…Õ‘¥Ñ}±½Í€ì4(€€€€€™½È€¡½¹ÍĞ•¹ÑÉä½˜ÍÑ…Ñ”¹…Õ‘¥Ğ¹Í±¥” À°€ÈÀÀ¤¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…Õ‘¥Ñ}±½Ì€ 4(€€€€€€€€€€€¥°…Ñ½È°…Ñ¥½¸°•¹Ñ¥Ñå}ÑåÁ”°•¹Ñ¥Ñå}¥°‘•Ñ…¥°°É•…Ñ•‘}…Ğ4(€€€€€€€€€€¤Ù…±Õ•Ì€ 4(€€€€€€€€€€€€‘í•¹ÑÉä¹¥‘ô°€‘í•¹ÑÉä¹…Ñ½Éô°€‘í•¹ÑÉä¹…Ñ¥½¹ô°€Í¹…ÁÍ¡½Ğœ°4(€€€€€€€€€€€€‘í•¹ÑÉä¹Í¹…ÁÍ¡½Ñ%€üü¹Õ±±ô°4(€€€€€€€€€€€€‘íÑà¹©Í½¸¡ì±…‰•°è•¹ÑÉä¹Í¹…ÁÍ¡½Ñ1…‰•°°µ•ÍÍ…”è•¹ÑÉä¹‘•Ñ…¥°ô¥ô°4(€€€€€€€€€€€€‘í•¹ÑÉä¹…Ñô4(€€€€€€€€€€¤4(€€€€€€€€ì4(€€€€€ô4(€€€ô¤ì4(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”°Í…Ù•‘Ğè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ôì4(€ô¤ì4(4)½¹ÍĞÍ•ÑAÕ‰±¥Í¡•‘%¹ÁÕĞ€ôè¹½‰©•Ğ¡ì4(€Í±Õœèè¹ÍÑÉ¥¹œ ¤¹µ¥¸ Ä¤¹µ…à ÌÀÀ¤°4(€ÁÕ‰±¥Í¡•èè¹‰½½±•…¸ ¤°4)ô¤ì4(4)•áÁ½ÉĞ½¹ÍĞÍ•ÑA½ÍÑAÕ‰±¥Í¡•€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤4(€€¹µ¥‘‘±•İ…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤4(€€¹Ù…±¥‘…Ñ½È ¡Ù…±Õ”èè¹¥¹™•ÈñÑåÁ•½˜Í•ÑAÕ‰±¥Í¡•‘%¹ÁÕĞø¤€ôøÍ•ÑAÕ‰±¥Í¡•‘%¹ÁÕĞ¹Á…ÉÍ”¡Ù…±Õ”¤¤4(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áĞô¤€ôøì4(€€€…İ…¥Ğ…ÍÍ•ÉÑ‘µ¥¸¡½¹Ñ•áĞ¹ÕÍ•É%¤ì4(€€€½¹ÍĞÍÅ°€ô‘ˆ ¤ì4(€€€½¹ÍĞmÉ½İt€ô…İ…¥ĞÍÅ±€4(€€€€€ÕÁ‘…Ñ”ÁÕ‰±¥Œ¹Á½ÍÑÌ4(€€€€€Í•ĞÁÕ‰±¥Í¡•€ô€‘í‘…Ñ„¹ÁÕ‰±¥Í¡•‘ô°ÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€İ¡•É”Í±Õœ€ô€‘í‘…Ñ„¹Í±Õô4(€€€€€É•ÑÕÉ¹¥¹œÍ±Õœ°ÁÕ‰±¥Í¡•4(€€€€ì4(€€€¥˜€ …É½Ü¤Ñ¡É½Ü¹•ÜÉÉ½È¡Á½ÍĞ¹½Ğ™½Õ¹è€‘í‘…Ñ„¹Í±Õõ€¤ì(€€€…‘µ¥¹A½ÍÑ½Õ¹Ñ…¡”¹±•…È ¤ì(€€€É•ÑÕÉ¸ì(€€€€€½¬èÑÉÕ”°4(€€€€€Í±ÕœèMÑÉ¥¹œ¡É½Ü¹Í±Õœ¤°4(€€€€€ÁÕ‰±¥Í¡•è	½½±•…¸¡É½Ü¹ÁÕ‰±¥Í¡•¤°4(€€€ôì4(€ô¤ì4(4)½¹ÍĞÍ¥¹±•A½ÍÑ%¹ÁÕĞ€ôè¹½‰©•Ğ¡ìÁ½ÍĞèè¹…¹ä ¤ô¤ì4(4)•áÁ½ÉĞ½¹ÍĞÕÁÍ•ÉÑM¥¹±•A½ÍĞ€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤4(€€¹µ¥‘‘±•İ…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤4(€€¹Ù…±¥‘…Ñ½È ¡Ù…±Õ”èè¹¥¹™•ÈñÑåÁ•½˜Í¥¹±•A½ÍÑ%¹ÁÕĞø¤€ôøÍ¥¹±•A½ÍÑ%¹ÁÕĞ¹Á…ÉÍ”¡Ù…±Õ”¤¤4(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áĞô¤€ôøì4(€€€…İ…¥Ğ…ÍÍ•ÉÑ‘µ¥¸¡½¹Ñ•áĞ¹ÕÍ•É%¤ì4(€€€½¹ÍĞÁ½ÍĞ€ô‘…Ñ„¹Á½ÍĞ…ÌA½ÍĞì4(€€€½¹ÍĞÍÅ°€ô‘ˆ ¤ì4(€€€½¹ÍĞ¹½İ%Í¼€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì4(€€€½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥ĞÍÅ°¹‰•¥¸¡…Íå¹Œ€¡Ñà¤€ôøì4(€€€€€…İ…¥ĞÑáÍ•±•ĞÁ}…‘Ù¥Í½Éå}á…Ñ}±½¬¡¡…Í¡Ñ•áĞ Ñ¥µ•…µ‰•É}½¹Ñ•¹Ñ}İÉ¥Ñ”œ¤¥€ì4(4(€€€€€¥˜€¡Á½ÍĞ¹…Ñ•½Éä¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹…Ñ•½É¥•Ì€¡¹…µ”°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€€€Ù…±Õ•Ì€ ‘íÁ½ÍĞ¹…Ñ•½Éåô°¹½Ü ¤¤4(€€€€€€€€€½¸½¹™±¥Ğ€¡¹…µ”¤‘¼ÕÁ‘…Ñ”Í•ĞÕÁ‘…Ñ•‘}…Ğ€ô¹½Ü ¤4(€€€€€€€€ì4(€€€€€ô4(4(€€€€€½¹ÍĞmÍ…Ù•‘t€ô…İ…¥ĞÑá€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Á½ÍÑÌ€‘íÑà 4(€€€€€€€€€l4(€€€€€€€€€€€ì4(€€€€€€€€€€€€€Í±ÕœèÁ½ÍĞ¹Í±Õœ°4(€€€€€€€€€€€€€Ñ¥Ñ±”èÁ½ÍĞ¹Ñ¥Ñ±”°4(€€€€€€€€€€€€€½¹Ñ•¹ĞèÁ½ÍĞ¹½¹Ñ•¹Ğ€üü€ˆˆ°4(€€€€€€€€€€€€€•á•ÉÁĞèÁ½ÍĞ¹•á•ÉÁĞ€üü€ˆˆ°4(€€€€€€€€€€€€€½Ù•É}¥µ…”èÁ½ÍĞ¹½Ù•È€üü€ˆˆ°4(€€€€€€€€€€€€€ÁÕ‰±¥Í¡•èÁ½ÍĞ¹ÍÑ…ÑÕÌ€„ôô€‰‘É…™Ğˆ°4(€€€€€€€€€€€€€±¥ÍÑ•èÑÉÕ”°4(€€€€€€€€€€€€€ÁÕ‰±¥Í¡}…ĞèÁ½ÍĞ¹ÁÕ‰±¥Í¡Ğñğ¹Õ±°°4(€€€€€€€€€€€€€…Ñ•½ÉäèÁ½ÍĞ¹…Ñ•½Éä€üü€ˆˆ°4(€€€€€€€€€€€€€Á½ÍÑ}ÑåÁ”èÁ½ÍĞ¹ÑåÁ”€üü€‰µ…É­‘½İ¸ˆ°4(€€€€€€€€€€€€€•áÑ•É¹…±}ÕÉ°èÁ½ÍĞ¹•áÑ•É¹…±UÉ°€üü¹Õ±°°4(€€€€€€€€€€€€€½Á•¹}¥¸èÁ½ÍĞ¹½Á•¹%¸€üü€‰}‰±…¹¬ˆ°4(€€€€€€€€€€€€€Í½ÕÉ”èÁ½ÍĞ¹Í½ÕÉ”€üü¹Õ±°°4(€€€€€€€€€€€€€¹½Ñ¥½¹}¥èÁ½ÍĞ¹¹½Ñ¥½¹%€üü¹Õ±°°4(€€€€€€€€€€€€€¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•èÁ½ÍĞ¹¹½Ñ¥½¹1…ÍÑ‘¥Ñ•€üü¹Õ±°°4(€€€€€€€€€€€€€É•…‘¥¹}µ¥¹ÕÑ•ÌèÁ½ÍĞ¹É•…‘¥¹5¥¹ÕÑ•Ìñğ€Ä°4(€€€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğè¹½İ%Í¼°4(€€€€€€€€€€€ô°4(€€€€€€€€€t°4(€€€€€€€€€€‰Í±Õœˆ°4(€€€€€€€€€€‰Ñ¥Ñ±”ˆ°4(€€€€€€€€€€‰½¹Ñ•¹Ğˆ°4(€€€€€€€€€€‰•á•ÉÁĞˆ°4(€€€€€€€€€€‰½Ù•É}¥µ…”ˆ°4(€€€€€€€€€€‰ÁÕ‰±¥Í¡•ˆ°4(€€€€€€€€€€‰±¥ÍÑ•ˆ°4(€€€€€€€€€€‰ÁÕ‰±¥Í¡}…Ğˆ°4(€€€€€€€€€€‰…Ñ•½Éäˆ°4(€€€€€€€€€€‰Á½ÍÑ}ÑåÁ”ˆ°4(€€€€€€€€€€‰•áÑ•É¹…±}ÕÉ°ˆ°4(€€€€€€€€€€‰½Á•¹}¥¸ˆ°4(€€€€€€€€€€‰Í½ÕÉ”ˆ°4(€€€€€€€€€€‰¹½Ñ¥½¹}¥ˆ°4(€€€€€€€€€€‰¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•ˆ°4(€€€€€€€€€€‰É•…‘¥¹}µ¥¹ÕÑ•Ìˆ°4(€€€€€€€€€€‰ÕÁ‘…Ñ•‘}…Ğˆ°4(€€€€€€€€¥ô4(€€€€€€€½¸½¹™±¥Ğ€¡Í±Õœ¤‘¼ÕÁ‘…Ñ”Í•Ğ4(€€€€€€€€€Ñ¥Ñ±”€ô•á±Õ‘•¹Ñ¥Ñ±”°4(€€€€€€€€€½¹Ñ•¹Ğ€ô•á±Õ‘•¹½¹Ñ•¹Ğ°4(€€€€€€€€€•á•ÉÁĞ€ô•á±Õ‘•¹•á•ÉÁĞ°4(€€€€€€€€€½Ù•É}¥µ…”€ô•á±Õ‘•¹½Ù•É}¥µ…”°4(€€€€€€€€€ÁÕ‰±¥Í¡•€ô•á±Õ‘•¹ÁÕ‰±¥Í¡•°4(€€€€€€€€€ÁÕ‰±¥Í¡}…Ğ€ô•á±Õ‘•¹ÁÕ‰±¥Í¡}…Ğ°4(€€€€€€€€€…Ñ•½Éä€ô•á±Õ‘•¹…Ñ•½Éä°4(€€€€€€€€€Á½ÍÑ}ÑåÁ”€ô•á±Õ‘•¹Á½ÍÑ}ÑåÁ”°4(€€€€€€€€€•áÑ•É¹…±}ÕÉ°€ô•á±Õ‘•¹•áÑ•É¹…±}ÕÉ°°4(€€€€€€€€€½Á•¹}¥¸€ô•á±Õ‘•¹½Á•¹}¥¸°4(€€€€€€€€€Í½ÕÉ”€ô•á±Õ‘•¹Í½ÕÉ”°4(€€€€€€€€€¹½Ñ¥½¹}¥€ô•á±Õ‘•¹¹½Ñ¥½¹}¥°4(€€€€€€€€€¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•€ô•á±Õ‘•¹¹½Ñ¥½¹}±…ÍÑ}•‘¥Ñ•°4(€€€€€€€€€É•…‘¥¹}µ¥¹ÕÑ•Ì€ô•á±Õ‘•¹É•…‘¥¹}µ¥¹ÕÑ•Ì°4(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğ€ô•á±Õ‘•¹ÕÁ‘…Ñ•‘}…Ğ4(€€€€€€€É•ÑÕÉ¹¥¹œ¥°Í±Õœ4(€€€€€€ì4(€€€€€½¹ÍĞÁ½ÍÑ%€ô9Õµ‰•È¡Í…Ù•¹¥¤ì4(4(€€€€€½¹ÍĞÕ¹¥ÅÕ•Q…Ì€ôl¸¸¹¹•ÜM•Ğ¡ÉÉ…ä¹¥ÍÉÉ…ä¡Á½ÍĞ¹Ñ…Ì¤€üÁ½ÍĞ¹Ñ…Ì€èmt¥tì4(€€€€€½¹ÍĞÑ…%‘	å9…µ”€ô¹•Ü5…ÀñÍÑÉ¥¹œ°¹Õµ‰•Èø ¤ì4(€€€€€¥˜€¡Õ¹¥ÅÕ•Q…Ì¹±•¹Ñ ¤ì4(€€€€€€€½¹ÍĞÍ…Ù•‘Q…Ì€ô…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Ñ…Ì€‘íÑà 4(€€€€€€€€€€€Õ¹¥ÅÕ•Q…Ì¹µ…À ¡¹…µ”¤€ôø€¡ì¹…µ”ô¤¤°4(€€€€€€€€€€€€‰¹…µ”ˆ°4(€€€€€€€€€€¥ô4(€€€€€€€€€½¸½¹™±¥Ğ€¡¹…µ”¤‘¼ÕÁ‘…Ñ”Í•Ğ¹…µ”€ô•á±Õ‘•¹¹…µ”4(€€€€€€€€€É•ÑÕÉ¹¥¹œ¥°¹…µ”4(€€€€€€€€ì4(€€€€€€€™½È€¡½¹ÍĞÉ½Ü½˜Í…Ù•‘Q…Ì¤Ñ…%‘	å9…µ”¹Í•Ğ¡MÑÉ¥¹œ¡É½Ü¹¹…µ”¤°9Õµ‰•È¡É½Ü¹¥¤¤ì4(€€€€€ô4(4(€€€€€…İ…¥ĞÑá‘•±•Ñ”™É½´ÁÕ‰±¥Œ¹Á½ÍÑ}Ñ…Ìİ¡•É”Á½ÍÑ}¥€ô€‘íÁ½ÍÑ%‘õ€ì4(€€€€€½¹ÍĞÑ…I½İÌ€ôÕ¹¥ÅÕ•Q…Ì4(€€€€€€€€¹µ…À ¡¹…µ”¤€ôøÑ…%‘	å9…µ”¹•Ğ¡¹…µ”¤¤4(€€€€€€€€¹™¥±Ñ•È ¡¥¤è¥¥Ì¹Õµ‰•È€ôøÑåÁ•½˜¥€ôôô€‰¹Õµ‰•Èˆ¤4(€€€€€€€€¹µ…À ¡Ñ…%¤€ôø€¡ìÁ½ÍÑ}¥èÁ½ÍÑ%°Ñ…}¥èÑ…%ô¤¤ì4(€€€€€¥˜€¡Ñ…I½İÌ¹±•¹Ñ ¤ì4(€€€€€€€…İ…¥ĞÑá€4(€€€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹Á½ÍÑ}Ñ…Ì€‘íÑà¡Ñ…I½İÌ°€‰Á½ÍÑ}¥ˆ°€‰Ñ…}¥ˆ¥ô4(€€€€€€€€€½¸½¹™±¥Ğ‘¼¹½Ñ¡¥¹œ4(€€€€€€€€ì4(€€€€€ô4(4(€€€€€É•ÑÕÉ¸ì¥èÁ½ÍÑ%°Í±ÕœèMÑÉ¥¹œ¡Í…Ù•¹Í±Õœ¤ôì4(€€€ô¤ì(€€€…‘µ¥¹A½ÍÑ½Õ¹Ñ…¡”¹±•…È ¤ì(€€€É•ÑÕÉ¸ì(€€€€€½¬èÑÉÕ”°(€€€€€¥èÉ•ÍÕ±Ğ¹¥°(€€€€€Í±ÕœèÉ•ÍÕ±Ğ¹Í±Õœ°4(€€€€€ÁÕ‰±¥Í¡•èÁ½ÍĞ¹ÍÑ…ÑÕÌ€„ôô€‰‘É…™Ğˆ°4(€€€€€Í…Ù•‘Ğè¹½İ%Í¼°4(€€€ôì4(€ô¤ì4(4)½¹ÍĞÑ•±•µ•ÑÉå%¹ÁÕĞ€ôè¹½‰©•Ğ¡ì4(€ÑåÁ”èè¹•¹Õ´¡l‰Á…•}Ù¥•Üˆ°€‰½¹Ñ…Ğ‰t¤°4(€Á…Ñ èè¹ÍÑÉ¥¹œ ¤¹µ…à ÔÀÀ¤¹½ÁÑ¥½¹…° ¤°4(€É•™•ÉÉ•Èèè¹ÍÑÉ¥¹œ ¤¹µ…à ÄÀÀÀ¤¹½ÁÑ¥½¹…° ¤°4(€¡…¹¹•°èè¹ÍÑÉ¥¹œ ¤¹µ…à ÄÀÀ¤¹½ÁÑ¥½¹…° ¤°4)ô¤ì4(4)•áÁ½ÉĞ½¹ÍĞÉ•½É‘Q•±•µ•ÑÉä€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤4(€€¹Ù…±¥‘…Ñ½È ¡Ù…±Õ”èè¹¥¹™•ÈñÑåÁ•½˜Ñ•±•µ•ÑÉå%¹ÁÕĞø¤€ôøÑ•±•µ•ÑÉå%¹ÁÕĞ¹Á…ÉÍ”¡Ù…±Õ”¤¤4(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„ô¤€ôøì4(€€€¥˜€¡‘…Ñ„¹ÑåÁ”€ôôô€‰½¹Ñ…Ğˆ€˜˜‘…Ñ„¹¡…¹¹•°¤ì4(€€€€€…İ…¥Ğ‘ˆ ¥€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹½¹Ñ…Ñ}•Ù•¹ÑÌ€¡¡…¹¹•°°Á…Ñ ¤4(€€€€€€€Ù…±Õ•Ì€ ‘í‘…Ñ„¹¡…¹¹•±ô°€‘í‘…Ñ„¹Á…Ñ €üü¹Õ±±ô¤4(€€€€€€ì4(€€€ô•±Í”¥˜€¡‘…Ñ„¹ÑåÁ”€ôôô€‰Á…•}Ù¥•Üˆ¤ì4(€€€€€…İ…¥Ğ‘ˆ ¥€4(€€€€€€€¥¹Í•ÉĞ¥¹Ñ¼ÁÕ‰±¥Œ¹‘¥…¹½ÍÑ¥}•Ù•¹ÑÌ€¡•Ù•¹Ñ}ÑåÁ”°Á…Ñ °Á…å±½…¤4(€€€€€€€Ù…±Õ•Ì€ Á…•}Ù¥•Üœ°€‘í‘…Ñ„¹Á…Ñ €üü€ˆ¼‰ô°€‘í‘ˆ ¤¹©Í½¸¡ìÉ•™•ÉÉ•Èè‘…Ñ„¹É•™•ÉÉ•Èô¥ô¤4(€€€€€€ì4(€€€ô4(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”ôì4(€ô¤ì4