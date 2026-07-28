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
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-4">
      <div>
        <p className="font-latin text-xs font-medium tracking-[0.2em] text-primary uppercase">
          {kicker}
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.2]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
