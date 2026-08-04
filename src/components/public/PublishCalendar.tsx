import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { loadPublishCalendar, type PublishCalendarDay } from "@/lib/home.functions";
import type { PublicSiteConfig } from "@/lib/public-site-settings";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function PublishCalendar({
  config,
  initialDays,
  initialMonth,
}: {
  config: PublicSiteConfig;
  initialDays: PublishCalendarDay[];
  initialMonth: { year: number; month: number };
}) {
  const initialKey = `${initialMonth.year}-${String(initialMonth.month).padStart(2, "0")}`;
  const [current, setCurrent] = useState(
    () => new Date(initialMonth.year, initialMonth.month - 1, 1),
  );
  const [days, setDays] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const key = monthKey(current);
  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (monthKey(current) === initialKey) {
      setDays(initialDays);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadPublishCalendar({
      data: { year: current.getFullYear(), month: current.getMonth() + 1 },
    })
      .then((nextDays) => {
        if (currentRequest === requestId.current) setDays(nextDays);
      })
      .catch(() => {
        if (currentRequest === requestId.current) setDays([]);
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
    return () => {
      // The server function cannot be cancelled at the transport layer, but
      // stale responses must never overwrite the currently selected month.
      if (currentRequest === requestId.current) requestId.current += 1;
    };
  }, [current, initialDays, initialKey]);
  const counts = useMemo(() => new Map(days.map((day) => [day.date, day.count])), [days]);
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const totalDays = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: offset + totalDays }, (_, i) =>
    i < offset ? null : i - offset + 1,
  );
  const move = (amount: number) =>
    setCurrent((date) => new Date(date.getFullYear(), date.getMonth() + amount, 1));
  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent-amber" />
          <h2 className="text-lg font-semibold">{config.homepage.calendarTitle}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            className="icon-button"
            aria-label="上一个月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="icon-button"
            aria-label="下一个月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{key}</span>
        <span>{loading ? "加载中…" : `${days.reduce((sum, day) => sum + day.count, 0)} 篇`}</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        <span>一</span>
        <span>二</span>
        <span>三</span>
        <span>四</span>
        <span>五</span>
        <span>六</span>
        <span>日</span>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="h-8" />;
          const date = `${key}-${String(day).padStart(2, "0")}`;
          const count = counts.get(date) ?? 0;
          return (
            <Link
              key={date}
              to="/archive"
              search={{ q: undefined, category: undefined }}
              className={`flex h-8 items-center justify-center rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/60 focus-visible:ring-offset-2 ${count ? "bg-accent-amber text-accent-amber-foreground hover:bg-accent-amber-strong" : "bg-background/25 text-muted-foreground hover:bg-accent-amber-soft"}`}
              title={count ? `${date} · ${count} 篇` : date}
            >
              {day}
            </Link>
          );
        })}
      </div>
    </GlassPanel>
  );
}
