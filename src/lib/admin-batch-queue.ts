export type AdminBatchQueueConfig = {
  concurrency: number;
  batchSize: number;
  rps: number;
  batchDelayMs: number;
  retries: number;
  backoffMs: number;
  jitterMs: number;
};

export type AdminBatchQueueItem = { slug: string; title?: string };
export type AdminBatchQueueFailure = { slug: string; error: string; attempts: number };
export type AdminBatchQueueHandlerResult = {
  success: string[];
  failed?: Array<{ slug: string; error: string }>;
  skipped?: string[];
};

export type AdminBatchQueueSnapshot = {
  status: "idle" | "running" | "paused" | "cancelling" | "completed";
  total: number;
  pending: number;
  inFlight: number;
  success: number;
  failed: number;
  skipped: number;
  batchesDone: number;
  batchesTotal: number;
  currentBatch: number;
  throughput10s: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  concurrency: number;
  rps: number;
};

export type AdminBatchQueueResult = {
  success: string[];
  failed: AdminBatchQueueFailure[];
  skipped: string[];
  cancelled: boolean;
  durationMs: number;
};

export type AdminBatchQueueRun = {
  promise: Promise<AdminBatchQueueResult>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  snapshot: () => AdminBatchQueueSnapshot;
};

export const DEFAULT_ADMIN_BATCH_QUEUE_CONFIG: AdminBatchQueueConfig = {
  concurrency: 3,
  batchSize: 50,
  rps: 5,
  batchDelayMs: 0,
  retries: 2,
  backoffMs: 500,
  jitterMs: 150,
};

function clampConfig(config: Partial<AdminBatchQueueConfig>): AdminBatchQueueConfig {
  return {
    concurrency: Math.min(10, Math.max(1, Math.round(config.concurrency ?? 3))),
    batchSize: Math.min(100, Math.max(1, Math.round(config.batchSize ?? 50))),
    rps: Math.min(5, Math.max(0, Number(config.rps ?? 5))),
    batchDelayMs: Math.min(60_000, Math.max(0, Math.round(config.batchDelayMs ?? 0))),
    retries: Math.min(5, Math.max(0, Math.round(config.retries ?? 2))),
    backoffMs: Math.min(60_000, Math.max(0, Math.round(config.backoffMs ?? 500))),
    jitterMs: Math.min(10_000, Math.max(0, Math.round(config.jitterMs ?? 150))),
  };
}

