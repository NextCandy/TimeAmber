import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminState, CoreData } from "@/lib/admin-store";
import type { Post } from "@/lib/sample-posts";
import { getOfflineHtmlUrl } from "@/lib/offline-html";

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

async function loadMediaItems(): Promise<AdminState["media"]> {
  const rows = await db()`
    select * from public.media_items order by created_at desc limit 500
  `;
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    url: mediaPublicUrl(row),
    size: row.size_bytes == null ? undefined : Number(row.size_bytes),
    source: row.source as AdminState["media"][number]["source"],
    uploadedAt: asDate(row.created_at),
  }));
}

async function loadPosts(admin: boolean): Promise<Post[]> {
  const sql = db();
  // 公开查询刻意不取 source / notion_id / notion_last_edited：
  // 这份结果会被 root loader 序列化进**每一个页面**的 hydration payload（1921 篇），
  // 而这三个字段前台列表一个都用不到 —— notion_* 只有后台 backup 页在用（走 admin 分支的
  // select *），文章页的「原文」链接来自 posts.$slug 自己的 loadPublicPost。
  const rows = admin
    ? await sql`select * from public.posts order by pinned desc, created_at desc`
    : await sql`
        select
          id, slug, title, excerpt, category, publish_at, created_at,
          reading_minutes, published, cover_image,
          case
            when post_type = 'html'
              or content like '<!-- timeamber-offline-html:v1%'
            then 'html'
            else post_type
          end as post_type,
          coalesce(
            nullif(external_url, ''),
            case
              when content like '<!-- timeamber-offline-html:v1%'
              then substring(content from 'url:([^ ]+)')
            end
          ) as external_url,
          open_in
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
  return rows.map((row) => {
    const offlineHtmlUrl = getOfflineHtmlUrl(row.content);
    const externalUrl = row.external_url ? String(row.external_url) : offlineHtmlUrl;
    const post: Post = {
      slug: String(row.slug),
      title: String(row.title),
      excerpt: String(row.excerpt ?? ""),
      category: String(row.category ?? ""),
      tags: tagMap.get(Number(row.id)) ?? [],
      publishAt: asDate(row.publish_at ?? row.created_at),
      readingMinutes: Number(row.reading_minutes ?? 1),
      status: row.published ? "published" : "draft",
      type: row.post_type === "html" || !!offlineHtmlUrl ? "html" : "markdown",
      openIn: row.open_in === "_self" ? "_self" : "_blank",
    };
    // 只在真有值时才挂键。这份结果会被序列化进**每个页面**的 hydration payload，
    // 写成 `key: undefined` 序列化后是 `key:void 0`，1921 篇 × 6 个键白占约 100 KB。
    if (row.source) post.source = String(row.source);
    if (row.content != null) post.content = String(row.content);
    if (row.cover_image) post.cover = String(row.cover_image);
    if (externalUrl) post.externalUrl = externalUrl;
    if (row.notion_id) post.notionId = String(row.notion_id);
    if (row.notion_last_edited) post.notionLastEdited = asDate(row.notion_last_edited);
    return post;
  });
}

async function readConfig<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db()`select value from public.app_config where key = ${key}`;
  return (row?.value as T | undefined) ?? fallback;
}

async function readSecret<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db()`select encrypted_value from public.secret_config where key = ${key}`;
  return decryptJson<T>(row?.encrypted_value as string | undefined, fallback);
}

async function loadCore(admin: boolean): Promise<Partial<AdminState>> {
  const sql = db();
  const [posts, categories, tags, friends, settings, schedule] = await Promise.all([
    loadPosts(admin),
    sql`select name from public.categories order by name`,
    sql`select name from public.tags order by name`,
    admin
      ? sql`select * from public.friends order by sort_order, name`
      : sql`select * from public.friends where published = true order by sort_order, name`,
    readConfig("site", {}),
    readConfig("backup_schedule", {}),
  ]);

  return {
    posts,
    categories: categories.map((row) => ({ name: String(row.name) })),
    tags: tags.map((row) => ({ name: String(row.name) })),
    friends: friends.map((row) => ({
      name: String(row.name),
      url: String(row.url),
      desc: String(row.description ?? ""),
      icon: row.icon ? String(row.icon) : undefined,
      group: row.group_name ? String(row.group_name) : undefined,
    })),
    settings: settings as AdminState["settings"],
    schedule: schedule as AdminState["schedule"],
  };
}

async function assertAdmin(userId: string) {
  const [profile] = await db()`
    select role from public.profiles where user_id = ${userId}::uuid
  `;
  if (profile?.role !== "admin") throw new Error("Administrator access required");
}

export const loadPublicState = createServerFn({ method: "GET" }).handler(
  async (): Promise<Partial<AdminState>> => loadCore(false),
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
  .inputValidator((value: z.infer<typeof publicPostInput>) => publicPostInput.parse(value))
  .handler(async ({ data }): Promise<Post | null> => {
    const sql = db();
    const [row] = await sql`
      select *
      from public.posts
      where slug = ${data.slug}
        and published = true
        and (publish_at is null or publish_at <= now())
      limit 1
    `;
    if (!row) return null;
    const tagRows = await sql`
      select t.name
      from public.post_tags pt
      join public.tags t on t.id = pt.tag_id
      where pt.post_id = ${row.id}
      order by t.name
    `;
    const content = String(row.content ?? "");
    const offlineHtmlUrl = getOfflineHtmlUrl(content);
    const externalUrl = row.external_url ? String(row.external_url) : offlineHtmlUrl;
    return {
      slug: String(row.slug),
      title: String(row.title),
      excerpt: String(row.excerpt ?? ""),
      category: String(row.category ?? ""),
      tags: tagRows.map((tag) => String(tag.name)),
      publishAt: asDate(row.publish_at ?? row.created_at),
      readingMinutes: Number(row.reading_minutes ?? 1),
      source: row.source ? String(row.source) : undefined,
      content,
      status: "published",
      cover: row.cover_image ? String(row.cover_image) : undefined,
      type: row.post_type === "html" || !!offlineHtmlUrl ? "html" : "markdown",
      externalUrl,
      openIn: row.open_in === "_self" ? "_self" : "_blank",
      notionId: row.notion_id ? String(row.notion_id) : undefined,
      notionLastEdited: row.notion_last_edited ? asDate(row.notion_last_edited) : undefined,
    };
  });

export const loadAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Partial<AdminState>> => {
    await assertAdmin(context.userId);
    const sql = db();
    const [
      core,
      cloud,
      ai,
      snapshots,
      audit,
      analytics,
      alerts,
      receipts,
      mediaFailures,
      diagnostics,
      contacts,
    ] = await Promise.all([
      loadCore(true),
      readSecret("cloud", {}),
      readSecret("ai", {}),
      sql`select * from public.snapshots order by created_at desc limit 30`,
      sql`select * from public.audit_logs order by created_at desc limit 200`,
      sql`
        select created_at, path, payload->>'referrer' as referrer
        from public.diagnostic_events
        where event_type = 'page_view'
          and created_at >= (
            ((now() at time zone 'Asia/Shanghai')::date - 13)::timestamp
            at time zone 'Asia/Shanghai'
          )
        order by created_at desc
        limit 10000
      `,
      sql`select * from public.alerts order by created_at desc limit 100`,
      sql`select * from public.notification_receipts order by created_at desc limit 100`,
      sql`select * from public.media_jobs where status = 'failed' order by updated_at desc limit 100`,
      sql`select * from public.diagnostic_events where event_type = 'archive' order by created_at desc limit 20`,
      sql`select channel, count(*)::int as count, max(created_at) as last_at from public.contact_events group by channel`,
    ]);
    const contactClicks: Record<string, number> = {};
    const contactLastAt: Record<string, string> = {};
    for (const row of contacts) {
      contactClicks[String(row.channel)] = Number(row.count);
      contactLastAt[String(row.channel)] = asDate(row.last_at);
    }
    return {
      ...core,
      cloud,
      ai: ai as AdminState["ai"],
      snapshots: snapshots.map((row) => ({
        id: String(row.id),
        createdAt: asDate(row.created_at),
        label: String(row.label),
        postCount: Number(row.post_count),
        data: row.payload as CoreData,
        auto: Boolean(row.automatic),
      })),
      audit: audit.map((row) => ({
        id: String(row.id),
        at: asDate(row.created_at),
        actor: String(row.actor),
        action: row.action,
        snapshotId: row.entity_type === "snapshot" ? String(row.entity_id ?? "") : undefined,
        detail: row.detail?.message,
      })),
      analytics: analytics.map((row) => ({
        at: asDate(row.created_at),
        path: String(row.path ?? "/"),
        referrer: row.referrer ? String(row.referrer) : undefined,
      })),
      alerts: alerts.map((row) => ({
        id: String(row.id),
        at: asDate(row.created_at),
        level: row.level,
        source: String(row.source),
        message: String(row.message),
        acknowledged: Boolean(row.acknowledged),
      })),
      notifyReceipts: receipts.map((row) => ({
        id: String(row.id),
        at: asDate(row.created_at),
        channel: row.channel,
        ok: Boolean(row.ok),
        title: String(row.title),
        message: row.message ? String(row.message) : undefined,
      })),
      mediaFailures: mediaFailures.map((row) => ({
        id: String(row.id),
        at: asDate(row.updated_at),
        name: String(row.payload?.name ?? "media"),
        size: row.payload?.size,
        contentType: row.payload?.contentType,
        attempts: Number(row.attempts),
        error: String(row.last_error ?? "Unknown error"),
      })),
      diagnosticsArchives: diagnostics.map((row) => ({
        id: String(row.id),
        at: asDate(row.created_at),
        perfs: Number(row.payload?.perfs ?? 0),
        logs: Number(row.payload?.logs ?? 0),
        errorCount: Number(row.payload?.errorCount ?? 0),
        warnCount: Number(row.payload?.warnCount ?? 0),
        payload: JSON.stringify(row.payload?.payload ?? {}),
      })),
      contactClicks,
      contactLastAt,
    };
  });

export const loadAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminState["analytics"]> => {
    await assertAdmin(context.userId);
    const rows = await db()`
      select created_at, path, payload->>'referrer' as referrer
      from public.diagnostic_events
      where event_type = 'page_view'
        and created_at >= (
          ((now() at time zone 'Asia/Shanghai')::date - 13)::timestamp
          at time zone 'Asia/Shanghai'
        )
      order by created_at desc
      limit 10000
    `;
    return rows.map((row) => ({
      at: asDate(row.created_at),
      path: String(row.path ?? "/"),
      referrer: row.referrer ? String(row.referrer) : undefined,
    }));
  });

export const loadAdminMediaState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Pick<AdminState, "media">> => {
    await assertAdmin(context.userId);
    return { media: await loadMediaItems() };
  });

const taxonomyNameInput = z.object({ name: z.string().trim().min(1).max(120) });
const taxonomyRenameInput = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
});

/*
 * 分类与标签的轻量写入。
 * 这些操作原本只改浏览器状态，靠防抖的 persistAdminState 落库，
 * 而那个接口会连带重写全部文章，慢且常超时 —— 改动经常写不进去。
 * 下面每个动作只碰自己那张表，前端可以同步等结果。
 */

export const addCategoryRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof taxonomyNameInput>) => taxonomyNameInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await db()`
      insert into public.categories (name, updated_at) values (${data.name}, now())
      on conflict (name) do update set updated_at = now()
    `;
    return { ok: true as const };
  });

export const renameCategoryRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof taxonomyRenameInput>) => taxonomyRenameInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.from === data.to) return { ok: true as const };
    const sql = db();
    // 先建目标分类再迁移文章，最后删旧的 —— 重名时等于把两个分类合并，不会撞唯一约束。
    await sql.begin(async (tx) => {
      await tx`
        insert into public.categories (name, updated_at) values (${data.to}, now())
        on conflict (name) do update set updated_at = now()
      `;
      await tx`
        update public.posts set category = ${data.to}, updated_at = now()
        where category = ${data.from}
      `;
      await tx`delete from public.categories where name = ${data.from}`;
    });
    return { ok: true as const };
  });

export const deleteCategoryRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof taxonomyNameInput>) => taxonomyNameInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await db()`delete from public.categories where name = ${data.name}`;
    return { ok: true as const };
  });

export const addTagRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof taxonomyNameInput>) => taxonomyNameInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await db()`
      insert into public.tags (name) values (${data.name}) on conflict (name) do nothing
    `;
    return { ok: true as const };
  });

export const deleteTagRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: z.infer<typeof taxonomyNameInput>) => taxonomyNameInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // post_tags.tag_id 是 ON DELETE CASCADE，关联关系会跟着清掉。
    await db()`delete from public.tags where name = ${data.name}`;
    return { ok: true as const };
  });

const friendsInput = z.object({ friends: z.any() });

/**
 * 只写友链表。
 * 走 persistAdminState 会连带重写全部文章（一两千篇），又慢又容易超时 ——
 * 友链改动因此经常写不进库。这里单独写 friends，前端可以同步等结果。
 */
export const saveFriends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof friendsInput>) => friendsInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const list = (data.friends ?? []) as {
      name: string;
      url: string;
      desc?: string;
      icon?: string;
      group?: string;
    }[];
    const sql = db();
    await sql.begin(async (tx) => {
      for (const friend of list) {
        await tx`
          insert into public.friends (name, url, description, icon, group_name, updated_at)
          values (${friend.name}, ${friend.url}, ${friend.desc ?? ""},
                  ${friend.icon ?? null}, ${friend.group ?? null}, now())
          on conflict (name) do update
            set url = excluded.url, description = excluded.description,
                icon = excluded.icon, group_name = excluded.group_name, updated_at = now()
        `;
      }
      const names = list.map((item) => item.name);
      if (names.length) {
        await tx`delete from public.friends where name not in ${tx(names)}`;
      } else {
        await tx`delete from public.friends`;
      }
    });
    return { ok: true as const };
  });

const siteSettingsInput = z.object({ settings: z.any() });

/**
 * 只写站点设置。
 * persistAdminState 会在同一个事务里重写全部文章，设置页保存不该付这个代价，
 * 也正因为重，它只能防抖延后执行、无法给出真实的保存结果。
 * 这里单独写 app_config.site，设置页就能同步等结果再提示成功/失败。
 */
export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof siteSettingsInput>) => siteSettingsInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sql = db();
    await sql`
      insert into public.app_config (key, value, public_read, updated_at)
      values ('site', ${sql.json(data.settings)}, true, now())
      on conflict (key) do update
        set value = excluded.value, public_read = true, updated_at = now()
    `;
    return { ok: true as const };
  });

const stateInput = z.object({ state: z.any() });

export const persistAdminState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof stateInput>) => stateInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const state = data.state as AdminState;
    const sql = db();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('timeamber_content_write'))`;

      await tx`
        insert into public.app_config (key, value, public_read, updated_at)
        values ('site', ${tx.json(state.settings)}, true, now())
        on conflict (key) do update
          set value = excluded.value, public_read = true, updated_at = now()
      `;
      await tx`
        insert into public.app_config (key, value, public_read, updated_at)
        values ('backup_schedule', ${tx.json(state.schedule)}, false, now())
        on conflict (key) do update
          set value = excluded.value, public_read = false, updated_at = now()
      `;
      await tx`
        insert into public.secret_config (key, encrypted_value, updated_at)
        values ('cloud', ${encryptJson(state.cloud)}, now()), ('ai', ${encryptJson(state.ai)}, now())
        on conflict (key) do update
          set encrypted_value = excluded.encrypted_value, updated_at = now()
      `;

      for (const category of state.categories) {
        await tx`
          insert into public.categories (name, updated_at)
          values (${category.name}, now())
          on conflict (name) do update set updated_at = now()
        `;
      }
      const categoryNames = state.categories.map((item) => item.name);
      if (categoryNames.length) {
        await tx`delete from public.categories where name not in ${tx(categoryNames)}`;
      }

      for (const friend of state.friends) {
        await tx`
          insert into public.friends (name, url, description, icon, group_name, updated_at)
          values (${friend.name}, ${friend.url}, ${friend.desc}, ${friend.icon ?? null}, ${friend.group ?? null}, now())
          on conflict (name) do update
            set url = excluded.url, description = excluded.description,
                icon = excluded.icon, group_name = excluded.group_name, updated_at = now()
        `;
      }
      const friendNames = state.friends.map((item) => item.name);
      if (friendNames.length) {
        await tx`delete from public.friends where name not in ${tx(friendNames)}`;
      } else {
        await tx`delete from public.friends`;
      }

      // 批量 upsert 文章（替代逐条写，避免超长事务经隧道超时）
      const nowIso = new Date().toISOString();
      const idBySlug = new Map<string, number>();
      if (state.posts.length) {
        const postRows = state.posts.map((post) => ({
          slug: post.slug,
          title: post.title,
          content: post.content ?? "",
          excerpt: post.excerpt,
          cover_image: post.cover ?? "",
          published: post.status !== "draft",
          listed: true,
          publish_at: post.publishAt || null,
          category: post.category,
          post_type: post.type ?? "markdown",
          external_url: post.externalUrl ?? null,
          open_in: post.openIn ?? "_blank",
          source: post.source ?? null,
          notion_id: post.notionId ?? null,
          notion_last_edited: post.notionLastEdited ?? null,
          reading_minutes: post.readingMinutes || 1,
          updated_at: nowIso,
        }));
        const savedPosts = await tx`
          insert into public.posts ${tx(
            postRows,
            "slug",
            "title",
            "content",
            "excerpt",
            "cover_image",
            "published",
            "listed",
            "publish_at",
            "category",
            "post_type",
            "external_url",
            "open_in",
            "source",
            "notion_id",
            "notion_last_edited",
            "reading_minutes",
            "updated_at",
          )}
          on conflict (slug) do update set
            title = excluded.title,
            content = excluded.content,
            excerpt = excluded.excerpt,
            cover_image = excluded.cover_image,
            published = excluded.published,
            publish_at = excluded.publish_at,
            category = excluded.category,
            post_type = excluded.post_type,
            external_url = excluded.external_url,
            open_in = excluded.open_in,
            source = excluded.source,
            notion_id = excluded.notion_id,
            notion_last_edited = excluded.notion_last_edited,
            reading_minutes = excluded.reading_minutes,
            updated_at = excluded.updated_at
          returning id, slug
        `;
        for (const row of savedPosts) idBySlug.set(String(row.slug), Number(row.id));
      }

      const slugs = state.posts.map((post) => post.slug);
      if (slugs.length) {
        await tx`delete from public.posts where slug not in ${tx(slugs)}`;
      } else {
        await tx`delete from public.posts`;
      }

      // 批量 upsert 标签并重建文章-标签关联
      const allTagNames = [...new Set(state.posts.flatMap((post) => post.tags))];
      const tagIdByName = new Map<string, number>();
      if (allTagNames.length) {
        const savedTags = await tx`
          insert into public.tags ${tx(
            allTagNames.map((name) => ({ name })),
            "name",
          )}
          on conflict (name) do update set name = excluded.name
          returning id, name
        `;
        for (const row of savedTags) tagIdByName.set(String(row.name), Number(row.id));
      }

      const keptPostIds = [...idBySlug.values()];
      if (keptPostIds.length) {
        await tx`delete from public.post_tags where post_id in ${tx(keptPostIds)}`;
      }
      const postTagRows: { post_id: number; tag_id: number }[] = [];
      for (const post of state.posts) {
        const pid = idBySlug.get(post.slug);
        if (!pid) continue;
        for (const tagName of post.tags) {
          const tid = tagIdByName.get(tagName);
          if (tid) postTagRows.push({ post_id: pid, tag_id: tid });
        }
      }
      if (postTagRows.length) {
        await tx`
          insert into public.post_tags ${tx(postTagRows, "post_id", "tag_id")}
          on conflict do nothing
        `;
      }

      await tx`delete from public.snapshots`;
      for (const snapshot of state.snapshots.slice(0, 30)) {
        await tx`
          insert into public.snapshots (
            id, label, payload, post_count, automatic, created_by, created_at
          ) values (
            ${snapshot.id}, ${snapshot.label}, ${tx.json(snapshot.data)},
            ${snapshot.postCount}, ${Boolean(snapshot.auto)},
            ${context.userId}::uuid, ${snapshot.createdAt}
          )
        `;
      }
      await tx`delete from public.audit_logs`;
      for (const entry of state.audit.slice(0, 200)) {
        await tx`
          insert into public.audit_logs (
            id, actor, action, entity_type, entity_id, detail, created_at
          ) values (
            ${entry.id}, ${entry.actor}, ${entry.action}, 'snapshot',
            ${entry.snapshotId ?? null},
            ${tx.json({ label: entry.snapshotLabel, message: entry.detail })},
            ${entry.at}
          )
        `;
      }
    });
    return { ok: true, savedAt: new Date().toISOString() };
  });

