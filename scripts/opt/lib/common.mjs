import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const REPORTS_ROOT = join(PROJECT_ROOT, "reports", "opt");
export const HISTORY_ROOT = join(REPORTS_ROOT, "history");
export const VISUAL_ROOT = join(REPORTS_ROOT, "visual");
export const BASELINE_ROOT = join(REPORTS_ROOT, "baseline");
export const SNAPSHOT_ROOT = join(REPORTS_ROOT, "snapshots");
export const CHANGES_ROOT = join(REPORTS_ROOT, "changes");

export const DEFAULT_BASE_URL = process.env.OPT_BASE_URL || "http://127.0.0.1:3000";
export const SITE_ORIGIN = process.env.OPT_SITE_ORIGIN || "https://timeamber.com";

export const VIEWPORTS = {
  "mobile-375": { width: 375, height: 812, mobile: true, dpr: 1 },
  "mobile-390": { width: 390, height: 844, mobile: true, dpr: 1 },
  "tablet-768": { width: 768, height: 1024, mobile: true, dpr: 1 },
  "laptop-1280": { width: 1280, height: 800, mobile: false, dpr: 1 },
  "desktop-1440": { width: 1440, height: 900, mobile: false, dpr: 1 },
  "wide-1920": { width: 1920, height: 1080, mobile: false, dpr: 1 },
};

export const SCENARIOS = {
  fast: { name: "fast", download: 0, upload: 0, latency: 0, cpu: 1, dpr: 1 },
  "4g": { name: "4g", download: 9000, upload: 1500, latency: 85, cpu: 2, dpr: 2 },
  slow3g: { name: "slow3g", download: 400, upload: 400, latency: 400, cpu: 4, dpr: 2 },
  dpr3: { name: "dpr3", download: 9000, upload: 1500, latency: 85, cpu: 2, dpr: 3 },
  "offline-cache": { name: "offline-cache", mode: "second-visit", cpu: 1, dpr: 1 },
};

export const PAGE_DEFINITIONS = {
  首页: { key: "home", path: "/", public: true },
  文章页: { key: "article", path: null, public: true, article: true },
  归档页: { key: "archive", path: "/archive", public: true },
  分类页: { key: "categories", path: "/categories", public: true },
  后台文章列表: { key: "admin-posts", path: "/admin/posts", admin: true },
  后台媒体库: { key: "admin-media", path: "/admin/media", admin: true },
};

export function nowIso() {
  return new Date().toISOString();
}

export function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const raw = token.slice(2);
    const equal = raw.indexOf("=");
    if (equal >= 0) {
      args[raw.slice(0, equal)] = raw.slice(equal + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[raw] = next;
      index += 1;
    } else {
      args[raw] = true;
    }
  }
  return args;
}

