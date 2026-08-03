import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type WorkerJson = null | boolean | number | string | WorkerJson[] | { [key: string]: WorkerJson };

async function workerFetch(path: string, init?: RequestInit): Promise<Record<string, WorkerJson>> {
  const base = process.env.WORKER_URL || "http://timeamber-worker:3001";
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error("WORKER_SECRET is not configured");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": secret,
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Worker failed [${response.status}]: ${text.slice(0, 500)}`);
  return JSON.parse(text) as Record<string, WorkerJson>;
}

export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => workerFetch("/status"));

const runInput = z.object({
  task: z.enum(["notion", "notion-repair", "archive", "knowledge-index", "backup"]),
});

export const runSyncTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: z.infer<typeof runInput>) => runInput.parse(value))
  .handler(async ({ data }) => workerFetch(`/run/${data.task}`, { method: "POST", body: "{}" }));
