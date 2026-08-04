import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { db } from "@/lib/db.server";
import {
  normalizePublicSiteConfig,
  publicSiteSettingsSchema,
  type PublicSiteConfig,
} from "@/lib/public-site-settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function assertAdmin(userId: string) {
  const [profile] = await db()`
    select role from public.profiles where user_id = ${userId}::uuid
  `;
  if (profile?.role !== "admin") throw new Error("Administrator access required");
}

export const loadPublicSiteSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSiteConfig> => {
    const [row] = await db()`select value from public.app_config where key = 'site'`;
    return normalizePublicSiteConfig(row?.value);
  },
);

const saveInput = z.object({ settings: z.unknown() });

/** 保存公开站点配置：只写 app_config.site.publicSite，不触碰文章、媒体和同步数据。 */
export const savePublicSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof saveInput>) => saveInput.parse(value))
  .handler(async ({ data, context }): Promise<{ ok: true; settings: PublicSiteConfig }> => {
    await assertAdmin(context.userId);
    const parsed = publicSiteSettingsSchema.safeParse(data.settings);
    if (!parsed.success) {
      const message = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`)
        .join("；");
      throw new Error(`公开站点设置校验失败：${message}`);
    }

    const sql = db();
    const [existing] = await sql`select value from public.app_config where key = 'site'`;
    const current = isRecord(existing?.value) ? existing.value : {};
    const next = { ...current, publicSite: parsed.data };

    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('timeamber_public_site_write'))`;
      await tx`
        insert into public.app_config (key, value, public_read, updated_at)
        values ('site', ${tx.json(next)}, true, now())
        on conflict (key) do update
          set value = excluded.value, public_read = true, updated_at = now()
      `;
      await tx`
        insert into public.audit_logs (
          id, actor, action, entity_type, entity_id, detail, created_at
        ) values (
          ${randomUUID()}, ${context.userId}, 'update', 'public_site', 'site',
          ${tx.json({ version: parsed.data.version, section: "public_site" })}, now()
        )
      `;
    });

    return { ok: true, settings: parsed.data };
  });