const setPublishedInput = z.object({
  slug: z.string().min(1).max(300),
  published: z.boolean(),
});

export const setPostPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof setPublishedInput>) => setPublishedInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sql = db();
    const [row] = await sql`
      update public.posts
      set published = ${data.published}, updated_at = now()
      where slug = ${data.slug}
      returning slug, published
    `;
    if (!row) throw new Error(`post not found: ${data.slug}`);
    return {
      ok: true,
      slug: String(row.slug),
      published: Boolean(row.published),
    };
  });

const singlePostInput = z.object({ post: z.any() });

export const upsertSinglePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof singlePostInput>) => singlePostInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const post = data.post as Post;
    const sql = db();
    const nowIso = new Date().toISOString();
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('timeamber_content_write'))`;

      if (post.category) {
        await tx`
          insert into public.categories (name, updated_at)
          values (${post.category}, now())
          on conflict (name) do update set updated_at = now()
        `;
      }

      const [saved] = await tx`
        insert into public.posts ${tx(
          [
            {
              slug: post.slug,
              title: post.title,
              content: post.content ?? "",
              excerpt: post.excerpt ?? "",
              cover_image: post.cover ?? "",
              published: post.status !== "draft",
              listed: true,
              publish_at: post.publishAt || null,
              category: post.category ?? "",
              post_type: post.type ?? "markdown",
              external_url: post.externalUrl ?? null,
              open_in: post.openIn ?? "_blank",
              source: post.source ?? null,
              notion_id: post.notionId ?? null,
              notion_last_edited: post.notionLastEdited ?? null,
              reading_minutes: post.readingMinutes || 1,
              updated_at: nowIso,
            },
          ],
          "slug",
          "title",
          "content",
          "excerpt",
          "cover_image",
          "published",
          "listed",
          "publish_at",
          "category",
          "post_type",
          "external_url",
          "open_in",
          "source",
          "notion_id",
          "notion_last_edited",
          "reading_minutes",
          "updated_at",
        )}
        on conflict (slug) do update set
          title = excluded.title,
          content = excluded.content,
          excerpt = excluded.excerpt,
          cover_image = excluded.cover_image,
          published = excluded.published,
          publish_at = excluded.publish_at,
          category = excluded.category,
          post_type = excluded.post_type,
          external_url = excluded.external_url,
          open_in = excluded.open_in,
          source = excluded.source,
          notion_id = excluded.notion_id,
          notion_last_edited = excluded.notion_last_edited,
          reading_minutes = excluded.reading_minutes,
          updated_at = excluded.updated_at
        returning id, slug
      `;
      const postId = Number(saved.id);

      const uniqueTags = [...new Set(Array.isArray(post.tags) ? post.tags : [])];
      const tagIdByName = new Map<string, number>();
      if (uniqueTags.length) {
        const savedTags = await tx`
          insert into public.tags ${tx(
            uniqueTags.map((name) => ({ name })),
            "name",
          )}
          on conflict (name) do update set name = excluded.name
          returning id, name
        `;
        for (const row of savedTags) tagIdByName.set(String(row.name), Number(row.id));
      }

      await tx`delete from public.post_tags where post_id = ${postId}`;
      const tagRows = uniqueTags
        .map((name) => tagIdByName.get(name))
        .filter((id): id is number => typeof id === "number")
        .map((tagId) => ({ post_id: postId, tag_id: tagId }));
      if (tagRows.length) {
        await tx`
          insert into public.post_tags ${tx(tagRows, "post_id", "tag_id")}
          on conflict do nothing
        `;
      }

      return { id: postId, slug: String(saved.slug) };
    });
    return {
      ok: true,
      id: result.id,
      slug: result.slug,
      published: post.status !== "draft",
      savedAt: nowIso,
    };
  });

const telemetryInput = z.object({
  type: z.enum(["page_view", "contact"]),
  path: z.string().max(500).optional(),
  referrer: z.string().max(1000).optional(),
  channel: z.string().max(100).optional(),
});

export const recordTelemetry = createServerFn({ method: "POST" })
  .inputValidator((value: z.infer<typeof telemetryInput>) => telemetryInput.parse(value))
  .handler(async ({ data }) => {
    if (data.type === "contact" && data.channel) {
      await db()`
        insert into public.contact_events (channel, path)
        values (${data.channel}, ${data.path ?? null})
      `;
    } else if (data.type === "page_view") {
      await db()`
        insert into public.diagnostic_events (event_type, path, payload)
        values ('page_view', ${data.path ?? "/"}, ${db().json({ referrer: data.referrer })})
      `;
    }
    return { ok: true };
  });
