import { useEffect, useState } from "react";
import { Minus, Plus, Type } from "lucide-react";

export type ReadingPrefs = {
  fontSize: number; // px, base for body
  lineHeight: number; // unitless
};

const DEFAULTS: ReadingPrefs = { fontSize: 17, lineHeight: 1.85 };
const KEY = "timeamber:reading-prefs";

export function useReadingPrefs() {
  const [prefs, setPrefs] = useState<ReadingPrefs>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* noop */
    }
  }, [prefs]);

  return [prefs, setPrefs] as const;
}

export function ReadingControls({
  prefs,
  setPrefs,
}: {
  prefs: ReadingPrefs;
  setPrefs: (p: ReadingPrefs) => void;
}) {
  const setFont = (n: number) => setPrefs({ ...prefs, fontSize: Math.min(22, Math.max(14, n)) });
  const setLine = (n: number) =>
    setPrefs({ ...prefs, lineHeight: Math.min(2.2, Math.max(1.4, Number(n.toFixed(2)))) });

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3 text-xs backdrop-blur">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <Type className="h-3 w-3" /> 阅读
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">字号</span>
        <div className="flex items-center gap-1">
          <Btn onClick={() => setFont(prefs.fontSize - 1)} aria-label="减小字号">
            <Minus className="h-3 w-3" />
          </Btn>
          <span className="w-8 text-center tabular-nums">{prefs.fontSize}</span>
          <Btn onClick={() => setFont(prefs.fontSize + 1)} aria-label="增大字号">
            <Plus className="h-3 w-3" />
          </Btn>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground">行距</span>
        <div className="flex items-center gap-1">
          <Btn onClick={() => setLine(prefs.lineHeight - 0.1)} aria-label="减小行距">
            <Minus className="h-3 w-3" />
          </Btn>
          <span className="w-8 text-center tabular-nums">{prefs.lineHeight.toFixed(1)}</span>
          <Btn onClick={() => setLine(prefs.lineHeight + 0.1)} aria-label="增大行距">
            <Plus className="h-3 w-3" />
          </Btn>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPrefs(DEFAULTS)}
        className="press-feedback mt-3 w-full rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        恢复默认
      </button>
    </div>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="press-feedback inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    />
  );
}
