import { createCipheriv, createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.TIMEAMBER_SECRET_KEY;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!secret || secret.length < 32) {
  throw new Error("TIMEAMBER_SECRET_KEY must contain at least 32 characters");
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});

function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function completionEndpoint(value) {
  const base = value.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

try {
  const rows = await sql`select key, value from public.settings`;
  const legacy = new Map(rows.map((row) => [String(row.key), String(row.value ?? "")]));
  const value = (key, fallback = "") => legacy.get(key)?.trim() || fallback;
  const existingRows = await sql`
    select key from public.app_config
    union all
    select key from public.secret_config
  `;
  const existing = new Set(existingRows.map((row) => String(row.key)));

  if (!existing.has("site")) {
    const site = {
      siteTitle: value("site_title", "TimeAmber"),
      siteTagline: value("site_description", "时光琥珀"),
      siteDescription: value("site_tagline", "时光成珀，字字如初。"),
      aboutIntro:
        "TimeAmber，中文名「时光琥珀」。这里存放值得长期保存的剪藏、笔记、自建服务记录，以及 AI Agent 工程实践。",
      aboutQuote: value("site_tagline", "时光成珀，字字如初。"),
      aboutTechStack:
        "前端：React 19 + TanStack Start + Tailwind CSS v4\n后端：TanStack Server Functions + PostgreSQL\n平台：自托管 Supabase（Auth、Storage、Realtime）\n部署：Docker，运行在 NAS 自托管环境\n同步：Notion 与 web-archive 独立 worker",
      contactEmail: value("email"),
      contactGithub: value("github_url"),
      contactTwitter: value("twitter_url"),
      contactTelegram: "",
      contactX: value("twitter_url"),
      contactWechat: "",
      contactQQ: "",
      contactXiaohongshu: "",
      contactDouyin: "",
      contactNote: "如果你想交换友链，或者只是想说句话，邮件是最稳的方式。",
      contactQR: {},
      githubRepo: "",
      githubBranch: "",
    };
    await sql`
      insert into public.app_config (key, value, public_read, updated_at)
      values ('site', ${sql.json(site)}, true, now())
    `;
  }

  if (!existing.has("backup_schedule")) {
    await sql`
      insert into public.app_config (key, value, public_read, updated_at)
      values (
        'backup_schedule',
        ${sql.json({
          enabled: false,
          frequency: "daily",
          retention: 30,
          timezone: "Asia/Shanghai",
          windowStart: 2,
          windowEnd: 5,
        })},
        false,
        now()
      )
    `;
  }

  if (!existing.has("cloud")) {
    const webdavPath = value("webdav_path", "/TimeAmber").replace(/\/+$/, "");
    const notionToken = value("notion_token");
    const seeToken = value("see_api_token");
    const cloud = {
      ...(value("webdav_url")
        ? {
            webdav: {
              url: value("webdav_url"),
              username: value("webdav_username"),
              password: value("webdav_password"),
              filename: `${webdavPath}/timeamber-backup.json`,
            },
          }
        : {}),
      ...(notionToken
        ? {
            notion: {
              token: notionToken,
              databaseId: value("notion_data_source_id"),
            },
          }
        : {}),
      ...(seeToken
        ? {
            see: { token: seeToken },
            imageHost: {
              provider: "see",
              endpoint: "https://i.see.you",
              token: seeToken,
              label: "SEE",
            },
          }
        : {}),
    };
    await sql`
      insert into public.secret_config (key, encrypted_value, updated_at)
      values ('cloud', ${encryptJson(cloud)}, now())
    `;
  }

  if (!existing.has("ai")) {
    const endpoint = completionEndpoint(value("ai_base_url", "https://api.deepseek.com"));
    const provider = ["deepseek", "openai"].includes(value("ai_provider"))
      ? value("ai_provider")
      : "custom";
    const ai = {
      provider,
      endpoint,
      apiKey: value("ai_api_key"),
      model: value("ai_model", "deepseek-chat"),
    };
    await sql`
      insert into public.secret_config (key, encrypted_value, updated_at)
      values ('ai', ${encryptJson(ai)}, now())
    `;
  }

  const friends = parseJson(value("friend_links"), []);
  if (Array.isArray(friends)) {
    for (const friend of friends) {
      if (!friend?.name || !friend?.url) continue;
      await sql`
        insert into public.friends (name, url, description, published, updated_at)
        values (
          ${String(friend.name)},
          ${String(friend.url)},
          ${String(friend.description ?? friend.desc ?? "")},
          ${friend.enabled !== false},
          now()
        )
        on conflict (name) do update set
          url = excluded.url,
          description = excluded.description,
          published = excluded.published,
          updated_at = now()
      `;
    }
  }

  const appConfigCount = await sql`select count(*)::int as count from public.app_config`;
  const secretConfigCount = await sql`select count(*)::int as count from public.secret_config`;
  console.log(
    JSON.stringify({
      appConfig: appConfigCount[0].count,
      secretConfig: secretConfigCount[0].count,
    }),
  );
} finally {
  await sql.end();
}
