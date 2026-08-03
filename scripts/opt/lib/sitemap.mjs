import { XMLParser } from "fast-xml-parser";
import { fetchText, fetchWithTimeout, normalizeUrl, resolveUrl, result, isSameOrigin, redactUrl } from "./common.mjs";

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, removeNSPrefix: true });
const SITEMAP_CONCURRENCY = Number(process.env.OPT_SITEMAP_CONCURRENCY || 6);
const SITEMAP_REQUEST_TIMEOUT_MS = Number(process.env.OPT_SITEMAP_REQUEST_TIMEOUT_MS || 15_000);
const SITEMAP_CANONICAL_TIMEOUT_MS = Number(process.env.OPT_SITEMAP_CANONICAL_TIMEOUT_MS || 15_000);

function arrayOf(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

async function requestStatus(url) {
  try {
    let response = await fetchWithTimeout(url, { method: "HEAD" }, SITEMAP_REQUEST_TIMEOUT_MS);
    if (response.status === 405 || response.status === 501) response = await fetchWithTimeout(url, {}, SITEMAP_REQUEST_TIMEOUT_MS);
    return { status: response.status, ok: response.ok };
  } catch (error) {
    return { status: 0, ok: false, error: String(error) };
  }
}

function parseRobots(text, origin) {
  const rules = [];
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, "").trim();
    if (!clean || !clean.includes(":")) continue;
    const [key, ...rest] = clean.split(":");
    const value = rest.join(":").trim();
    if (key.trim().toLowerCase() === "user-agent") applies = value === "*";
    if (applies && key.trim().toLowerCase() === "disallow" && value) rules.push(value);
  }
  return {
    origin,
    rules,
    isBlocked(pathname) {
      return rules.some((rule) => pathname.startsWith(rule));
    },
  };
}

async function inspectCanonical(url) {
  try {
    const { response, text } = await fetchText(url, {}, SITEMAP_CANONICAL_TIMEOUT_MS);
    const matches = [
      ...text.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
      ...text.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/gi),
    ].map((match) => new URL(match[1], url).toString());
    return { status: response.status, canonical: [...new Set(matches)] };
  } catch (error) {
    return { status: 0, canonical: [], error: String(error) };
  }
}

async function mapConcurrent(values, concurrency, callback) {
  const output = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      output[index] = await callback(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () => worker()));
  return output;
}

function extractShard(xml, url) {
  const parsed = parser.parse(xml);
  if (parsed.sitemapindex) {
    return {
      kind: "index",
      entries: arrayOf(parsed.sitemapindex.sitemap).map((item) => ({
        loc: item.loc ? new URL(String(item.loc), url).toString() : "",
        lastmod: item.lastmod ? String(item.lastmod) : "",
      })),
    };
  }
  if (parsed.urlset) {
    return {
      kind: "urlset",
      entries: arrayOf(parsed.urlset.url).map((item) => ({
        loc: item.loc ? new URL(String(item.loc), url).toString() : "",
        lastmod: item.lastmod ? String(item.lastmod) : "",
      })),
    };
  }
  return { kind: "unknown", entries: [] };
}