export function getListArg(args, name, fallback = []) {
  const value = args[name];
  if (value === undefined || value === true || value === "") return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasFlag(args, name) {
  return args[name] === true || args[name] === "true" || args[name] === "1";
}

export async function ensureDir(directory) {
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function writeJson(file, value) {
  await ensureDir(dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(file, value) {
  await ensureDir(dirname(file));
  await writeFile(file, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export function relativeProjectPath(file) {
  const value = relative(PROJECT_ROOT, file).replaceAll("\\", "/");
  return value.startsWith("../") || isAbsolute(value) ? file : value;
}

export function safeFileName(value) {
  return String(value).replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "item";
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashFileBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function pct(value, digits = 2) {
  return Number.isFinite(value) ? round(value * 100, digits) : null;
}

export function statusRank(status) {
  return { PASS: 0, SKIP: 1, WARN: 2, FAIL: 3 }[status] ?? 3;
}

export function worstStatus(...statuses) {
  return statuses.toSorted((a, b) => statusRank(b) - statusRank(a))[0] || "PASS";
}

export function result(status, message, extra = {}) {
  return { status, message, ...extra };
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns = null) {
  const keys = columns || [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    keys.map(csvEscape).join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ];
  return `\ufeff${body.join("\r\n")}\r\n`;
}

export function redactUrl(input) {
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|auth|signature|sig|code/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(input).replace(/([?&](?:token|key|secret|password|auth|signature|sig|code)=)[^&]*/gi, "$1[redacted]");
  }
}

export function resolveUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

export function normalizeUrl(input) {
  const url = new URL(input);
  url.hash = "";
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}${url.search}`;
}

export function isSameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function classifyResource(url, contentType = "") {
  const value = `${url} ${contentType}`.toLowerCase();
  if (/\.m?js(?:\?|$)|javascript/.test(value)) return "JS";
  if (/\.css(?:\?|$)|text\/css/.test(value)) return "CSS";
  if (/\.(?:avif|webp|png|jpe?g|gif|svg|ico)(?:\?|$)|image\//.test(value)) return "图片";
  if (/\.(?:woff2?|ttf|otf)(?:\?|$)|font\//.test(value)) return "字体";
  if (/\.(?:mp4|webm|mp3|wav|ogg)(?:\?|$)|audio\u002f|video\//.test(value)) return "媒体";
  if (/text\/html|application\/xml|application\/json/.test(value)) return "HTML/文档";
  return "其他";
}

export function isThirdParty(url, baseUrl) {
  try {
    return new URL(url).origin !== new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export function gitValue(args, cwd = PROJECT_ROOT) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function gitMetadata(cwd = PROJECT_ROOT) {
  return {
    commit: gitValue(["rev-parse", "--short", "HEAD"], cwd) || "unknown",
    fullCommit: gitValue(["rev-parse", "HEAD"], cwd) || "unknown",
    branch: gitValue(["branch", "--show-current"], cwd) || "detached",
    title: gitValue(["log", "-1", "--format=%s"], cwd),
    author: gitValue(["log", "-1", "--format=%an"], cwd),
    pr: process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || "",
    dirty: Boolean(gitValue(["status", "--porcelain"], cwd)),
  };
}

export function runProcess(command, args = [], options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || PROJECT_ROOT,
      env: { ...process.env, ...(options.env || {}) },
      shell: options.shell || false,
      stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; if (options.onStdout) options.onStdout(String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (options.onStderr) options.onStderr(String(chunk)); });
    if (options.input) child.stdin.end(options.input);
    const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), options.timeoutMs) : null;
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(input, init = {}, timeoutMs = 20_000) {
  const response = await fetchWithTimeout(input, init, timeoutMs);
  return { response, text: await response.text() };
}

export function pageDefinition(name) {
  if (PAGE_DEFINITIONS[name]) return { name, ...PAGE_DEFINITIONS[name] };
  const entry = Object.values(PAGE_DEFINITIONS).find((item) => item.key === name);
  return entry ? { name: Object.keys(PAGE_DEFINITIONS).find((key) => PAGE_DEFINITIONS[key] === entry), ...entry } : null;
}

export function resolvePageNames(args, fallback = Object.keys(PAGE_DEFINITIONS)) {
  const requested = getListArg(args, "page", fallback);
  return requested.map((name) => pageDefinition(name) || { name, key: safeFileName(name), path: name, public: true });
}

export async function discoverArticlePath(baseUrl, requested = "") {
  if (requested) return requested.startsWith("/") ? requested : `/posts/${requested}`;
  if (process.env.OPT_ARTICLE_PATH) return process.env.OPT_ARTICLE_PATH;
  const response = await fetchWithTimeout(resolveUrl(baseUrl, "/"), {}, 15_000);
  const html = await response.text();
  const candidates = [...html.matchAll(/href=["'](\/posts\/[^"'#?]+)["']/gi)].map((match) => match[1]);
  return candidates[0] || "/posts/sample";
}

export async function createReportDirectory(label, root = REPORTS_ROOT) {
  const directory = join(root, `${safeFileName(label)}-${timestamp()}`);
  await ensureDir(directory);
  return directory;
}

export async function getFileSize(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

export function extensionFromContentType(contentType = "") {
  const value = contentType.toLowerCase().split(";")[0].trim();
  return {
    "image/avif": ".avif",
    "image/webp": ".webp",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
    "font/woff2": ".woff2",
    "text/css": ".css",
    "text/javascript": ".js",
  }[value] || extname(value) || "";
}

export function scenarioFor(name) {
  return SCENARIOS[name] || SCENARIOS.fast;
}

export function shouldFail(results) {
  return results.some((item) => item?.status === "FAIL");
}

export function summarizeStatuses(results) {
  return results.reduce((summary, item) => {
    const status = item?.status || "SKIP";
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 });
}
