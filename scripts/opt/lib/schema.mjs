import { fetchWithTimeout, normalizeUrl, result, isSameOrigin, redactUrl } from "./common.mjs";

const REQUIRED = {
  BlogPosting: ["headline", "datePublished", "dateModified", "author", "image", "mainEntityOfPage", "publisher"],
  BreadcrumbList: ["itemListElement"],
  WebSite: ["name", "url"],
  Organization: ["name", "url"],
};

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function valuesOf(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function typeOf(node) {
  return valuesOf(node?.["@type"])
    .map((value) => String(value))
    .filter(Boolean);
}

function asObject(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value : null;
}

function asText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") return String(value.name || value.url || value["@id"] || "").trim();
  return "";
}

function getUrl(value, baseUrl) {
  const raw = asText(value);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function addIssue(issues, type, path, message, status = "FAIL", value = undefined, expected = undefined) {
  issues.push({ type, path, message, status, value, expected });
}

function validateNode(node, type, issues, baseUrl, canonical) {
  const required = REQUIRED[type] || [];
  for (const field of required) {
    const value = node[field];
    const present = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
    if (!present) addIssue(issues, type, field, `缺少必填字段 ${field}`);
  }

  if (type === "BlogPosting") {
    for (const field of ["datePublished", "dateModified"]) {
      if (node[field] !== undefined && Number.isNaN(Date.parse(String(node[field])))) {
        addIssue(issues, type, field, `日期不可解析: ${String(node[field])}`);
      }
    }
    if (node.author !== undefined) {
      const authors = valuesOf(node.author);
      if (!authors.some((author) => asText(author?.name || author))) {
        addIssue(issues, type, "author.name", "author 缺少可读的 name");
      }
    }
    if (node.publisher !== undefined) {
      const publisher = asObject(node.publisher);
      if (!publisher || !asText(publisher.name)) addIssue(issues, type, "publisher.name", "publisher 缺少 name");
    }
    for (const optional of ["description", "keywords"]) {
      if (node[optional] === undefined || node[optional] === "") {
        addIssue(issues, type, optional, `可选字段 ${optional} 缺失`, "WARN");
      }
    }
    const entity = getUrl(node.mainEntityOfPage?.url || node.mainEntityOfPage?.["@id"] || node.mainEntityOfPage, baseUrl);
    if (canonical && entity && normalizeUrl(entity) !== normalizeUrl(canonical)) {
      addIssue(issues, type, "mainEntityOfPage.url", "与 canonical 不一致", "FAIL", entity, canonical);
    }
  }

  if (type === "BreadcrumbList") {
    const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
    items.forEach((item, index) => {
      const expectedPosition = index + 1;
      if (Number(item?.position) !== expectedPosition) {
        addIssue(issues, type, `itemListElement[${index}].position`, `position 应为 ${expectedPosition}`);
      }
      if (!asText(item?.name || item?.item?.name)) addIssue(issues, type, `itemListElement[${index}].name`, "缺少 name");
      if (!getUrl(item?.item?.url || item?.item?.["@id"] || item?.item, baseUrl)) {
        addIssue(issues, type, `itemListElement[${index}].item`, "缺少 item URL");
      }
    });
  }

  if (type === "WebSite" || type === "Organization") {
    const url = getUrl(node.url, baseUrl);
    if (url && !isSameOrigin(url, baseUrl)) {
      addIssue(issues, type, "url", "url 不是本站自指 URL", "FAIL", url, baseUrl);
    }
  }
}

function extractMeta(html, baseUrl) {
  const canonicalMatches = [...html.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => getUrl(match[1], baseUrl));
  const canonicalReverse = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/gi)]
    .map((match) => getUrl(match[1], baseUrl));
  const ogUrls = [...html.matchAll(/<meta\b[^>]*(?:property|name)=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => getUrl(match[1], baseUrl));
  const ogReverse = [...html.matchAll(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:url["'][^>]*>/gi)]
    .map((match) => getUrl(match[1], baseUrl));
  return {
    canonical: [...canonicalMatches, ...canonicalReverse].filter(Boolean),
    ogUrl: [...ogUrls, ...ogReverse].filter(Boolean),
  };
}

function flattenNodes(value) {
  const nodes = [];
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item["@type"]) nodes.push(item);
    if (Array.isArray(item["@graph"])) item["@graph"].forEach(visit);
  };
  visit(value);
  return nodes;
}

export function extractJsonLd(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match, index) => ({ index, raw: decodeHtml(match[1].trim()) }))
    .map((item) => {
      try {
        return { ...item, parsed: JSON.parse(item.raw), parseError: "" };
      } catch (error) {
        return { ...item, parsed: null, parseError: error instanceof Error ? error.message : String(error) };
      }
    });
}

