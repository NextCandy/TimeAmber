import postgres from "postgres";

import {
  archiveHtmlToReadableText,
  extractArchiveOriginalUrl,
  extractArchivePublishedAt,
  getArchiveOfflineHtmlUrl,
  type ArchiveKnowledgeDocument,
} from "./archive-sync";
import type { IObjectStorage } from "./storage/interfaces";

const MAX_ARCHIVE_BODY_CHARS = 180_000;

type KnowledgeIndexResult = {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  processed: number;
  pending: number;
  errors: string[];
};

function clampBatchSize(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(10, Math.min(Math.floor(value), 500));
}

function storageKeyFromInternalUrl(value: string): string | null {
  if (!value.startsWith("/cdn/") || value.startsWith("/cdn//")) return null;
  try {
    return decodeURIComponent(value.slice("/cdn/".length));
  } catch {
    return null;
  }
}

export class KnowledgeIndexer {
  private readonly sql: ReturnType<typeof postgres>;

  constructor(
    databaseUrl: string,
    private readonly storage: IObjectStorage,
  ) {
    this.sql = postgres(databaseUrl, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  async upsertArchiveDocument(document: ArchiveKnowledgeDocument): Promise<"created" | "updated"> {
    const body = document.body.trim().slice(0, MAX_ARCHIVE_BODY_CHARS);
    if (body.length < 20) throw new Error(`Archive body is empty for ${document.slug}`);

    const [post] = await this.sql`
      select
        posts.id,
        exists (
          select 1 from public.knowledge_documents
          where knowledge_documents.post_id = posts.id
        ) as indexed
      from public.posts
      where posts.slug = ${document.slug}
      limit 1
    `;
    if (!post) throw new Error(`Post not found for ${document.slug}`);

    await this.sql`
      insert into public.knowledge_documents (
        post_id,
        source_type,
        content_origin,
        title,
        excerpt,
        body,
        category,
        internal_url,
        original_url,
        source_created_at,
        source_updated_at
      ) values (
        ${post.id},
        'web_archive',
        'archive_html',
        ${document.title},
        ${document.excerpt},
        ${body},
        ${document.category},
        ${document.internalUrl},
        ${document.originalUrl || null},
        ${document.sourceCreatedAt}::timestamptz,
        ${document.sourceUpdatedAt}::timestamptz
      )
      on conflict (post_id) do update set
        source_type = excluded.source_type,
        content_origin = excluded.content_origin,
        title = excluded.title,
        excerpt = excluded.excerpt,
        body = excluded.body,
        category = excluded.category,
        internal_url = excluded.internal_url,
        original_url = coalesce(excluded.original_url, public.knowledge_documents.original_url),
        source_created_at = excluded.source_created_at,
        source_updated_at = excluded.source_updated_at
    `;

    return post.indexed ? "updated" : "created";
  }

  private async markArchiveUnavailable(slug: string, internalUrl: string | null): Promise<void> {
    await this.sql`
      insert into public.knowledge_documents (
        post_id,
        source_type,
        content_origin,
        title,
        excerpt,
        body,
        category,
        internal_url,
        source_created_at,
        source_updated_at
      )
      select
        posts.id,
        'web_archive',
        'archive_unavailable',
        posts.title,
        coalesce(posts.excerpt, ''),
        posts.content,
        coalesce(posts.category, ''),
        ${internalUrl},
        coalesce(posts.publish_at, posts.created_at),
        coalesce(posts.source_updated_at, posts.updated_at)
      from public.posts
      where posts.slug = ${slug}
      on conflict (post_id) do update set
        source_type = 'web_archive',
        content_origin = 'archive_unavailable',
        internal_url = coalesce(excluded.internal_url, public.knowledge_documents.internal_url),
        source_updated_at = excluded.source_updated_at
    `;
  }

  async backfillPendingArchives(requestedBatchSize = 100): Promise<KnowledgeIndexResult> {
    const batchSize = clampBatchSize(requestedBatchSize);
    const rows = await this.sql`
      select
        posts.slug,
        posts.title,
        coalesce(posts.excerpt, '') as excerpt,
        coalesce(posts.category, '') as category,
        posts.content,
        posts.created_at,
        posts.updated_at
      from public.posts
      left join public.knowledge_documents
        on public.knowledge_documents.post_id = posts.id
      where posts.slug like 'archive-%'
        and (
          public.knowledge_documents.post_id is null
          or public.knowledge_documents.content_origin not in ('archive_html', 'archive_unavailable')
        )
      order by posts.updated_at desc
      limit ${batchSize}
    `;

    const result: KnowledgeIndexResult = {
      success: true,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      processed: 0,
      pending: 0,
      errors: [],
    };

    for (const row of rows) {
      result.processed++;
      const slug = String(row.slug);
      try {
        const internalUrl = getArchiveOfflineHtmlUrl(String(row.content ?? ""));
        const storageKey = internalUrl ? storageKeyFromInternalUrl(internalUrl) : null;
        if (!internalUrl || !storageKey) {
          await this.markArchiveUnavailable(slug, internalUrl);
          result.skipped++;
          continue;
        }

        const object = await this.storage.get(storageKey);
        if (!object) {
          await this.markArchiveUnavailable(slug, internalUrl);
          result.skipped++;
          continue;
        }
        // Normalization is needed when a fresh archive is persisted, but not
        // while reading an existing file for plain-text indexing. Skipping it
        // avoids repeatedly rewriting multi-megabyte inline image attributes.
        const html = await new Response(object.body).text();
        const body = archiveHtmlToReadableText(html, MAX_ARCHIVE_BODY_CHARS);
        if (body.trim().length < 20) {
          await this.markArchiveUnavailable(slug, internalUrl);
          result.skipped++;
          continue;
        }
        const action = await this.upsertArchiveDocument({
          slug,
          title: String(row.title),
          excerpt: String(row.excerpt || body.slice(0, 300)),
          body,
          category: String(row.category),
          internalUrl,
          originalUrl: extractArchiveOriginalUrl(html) || "",
          sourceCreatedAt:
            extractArchivePublishedAt(html) || new Date(row.created_at).toISOString(),
          sourceUpdatedAt: new Date(row.updated_at).toISOString(),
        });
        result[action]++;
      } catch (error) {
        result.failed++;
        result.errors.push(
          `${slug}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
        );
      }
    }

    const [pending] = await this.sql`
      select count(*)::integer as count
      from public.posts
      left join public.knowledge_documents
        on public.knowledge_documents.post_id = posts.id
      where posts.slug like 'archive-%'
        and (
          public.knowledge_documents.post_id is null
          or public.knowledge_documents.content_origin not in ('archive_html', 'archive_unavailable')
        )
    `;
    result.pending = Number(pending?.count ?? 0);
    result.success = result.failed === 0;
    return result;
  }
}
