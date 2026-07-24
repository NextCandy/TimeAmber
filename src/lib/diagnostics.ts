// Lightweight client-side diagnostics: captures performance metrics and
// runtime console errors / unhandled rejections. In-memory only.

export type LogLevel = "error" | "warn" | "info";
export type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  source: string;
  message: string;
  stack?: string;
};

export type PerfSnapshot = {
  at: string;
  path: string;
  navigationMs?: number;
  domContentLoadedMs?: number;
  fcpMs?: number;
  lcpMs?: number;
  cls?: number;
  ttfbMs?: number;
};

const logs: LogEntry[] = [];
const perfs: PerfSnapshot[] = [];
const MAX_LOG = 200;
const MAX_PERF = 50;
const listeners = new Set<() => void>();
let installed = false;
let clsValue = 0;

function notify() {
  for (const l of listeners) l();
}

function pushLog(e: Omit<LogEntry, "id" | "at">) {
  logs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...e,
  });
  if (logs.length > MAX_LOG) logs.length = MAX_LOG;
  notify();
}

function pushPerf(p: PerfSnapshot) {
  perfs.unshift(p);
  if (perfs.length > MAX_PERF) perfs.length = MAX_PERF;
  notify();
}

export function installDiagnostics() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Patch console.error / console.warn (non-destructive)
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      pushLog({ level: "error", source: "console", message: args.map(stringify).join(" ") });
    } catch {
      /* noop */
    }
    origErr(...args);
  };
  console.warn = (...args: unknown[]) => {
    try {
      pushLog({ level: "warn", source: "console", message: args.map(stringify).join(" ") });
    } catch {
      /* noop */
    }
    origWarn(...args);
  };

  window.addEventListener("error", (e) => {
    pushLog({
      level: "error",
      source: "window.error",
      message: e.message,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    pushLog({
      level: "error",
      source: "unhandledrejection",
      message: reason instanceof Error ? reason.message : stringify(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Perf observers
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "paint" && entry.name === "first-contentful-paint") {
          updateCurrent({ fcpMs: Math.round(entry.startTime) });
        }
        if (entry.entryType === "largest-contentful-paint") {
          updateCurrent({ lcpMs: Math.round(entry.startTime) });
        }
        if (entry.entryType === "layout-shift") {
          const ls = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!ls.hadRecentInput) clsValue += ls.value ?? 0;
          updateCurrent({ cls: Number(clsValue.toFixed(3)) });
        }
        if (entry.entryType === "navigation") {
          const n = entry as PerformanceNavigationTiming;
          updateCurrent({
            navigationMs: Math.round(n.duration),
            domContentLoadedMs: Math.round(n.domContentLoadedEventEnd),
            ttfbMs: Math.round(n.responseStart),
          });
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    po.observe({ type: "layout-shift", buffered: true });
    po.observe({ type: "navigation", buffered: true });
  } catch {
    /* unsupported */
  }
}

function updateCurrent(patch: Partial<PerfSnapshot>) {
  const path = typeof location !== "undefined" ? location.pathname : "/";
  const head = perfs[0];
  if (head && head.path === path && Date.now() - new Date(head.at).getTime() < 60_000) {
    Object.assign(head, patch);
    notify();
    return;
  }
  pushPerf({ at: new Date().toISOString(), path, ...patch });
}

export function recordRouteChange(path: string) {
  clsValue = 0;
  pushPerf({ at: new Date().toISOString(), path });
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLogs() {
  return logs.slice();
}
export function getPerfs() {
  return perfs.slice();
}
export function clearLogs() {
  logs.length = 0;
  notify();
}
export function clearPerfs() {
  perfs.length = 0;
  notify();
}