export async function validateJsonLd({ html, pageUrl, baseUrl, checkImages = true }) {
  const meta = extractMeta(html, baseUrl);
  const canonical = meta.canonical[0] || "";
  const issues = [];
  const entries = extractJsonLd(html);
  const nodes = [];

  if (meta.canonical.length !== 1) {
    addIssue(issues, "canonical", "link[rel=canonical]", `canonical 应唯一，实际 ${meta.canonical.length} 个`, "FAIL", meta.canonical);
  } else if (canonical && normalizeUrl(canonical) !== normalizeUrl(pageUrl)) {
    addIssue(issues, "canonical", "href", "canonical 未自指当前页面", "FAIL", canonical, pageUrl);
  }
  if (meta.ogUrl.length !== 1) {
    addIssue(issues, "canonical", "meta[property=og:url]", `og:url 应唯一，实际 ${meta.ogUrl.length} 个`, "FAIL", meta.ogUrl);
  } else if (canonical && normalizeUrl(meta.ogUrl[0]) !== normalizeUrl(canonical)) {
    addIssue(issues, "canonical", "og:url", "og:url 与 canonical 不一致", "FAIL", meta.ogUrl[0], canonical);
  }

  for (const entry of entries) {
    if (entry.parseError) {
      addIssue(issues, "JSON-LD", `script[${entry.index}]`, `JSON-LD 不可解析: ${entry.parseError}`);
      continue;
    }
    const contextValues = flattenNodes(entry.parsed).length ? flattenNodes(entry.parsed) : [entry.parsed];
    const context = entry.parsed?.["@context"];
    if (context !== "https://schema.org" && !(Array.isArray(context) && context.includes("https://schema.org"))) {
      addIssue(issues, "JSON-LD", `script[${entry.index}].@context`, "@context 必须包含 https://schema.org");
    }
    contextValues.forEach((node) => {
      const types = typeOf(node);
      if (!types.length) addIssue(issues, "JSON-LD", `script[${entry.index}].@type`, "缺少合法 @type");
      types.forEach((type) => {
        nodes.push({ type, node, script: entry.index });
        validateNode(node, type, issues, baseUrl, canonical);
      });
    });
  }

  if (!nodes.length) addIssue(issues, "JSON-LD", "", "页面未检出任何可验证的 JSON-LD 节点");

  const imageUrls = [];
  for (const { type, node } of nodes) {
    if (type !== "BlogPosting") continue;
    for (const image of valuesOf(node.image)) {
      const url = getUrl(image?.url || image?.contentUrl || image, baseUrl);
      if (url && /^https?:/i.test(url)) imageUrls.push({ type, url });
    }
  }
  const imageChecks = [];
  if (checkImages) {
    for (const image of [...new Map(imageUrls.map((item) => [item.url, item])).values()]) {
      try {
        const response = await fetchWithTimeout(image.url, { method: "HEAD" }, 15_000);
        const status = response.ok ? "PASS" : "FAIL";
        imageChecks.push({ url: redactUrl(image.url), status: response.status });
        if (!response.ok) addIssue(issues, image.type, "image", `image HTTP ${response.status}`, "FAIL", image.url, "200");
      } catch (error) {
        imageChecks.push({ url: redactUrl(image.url), status: "SKIP", error: String(error) });
        addIssue(issues, image.type, "image", `image 检查失败: ${String(error)}`, "WARN", image.url);
      }
    }
  }

  const schemaSummary = {};
  for (const node of nodes) {
    schemaSummary[node.type] ||= { type: node.type, detected: 0, pass: 0, fail: 0, warn: 0 };
    schemaSummary[node.type].detected += 1;
  }
  for (const issue of issues) {
    if (!schemaSummary[issue.type]) continue;
    if (issue.status === "FAIL") schemaSummary[issue.type].fail += 1;
    if (issue.status === "WARN") schemaSummary[issue.type].warn += 1;
  }
  for (const summary of Object.values(schemaSummary)) {
    summary.pass = Math.max(0, summary.detected - summary.fail);
    summary.coverage = summary.detected ? summary.pass / summary.detected : 0;
  }

  const status = issues.some((issue) => issue.status === "FAIL") ? "FAIL" : issues.some((issue) => issue.status === "WARN") ? "WARN" : "PASS";
  return {
    status,
    pageUrl,
    canonical,
    ogUrl: meta.ogUrl,
    entries: entries.map((entry) => ({ index: entry.index, parseError: entry.parseError, raw: entry.raw })),
    nodes: nodes.map(({ type, script }) => ({ type, script })),
    issues,
    imageChecks,
    schemaSummary: Object.values(schemaSummary),
    result: result(status, `JSON-LD ${status}`),
  };
}

