import { Hash, Tag } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { GlassPanel } from "@/components/public/GlassPanel";
import type { TaxonomySummary } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

function TaxonomyList({ items, tag }: { items: TaxonomySummary[]; tag: boolean }) {
  return items.length ? (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item, index) => (
        <Link
          key={`${tag ? "tag" : "category"}-${item.name}-${index}`}
          to="/categories"
          search={tag ? { tag: item.name } : { c: item.name }}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/20 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-amber/60 hover:text-accent-amber"
        >
          <span>{item.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground/70">{item.count}</span>
        </Link>
      ))}
    </div>
  ) : (
    <p className="mt-4 text-sm text-muted-foreground">暂时没有公开数据。</p>
  );
}

export function PopularTaxonomies({
  config,
  categories,
  tags,
}: {
  config: PublicSiteConfig;
  categories: TaxonomySummary[];
  tags: TaxonomySummary[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-accent-amber" />
          <h2 className="text-base font-semibold">{config.homepage.categoryTitle}</h2>
        </div>
        <TaxonomyList items={categories} tag={false} />
      </GlassPanel>
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-accent-amber" />
          <h2 className="text-base font-semibold">{config.homepage.tagTitle}</h2>
        </div>
        <TaxonomyList items={tags} tag />
      </GlassPanel>
    </div>
  );
}