function delay(ms: number) {
  return ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAdminBatchQueue(
  items: AdminBatchQueueItem[],
  handler: (batch: AdminBatchQueueItem[], attempt: number) => Promise<AdminBatchQueueHandlerResult>,
  options: {
    config?: Partial<AdminBatchQueueConfig>;
    onUpdate?: (snapshot: AdminBatchQueueSnapshot) => void;
    random?: () => number;
  } = {},
): AdminBatchQueueRun {
  const config = clampConfig(options.config ?? {});
  const batches: AdminBatchQueueItem[][] = [];
  for (let i = 0; i < items.length; i += config.batchSize) {
    batches.push(items.slice(i, i + config.batchSize));
  }

  let status: AdminBatchQueueSnapshot["status"] = "idle";
  let nextBatch = 0;
  let pending = items.length;
  let inFlight = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  let batchesDone = 0;
  let currentBatch = 0;
  let cancelled = false;
  let startedAt = 0;
  let finishedAt = 0;
  let doneResolve: (result: AdminBatchQueueResult) => void = () => {};
  let done = false;
  let releasePaused: Array<() => void> = [];
  let nextPermitAt = 0;
  let permitGate = Promise.resolve();
  const completedAt: number[] = [];
  const successSlugs: string[] = [];
  const failedItems: AdminBatchQueueFailure[] = [];
  const skippedSlugs: string[] = [];
  const random = options.random ?? Math.random;

  const notify = () => options.onUpdate?.(snapshot());

  function snapshot(): AdminBatchQueueSnapshot {
    const now = finishedAt || Date.now();
    const elapsedMs = startedAt ? now - startedAt : 0;
    const windowStart = now - 10_000;
    while (completedAt[0] != null && completedAt[0] < windowStart) completedAt.shift();
    const completed = success + failed + skipped;
    const rate = elapsedMs > 0 ? completed / (elapsedMs / 1000) : 0;
    const estimatedRemainingMs = rate > 0 && pending > 0 ? (pending / rate) * 1000 : null;
    return {
      status,
      total: items.length,
      pending,
      inFlight,
      success,
      failed,
      skipped,
      batchesDone,
      batchesTotal: batches.length,
      currentBatch,
      throughput10s: completedAt.length / 10,
      elapsedMs,
      estimatedRemainingMs,
      concurrency: config.concurrency,
      rps: config.rps,
    };
  }

  async function waitUntilResumed() {
    while (status === "paused" && !cancelled) {
      await new Promise<void>((resolve) => releasePaused.push(resolve));
    }
    if (cancelled) throw new Error("QUEUE_CANCELLED");
  }

  async function acquirePermit() {
    await waitUntilResumed();
    let release!: () => void;
    const previous = permitGate;
    permitGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await waitUntilResumed();
      if (config.rps > 0) {
        const interval = 1000 / config.rps;
        await delay(Math.max(0, nextPermitAt - Date.now()));
        await waitUntilResumed();
        nextPermitAt = Math.max(Date.now(), nextPermitAt) + interval;
      }
    } finally {
      release();
    }
  }

  async function runWithRetry(batch: AdminBatchQueueItem[]) {
    for (let attempt = 1; attempt <= config.retries + 1; attempt += 1) {
      try {
        return { result: await handler(batch, attempt), attempts: attempt };
      } catch (error) {
        if (attempt > config.retries) throw { error, attempts: attempt };
        const jitter = config.jitterMs > 0 ? random() * config.jitterMs : 0;
        await delay(config.backoffMs * 2 ** (attempt - 1) + jitter);
      }
    }
    throw new Error("unreachable");
  }

  async function worker() {
    while (true) {
      await waitUntilResumed().catch(() => undefined);
      if (cancelled) return;
      const batch = batches[nextBatch++];
      if (!batch) return;
      pending -= batch.length;
      inFlight += 1;
      currentBatch = Math.max(currentBatch, nextBatch);
      notify();
      try {
        await acquirePermit();
        const { result, attempts } = await runWithRetry(batch);
        const batchSlugs = new Set(batch.map((item) => item.slug));
        const reported = new Set<string>();
        for (const slug of result.success) {
          if (!batchSlugs.has(slug) || reported.has(slug)) continue;
          reported.add(slug);
          success += 1;
          successSlugs.push(slug);
          completedAt.push(Date.now());
        }
        for (const item of result.failed ?? []) {
          if (!batchSlugs.has(item.slug) || reported.has(item.slug)) continue;
          reported.add(item.slug);
          failed += 1;
          failedItems.push({ slug: item.slug, error: item.error, attempts });
          completedAt.push(Date.now());
        }
        for (const slug of result.skipped ?? []) {
          if (!batchSlugs.has(slug) || reported.has(slug)) continue;
          reported.add(slug);
          skipped += 1;
          skippedSlugs.push(slug);
          completedAt.push(Date.now());
        }
        for (const item of batch) {
          if (reported.has(item.slug)) continue;
          failed += 1;
          failedItems.push({ slug: item.slug, error: "批处理器未返回该条目的结果", attempts });
          completedAt.push(Date.now());
        }
      } catch (error) {
        if (errorText(error) === "QUEUE_CANCELLED") {
          skipped += batch.length;
          skippedSlugs.push(...batch.map((item) => item.slug));
          completedAt.push(...batch.map(() => Date.now()));
        } else {
          const attempts = typeof error === "object" && error && "attempts" in error
            ? Number((error as { attempts: number }).attempts)
            : config.retries + 1;
          const message = typeof error === "object" && error && "error" in error
            ? errorText((error as { error: unknown }).error)
            : errorText(error);
          for (const item of batch) {
            failed += 1;
            failedItems.push({ slug: item.slug, error: message, attempts });
            completedAt.push(Date.now());
          }
        }
      } finally {
        inFlight -= 1;
        batchesDone += 1;
        notify();
      }
      await delay(config.batchDelayMs);
    }
  }

  const promise = new Promise<AdminBatchQueueResult>((resolve) => {
    doneResolve = resolve;
  });

  async function start() {
    if (status !== "idle") return;
    status = "running";
    startedAt = Date.now();
    notify();
    await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
    if (cancelled && nextBatch < batches.length) {
      for (const batch of batches.slice(nextBatch)) {
        skipped += batch.length;
        skippedSlugs.push(...batch.map((item) => item.slug));
      }
      pending = 0;
    }
    finishedAt = Date.now();
    status = "completed";
    done = true;
    notify();
    doneResolve({
      success: successSlugs,
      failed: failedItems,
      skipped: skippedSlugs,
      cancelled,
      durationMs: finishedAt - startedAt,
    });
  }

  const run: AdminBatchQueueRun = {
    promise,
    pause: () => {
      if (done || status !== "running") return;
      status = "paused";
      notify();
    },
    resume: () => {
      if (done || status !== "paused") return;
      status = "running";
      const waiters = releasePaused;
      releasePaused = [];
      waiters.forEach((resolve) => resolve());
      notify();
    },
    cancel: () => {
      if (done || cancelled) return;
      cancelled = true;
      status = "cancelling";
      const waiters = releasePaused;
      releasePaused = [];
      waiters.forEach((resolve) => resolve());
      notify();
    },
    snapshot,
  };

  void start();
  return run;
}

export { clampConfig as normalizeAdminBatchQueueConfig };
