import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
  compact?: boolean;
};

/** 公开页、搜索和后台共用的轻量空状态，保留一行可执行的下一步提示。 */
export function EmptyState({ title, description, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "empty-state rounded-xl border border-dashed border-border/80 bg-card/40 text-center",
        compact ? "px-5 py-6" : "px-8 py-10",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className="empty-state-art mx-auto mb-3 h-10 w-10 text-accent-amber"
        fill="none"
      >
        <path
          d="M14 8h14l6 6v26H14z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M28 8v8h8M19 24h10M19 30h10" stroke="currentColor" strokeWidth="2" />
        <path d="M19 36h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
    </div>
  );
}