export async function validateSitemap({ baseUrl, sitemapPath = "/sitemap.xml", sampleSize = 50, expectedPaths = [] }) {
  const sitemapUrl = resolveUrl(baseUrl, sitemapPath);
  const failures = [];
  const warnings = [];
  const shards = [];
  let root;
  try {
    const { response, text } = await fetchText(sitemapUrl, {}, 20_000);
    if (!response.ok) {
      failures.push({ path: sitemapPath, reason: `HTTP ${response.status}` });
    } else {
      root = { url: sitemapUrl, xml: text, bytes: Buffer.byteLength(text), ...extractShard(text, sitemapUrl) };
      if (root.kind === "unknown") failures.push({ path: sitemapPath, reason: "XML 不是 sitemapindex 或 urlset" });
      if (root.kind === "urlset") shards.push(root);
    }
  } catch (error) {
    failures.push({ path: sitemapPath, reason: String(error) });
  }

  if (!root) {
    return { status: "FAIL", sitemapUrl, failures, warnings, shards, entries: [], result: result("FAIL", "sitemap 无法读取") };
  }

  if (root.kind === "index") {
    for (const item of root.entries) {
      if (!item.loc) {
        failures.push({ path: sitemapPath, reason: "sitemapindex 缺少 loc" });
        continue;
      }
      if (!isSameOrigin(item.loc, baseUrl)) failures.push({ path: item.loc, reason: "分片不是本站绝对 URL" });
      try {
        const { response, text } = await fetchText(item.loc, {}, 20_000);
        const shard = { url: item.loc, xml: text, bytes: Buffer.byteLength(text), ...extractShard(text, item.loc) };
        shards.push(shard);
        if (!response.ok) failures.push({ path: item.loc, reason: `HTTP ${response.status}` });
        if (shard.kind !== "urlset") failures.push({ path: item.loc, reason: "分片不是 urlset" });
      } catch (error) {
        failures.push({ path: item.loc, reason: String(error) });
      }
    }
  }

  const entries = shards.flatMap((shard) => shard.entries.map((entry) => ({ ...entry, shard: shard.url })));
  for (const shard of shards) {
    if (shard.bytes > 10 * 1024 * 1024) failures.push({ path: shard.url, reason: `分片超过 10MB: ${shard.bytes}` });
    if (shard.entries.length > 5000) failures.push({ path: shard.url, reason: `分片超过 5000 条: ${shard.entries.length}` });
  }
  const locSet = new Set();
  for (const entry of entries) {
    if (!entry.loc) {
      failures.push({ path: entry.shard, reason: "<url> 缺少 <loc>" });
      continue;
    }
    if (!isSameOrigin(entry.loc, baseUrl)) failures.push({ path: entry.loc, reason: "<loc> 不是本站绝对 URL" });
    const normalized = normalizeUrl(entry.loc);
    if (locSet.has(normalized)) warnings.push({ path: entry.loc, reason: "重复 URL" });
    locSet.add(normalized);
    if (entry.lastmod && !parseDate(entry.lastmod)) failures.push({ path: entry.loc, reason: `lastmod 非法: ${entry.lastmod}` });
    if (entry.lastmod && parseDate(entry.lastmod) > new Date(Date.now() + 86_400_000)) {
      failures.push({ path: entry.loc, reason: "lastmod 位于未来" });
    }
  }

  const dates = entries.map((entry) => entry.lastmod).filter(Boolean);
  if (dates.length > 1 && new Set(dates).size === 1) {
    const onlyDate = parseDate(dates[0]);
    if (onlyDate && Math.abs(Date.now() - onlyDate.getTime()) < 5 * 60_000) {
      failures.push({ path: sitemapPath, reason: "所有 lastmod 都等于临近构建时间，疑似伪造更新时间" });
    }
  }

  let robots = null;
  try {
    const robotsResponse = await fetchText(resolveUrl(baseUrl, "/robots.txt"), {}, 15_000);
    if (robotsResponse.response.ok) robots = parseRobots(robotsResponse.text, new URL(baseUrl).origin);
  } catch (error) {
    warnings.push({ path: "/robots.txt", reason: `robots 检查跳过: ${String(error)}` });
  }

  const sampled = entries.filter((entry) => entry.loc).slice(0, sampleSize);
  const inspectedSamples = await mapConcurrent(sampled, SITEMAP_CONCURRENCY, async (entry) => {
    const request = await requestStatus(entry.loc);
    const url = new URL(entry.loc);
    const blocked = robots?.isBlocked(url.pathname) || false;
    const canonical = await inspectCanonical(entry.loc);
    const canonicalMatch = canonical.canonical.some((value) => normalizeUrl(value) === normalizeUrl(entry.loc));
    return { entry, request, blocked, canonical, canonicalMatch, sample: {
      url: redactUrl(entry.loc),
      shard: redactUrl(entry.shard),
      status: request.status,
      httpOk: request.ok,
      robotsBlocked: blocked,
      canonical: canonical.canonical.map(redactUrl),
      canonicalMatch,
    } };
  });
  const samples = inspectedSamples.map((item) => item.sample);
  for (const { entry, request, blocked, canonical, canonicalMatch } of inspectedSamples) {
    if (!request.ok) failures.push({ path: entry.loc, reason: `抽样 HTTP ${request.status || "请求失败"}` });
    if (blocked) failures.push({ path: entry.loc, reason: "被 robots.txt 屏蔽" });
    if (canonical.status >= 200 && !canonicalMatch) failures.push({ path: entry.loc, reason: "canonical 与 sitemap loc 不一致", canonical: canonical.canonical });
  }

  for (const expected of expectedPaths) {
    const expectedUrl = normalizeUrl(resolveUrl(baseUrl, expected));
    if (![...locSet].some((value) => value === expectedUrl)) failures.push({ path: expected, reason: "路由未覆盖" });
  }

  const status = failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS";
  return {
    status,
    sitemapUrl,
    root: { kind: root.kind, bytes: root.bytes, entries: root.entries.length },
    shards: shards.map((shard) => ({ url: redactUrl(shard.url), bytes: shard.bytes, entries: shard.entries.length })),
    entryCount: entries.length,
    duplicateCount: entries.length - locSet.size,
    samples,
    failures,
    warnings,
    result: result(status, `sitemap ${status}`),
  };
}
