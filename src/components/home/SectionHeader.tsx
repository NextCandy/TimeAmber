import type { ReactNode } from "react";

/** 区块标题：左侧 kicker + 主标题，右侧放「查看全部」或轮播箭头。 */
export function SectionHeader({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="font-latin text-xs font-medium tracking-[0.2em] text-primary uppercase">
          {kicker}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
