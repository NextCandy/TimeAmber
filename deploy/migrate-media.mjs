import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(process.env.LEGACY_MEDIA_ROOT || "/legacy-media");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase configuration is required");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mime = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.endsWith(".timeamber-meta.json")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(absolute);
    else if (entry.isFile()) yield absolute;
  }
}

let uploaded = 0;
let skipped = 0;
let failed = 0;
for await (const absolute of walk(root)) {
  const objectPath = path.relative(root, absolute).split(path.sep).join("/");
  const info = await stat(absolute);
  const contentType = mime[path.extname(absolute).toLowerCase()] || "application/octet-stream";
  const body = await readFile(absolute);
  const { error } = await supabase.storage.from("media").upload(
    objectPath,
    body,
    { contentType, upsert: false },
  );
  if (error && !/already exists|duplicate/i.test(error.message)) {
    failed++;
    console.error(`[media] ${objectPath}: ${error.message}`);
    continue;
  }
  if (error) skipped++;
  else uploaded++;
  await supabase.from("media_items").upsert({
    id: `legacy-${Buffer.from(objectPath).toString("base64url").slice(0, 50)}`,
    bucket: "media",
    object_path: objectPath,
    name: path.basename(objectPath),
    public_url: `/supabase/storage/v1/object/public/media/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
    size_bytes: info.size,
    content_type: contentType,
    source: "imported",
  }, { onConflict: "bucket,object_path" });
}

console.log(JSON.stringify({ uploaded, skipped, failed }));
if (failed) process.exitCode = 1;
