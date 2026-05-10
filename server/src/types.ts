/* ── 共享类型定义 ─────────────────────────── */

import type { IDatabase, IObjectStorage } from "./storage/interfaces";

export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  AE?: AnalyticsEngineDataset; // Cloudflare Analytics Engine（CF 专属，可选）
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  REACTION_SALT?: string;
  DB_PROVIDER?: string;
  AUTO_SCHEMA_MIGRATION?: string;
  STORAGE_PROVIDER?: string;
  WEBHOOK_URLS?: string; // 逗号分隔的 Webhook 目标地址
  SITE_ORIGIN?: string; // 对外公开域名（如 https://timeamber.com），用于 sitemap/robots/RSS
  CLOUDFLARE_ACCOUNT_ID?: string; // AE GraphQL 查询用
  CLOUDFLARE_API_TOKEN?: string; // AE GraphQL 查询用（需要 Account Analytics:Read 权限）
  ANALYTICS_WEBSITE_WHITELIST?: string; // 站点白名单，格式: domain1|domain2 (空=放行所有)
  NOTION_TOKEN?: string;
  NOTION_DATA_SOURCE_ID?: string;
  SHUDONG_BASE_URL?: string;
  SHUDONG_TOKEN?: string;
  MEARCHIVE_BASE_URL?: string;
  MEARCHIVE_EMAIL?: string;
  MEARCHIVE_PASSWORD?: string;
  ARCHIVE_SYNC_MAX_PAGES?: string;
  ARCHIVE_SYNC_MAX_CONTENT_CHARS?: string;
  NOTION_SYNC_MAX_SUBREQUESTS?: string;
};

export type Variables = {
  jwtPayload: { sub: string; exp: number };
  db: IDatabase;
  storage: IObjectStorage;
};
