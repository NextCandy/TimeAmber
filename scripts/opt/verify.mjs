import { appendFile, copyFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import {
  DEFAULT_BASE_URL,
  HISTORY_ROOT,
  PAGE_DEFINITIONS,
  PROJECT_ROOT,
  REPORTS_ROOT,
  SCENARIOS,
  VIEWPORTS,
  classifyResource,
  createReportDirectory,
  discoverArticlePath,
  ensureDir,
  fileExists,
  fetchWithTimeout,
  getListArg,
  getFileSize,
  gitMetadata,
  hasFlag,
  isSameOrigin,
  isThirdParty,
  median,
  normalizeUrl,
  nowIso,
  pageDefinition,
  parseArgs,
  readJson,
  pct,
  redactUrl,
  resolveUrl,
  result,
  round,
  safeFileName,
  shouldFail,
  statusRank,
  toCsv,
  writeJson,
  writeText,
} from "./lib/common.mjs";
import { validateJsonLd } from "./lib/schema.mjs";
import { validateSitemap } from "./lib/sitemap.mjs";

const METRICS = ["firstScreenKB", "totalKB", "LCP", "CLS", "TBT", "imageShare", "requests"];
const LIGHTHOUSE_PAGES = new Set(["é¦–é¡µ", "æ–‡ç« é¡µ", "åŽå°æ–‡ç« åˆ—è¡¨"]);
const STATIC_SITEMAP_PATHS = ["/", "/archive", "/categories", "/about", "/friends"];
const RESPONSE_BODY_TIMEOUT_MS = Number(process.env.OPT_RESPONSE_BODY_TIMEOUT_MS || 5_000);

function readResponseBodySize(response, contentLength) {
  if (contentLength > 0) return Promise.resolve(contentLength);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(0);
    }, RESPONSE_BODY_TIMEOUT_MS);
    try {
      response.body().then((body) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(body.length);
      }).catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(0);
      });
    } catch {
      settled = true;
      clearTimeout(timer);
      resolve(0);
    }
  });
}

async function waitForBrowserResources(page) {
  return page.evaluate(async (timeoutMs) => {
    const fontWait = document.fonts?.ready
      ? Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
      : Promise.resolve();
    const images = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
    });
    const imageStatuses = await Promise.all(images.map((image) => new Promise((resolve) => {
      if (image.complete) return resolve("complete");
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve("timeout");
      }, timeoutMs);
      const finish = (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        resolve(status);
      };
      const onLoad = () => finish("loaded");
      const onError = () => finish("error");
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    })));
    await fontWait;
    return { visibleImages: images.length, complete: imageStatuses.filter((status) => status === "complete").length, loaded: imageStatuses.filter((status) => status === "loaded").length, errors: imageStatuses.filter((status) => status === "error").length, timedOut: imageStatuses.filter((status) => status === "timeout").length };
  }, RESPONSE_BODY_TIMEOUT_MS);
}

function viewportMode(name) {
  if (name === "mobile" || name.startsWith("mobile") || name === "tablet-768") return "mobile";
  return "desktop";
}

function requestedViewportModes(args) {
  const requested = getListArg(args, "viewport", ["mobile", "desktop"]);
  const modes = new Set();
  for (const name of requested) {
    if (name === "all") {
      modes.add("mobile");
      modes.add("desktop");
    } else if (VIEWPORTS[name]) modes.add(viewportMode(name));
    else if (name === "mobile" || name === "desktop") modes.add(name);
  }
  return [...modes];
}

function pageNames(args) {
  return getListArg(args, "page", Object.keys(PAGE_DEFINITIONS)).map((name) => pageDefinition(name) || {
    name,
    key: safeFileName(name),
    path: name,
    public: true,
  });
}

function sanitizeOrigin(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).replace(/([?&](?:token|key|secret|password|auth)=)[^&]*/gi, "$1[redacted]");
  }
}

const SENSITIVE_REPORT_KEY = /(?:access[_-]?token|api[_-]?key|authorization|cookie|password|private[_-]?key|secret|session|signature|token)/i;

function redactReportText(value) {
  const text = String(value);
  try {
    return redactUrl(text);
  } catch {
    return text;
  }
}

function sanitizeReportValue(value, key = "") {
  if (SENSITIVE_REPORT_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    const direct = redactReportText(value);
    return direct.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeReportValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeReportValue(childValue, childKey)]));
  }
  return value;
}

function metricsFromLhr(lhr) {
  const audit = (id) => lhr?.audits?.[id]?.numericValue;
  const score = (category) => {
    const value = lhr?.categories?.[category]?.score;
    return Number.isFinite(value) ? round(value * 100, 1) : null;
  };
  return {
    LCP: audit("largest-contentful-paint"),
    CLS: audit("cumulative-layout-shift"),
    TBT: audit("total-blocking-time"),
    scores: {
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
    },
  };
}

function htmlImageUrl(src, pageUrl) {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return String(src);
  }
}

function makeSelector(element) {
  if (!element) return "";
  if (element.dataset?.testid) return `[data-testid="${element.dataset.testid}"]`;
  if (element.id) return `#${element.id}`;
  const classes = [...element.classList].filter((name) => /^[a-zA-Z0-9_-]+$/.test(name)).slice(0, 3);
  return `${element.tagName.toLowerCase()}${classes.length ? `.${classes.join(".")}` : ""}`;
}

async function collectBrowserPage({ browser, baseUrl, pageInfo, path, viewportModeValue, scenarioName }) {
  const viewportName = viewportModeValue === "mobile" ? "mobile-390" : "desktop-1440";
  const viewport = VIEWPORTS[viewportName];
  const scenario = SCENARIOS[scenarioName] || SCENARIOS.fast;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: scenario.dpr || 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    userAgent: viewport.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" : undefined,
    storageState: process.env.OPT_ADMIN_STORAGE_STATE || undefined,
  });
  const page = await context.newPage();
  const responses = [];
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("requestfailed", (request) => failedRequests.push({ url: redactUrl(request.url()), error: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => {
    const request = response.request();
    const contentLength = Number(response.headers()["content-length"] || 0);
    responses.push({
      url: response.url(),
      status: response.status(),
      type: request.resourceType(),
      contentType: response.headers()["content-type"] || "",
      contentLength,
      body: readResponseBodySize(response, contentLength),
      timing: request.timing(),
    });
  });
  await page.addInitScript(() => {
    window.__optMetrics = { lcp: null, layoutShifts: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const element = entry.element;
          window.__optMetrics.lcp = {
            startTime: entry.startTime,
            size: entry.size,
            url: entry.url || "",
            element: element ? {
              selector: element.id ? `#${element.id}` : element.dataset?.testid ? `[data-testid="${element.dataset.testid}"]` : element.tagName.toLowerCase(),
              tag: element.tagName,
              text: (element.textContent || "").slice(0, 120),
            } : null,
          };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__optMetrics.layoutShifts.push({
            value: entry.value,
            sources: (entry.sources || []).map((source) => ({
              selector: source.node?.id ? `#${source.node.id}` : source.node?.dataset?.testid ? `[data-testid="${source.node.dataset.testid}"]` : source.node?.tagName?.toLowerCase() || "",
              nodeLabel: source.node?.textContent?.slice(0, 120) || "",
            })),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (scenario.download > 0 || scenario.latency > 0) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: scenario.latency,
      downloadThroughput: (scenario.download * 1024) / 8,
      uploadThroughput: (scenario.upload * 1024) / 8,
    });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpu || 1 });

  const record = {
    page: pageInfo.name,
    path,
    viewport: viewportModeValue,
    viewportName,
    scenario: scenarioName,
    url: resolveUrl(baseUrl, path),
    status: "PASS",
  };
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    record.redirectedUrl = page.url();
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }).catch(() => {});
    record.resourceWait = await waitForBrowserResources(page).catch((error) => ({ error: String(error) }));
    await page.waitForTimeout(200);
    const inspection = await page.evaluate(() => {
      const performanceEntries = performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
        initiatorType: entry.initiatorType,
      }));
      const opt = window.__optMetrics || { lcp: null, layoutShifts: [] };
      const images = [...document.images].map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.getAttribute("alt"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: Math.round(image.getBoundingClientRect().width),
        renderedHeight: Math.round(image.getBoundingClientRect().height),
      }));
      return {
        title: document.title,
        textLength: (document.body?.innerText || "").trim().length,
        bodyHeight: document.documentElement.scrollHeight,
        performanceEntries,
        lcp: opt.lcp,
        layoutShifts: opt.layoutShifts,
        images,
        bodyText: (document.body?.innerText || "").slice(0, 400),
      };
    });
    record.inspection = inspection;
    record.resources = await Promise.all(responses.map(async (item) => ({
      url: redactUrl(item.url),
    rawUrl: item.url,
      status: item.status,
      requestType: item.type,
      contentType: item.contentType,
      transferBytes: Math.max(item.contentLength || 0, await item.body),
      thirdParty: isThirdParty(item.url, baseUrl),
      category: classifyResource(item.url, item.contentType),
      timing: item.timing,
    })));
    const timingByUrl = new Map(inspection.performanceEntries.map((entry) => [entry.name, entry]));
    const lcpStart = Number(inspection.lcp?.startTime || 2500);
    record.resources = record.resources.map((resource) => {
      const timing = timingByUrl.get(resource.rawUrl);
      const { rawUrl: _rawUrl, ...safeResource } = resource;
      return {
        ...safeResource,
        firstScreen: Boolean(timing && timing.responseEnd <= lcpStart),
        transferBytes: Math.max(resource.transferBytes, timing?.transferSize || 0),
      };
    });
    const totalBytes = record.resources.reduce((sum, resource) => sum + resource.transferBytes, 0);
    const firstScreenBytes = record.resources.filter((resource) => resource.firstScreen).reduce((sum, resource) => sum + resource.transferBytes, 0);
    const imageBytes = record.resources.filter((resource) => resource.category === "å›¾ç‰‡").reduce((sum, resource) => sum + resource.transferBytes, 0);
    record.metrics = {
      firstScreenKB: round(firstScreenBytes / 1024, 2),
      totalKB: round(totalBytes / 1024, 2),
      imageShare: totalBytes ? round(imageBytes / totalBytes, 4) : 0,
      requests: record.resources.length,
      browserLCP: inspection.lcp?.startTime || null,
      browserCLS: round(inspection.layoutShifts.reduce((sum, entry) => sum + Number(entry.value || 0), 0), 4),
    };
    record.imageHealth = {
      total: inspection.images.length,
      missingAlt: inspection.images.filter((image) => image.alt === null).map((image) => image.src),
      missingDimensions: inspection.images.filter((image) => image.width === null || image.height === null).map((image) => image.src),
      nonModern: inspection.images.filter((image) => !/\.(?:avif|webp|svg)(?:[?#]|$)/i.test(image.src || "") && !/^data:image\/svg/i.test(image.src || "")).map((image) => image.src),
      broken: record.resources.filter((resource) => resource.status >= 400 && resource.category === "å›¾ç‰‡").map((resource) => ({ url: resource.url, status: resource.status })),
    };
    record.contribution = Object.values(record.resources.reduce((groups, resource) => {
      const category = resource.thirdParty ? "ç¬¬ä¸‰æ–¹" : resource.category;
      groups[category] ||= { category, requests: 0, transferKB: 0, firstScreenKB: 0, ç½µ¶‰žËkºwµçUÉ”¹É•…Í½¸ñð™…¥±ÕÉ”¹µ•ÍÍ…”ñð€‹šr«¦k¢þ‰õ€¤€èlˆ´ƒš^ƒ–’Ç¢Ò—¦†çŽ‰t¤°(€€€€ˆˆ°(€t¹©½¥¸ ‰q¸ˆ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸±…Ñ•ÍÑI•Á½ÉÐ¡±…‰•°¤ì(€ÑÉäì(€€€½¹ÍÐ•¹ÑÉ¥•Ì€ô…Ý…¥ÐÉ•…‘‘¥È¡IA=IQM}I==P°ìÝ¥Ñ¡¥±•QåÁ•ÌèÑÉÕ”ô¤ì(€€€É•ÑÕÉ¸•¹ÑÉ¥•Ì(€€€€€€¹™¥±Ñ•È ¡•¹ÑÉä¤€ôø•¹ÑÉä¹¥Í¥É•Ñ½Éä ¤€˜˜•¹ÑÉä¹¹…µ”¹ÍÑ…ÉÑÍ]¥Ñ ¡€‘íÍ…™•¥±•9…µ”¡±…‰•°¥ôµ€¤¤(€€€€€€¹Ñ½M½ÉÑ• ¡„°ˆ¤€ôøˆ¹¹…µ”¹±½…±•½µÁ…É”¡„¹¹…µ”¤¥lÁtü¹¹…µ”ñð€ˆˆì(€ô…Ñ ì(€€€É•ÑÕÉ¸€ˆˆì(€ô)ô()…Íå¹Œ™Õ¹Ñ¥½¸½µÁ…É•I•Á½ÉÑÌ¡É•Á½ÉÑ¥È°½µÁ…É•1…‰•°°ÕÉÉ•¹ÑI…Ü¤ì(€¥˜€ …½µÁ…É•1…‰•°¤É•ÑÕÉ¸¹Õ±°ì(€½¹ÍÐ¹…µ”€ô…Ý…¥Ð±…Ñ•ÍÑI•Á½ÉÐ¡½µÁ…É•1…‰•°¤ì(€¥˜€ …¹…µ”¤É•ÑÕÉ¸ìÍÑ…ÑÕÌè€‰M-%@ˆ°É•…Í½¸èƒš&û’â7–"À½µÁ…É”ƒš*—–F(€‘í½µÁ…É•1…‰•±õ€ôì(€½¹ÍÐÁÉ•Ù¥½ÕÌ€ô…Ý…¥Ð¥µÁ½ÉÐ ˆ¸½±¥ˆ½½µµ½¸¹µ©Ìˆ¤¹Ñ¡•¸ ¡µ½‘Õ±”¤€ôøµ½‘Õ±”¹É•…‘)Í½¸¡©½¥¸¡IA=IQM}I==P°¹…µ”°€‰É…Ü¹©Í½¸ˆ¤°¹Õ±°¤¤ì(€¥˜€ …ÁÉ•Ù¥½ÕÌ¤É•ÑÕÉ¸ìÍÑ…ÑÕÌè€‰M-%@ˆ°É•…Í½¸è½µÁ…É”ƒš*—–F+žòë–ÂDÉ…Ü¹©Í½¸è€‘í¹…µ•õ€ôì(€½¹ÍÐÕÉÉ•¹Ñ5…À€ô¹•Ü5…À¡µ•ÑÉ¥I½ÝÌ¡ÕÉÉ•¹ÑI…Ü¹Á…•I•½É‘Ì¤¹µ…À ¡É½Ü¤€ôøm€‘íÉ½Ü¹Á…•ô¼‘íÉ½Ü¹Ù¥•ÝÁ½ÉÑô¼‘íÉ½Ü¹Í•¹…É¥½ô¼‘íÉ½Ü¹µ•ÑÉ¥õ€°É½Ü¹Ù…±Õ•t¤¤ì(€½¹ÍÐÁÉ•Ù¥½ÕÍ5…À€ô¹•Ü5…À¡µ•ÑÉ¥I½ÝÌ¡ÁÉ•Ù¥½ÕÌ¹Á…•I•½É‘Ìñðmt¤¹µ…À ¡É½Ü¤€ôøm€‘íÉ½Ü¹Á…•ô¼‘íÉ½Ü¹Ù¥•ÝÁ½ÉÑô¼‘íÉ½Ü¹Í•¹…É¥½ô¼‘íÉ½Ü¹µ•ÑÉ¥õ€°É½Ü¹Ù…±Õ•t¤¤ì(€½¹ÍÐÉ½ÝÌ€ômtì(€™½È€¡½¹ÍÐm­•ä°ÕÉÉ•¹Ñt½˜ÕÉÉ•¹Ñ5…À¤ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÍY…±Õ”€ôÁÉ•Ù¥½ÕÍ5…À¹•Ð¡­•ä¤ì(€€€¥˜€ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡9Õµ‰•È¡ÕÉÉ•¹Ð¤¤ñð€…9Õµ‰•È¹¥Í¥¹¥Ñ”¡9Õµ‰•È¡ÁÉ•Ù¥½ÕÍY…±Õ”¤¤¤½¹Ñ¥¹Õ”ì(€€€½¹ÍÐ‘•±Ñ„€ô9Õµ‰•È¡ÕÉÉ•¹Ð¤€´9Õµ‰•È¡ÁÉ•Ù¥½ÕÍY…±Õ”¤ì(€€€É½ÝÌ¹ÁÕÍ ¡ì­•ä°‰•™½É”èÁÉ•Ù¥½ÕÍY…±Õ”°…™Ñ•ÈèÕÉÉ•¹Ð°‘•±Ñ„°É…Ñ¥¼èÁÉ•Ù¥½ÕÍY…±Õ”€ü‘•±Ñ„€¼9Õµ‰•È¡ÁÉ•Ù¥½ÕÍY…±Õ”¤€è€À°ÍÑ…ÑÕÌè‘•±Ñ„€ø€À€ü€‰]I8ˆ€è€‰AMLˆô¤ì(€ô(€½¹ÍÐµ…É­‘½Ý¸€ôl(€€€€Œƒ¦ª3¢¾–¾çš¾S¾òh‘í½µÁ…É•1…‰•±ôƒŠH€‘íÕÉÉ•¹ÑI…Ü¹±…‰•±õ€°(€€€€ˆˆ°(€€€€´ƒ–~ëžêÿš*—–F+¾òh‘í¹…µ•õ€°(€€€€ˆ´ƒš¶–ó’î¢†£šVÃ–ó–Š{–*ƒ¾òo–¾ç’ê81@½Q	P½1L¿’öOžž¼¿¢¾ßšÆšVÃ¦k–âãš?–FÏžv–*–2[¾ò3¢¾ßžîO–B#¦Šžº_–"“–ºkŽˆ°(€€€€ˆˆ°(€€€€‰ðƒ¦R¸ðƒšRç–&4ðƒšRç–B8ðƒ–>c–2[¦<ðƒ–>c–2[š¾S’ú,ðƒ–"“–ºhðˆ°(€€€€‰ð€´´´ð€´´´èð€´´´èð€´´´èð€´´´èð€´´´ðˆ°(€€€€¸¸¹É½ÝÌ¹µ…À ¡É½Ü¤€ôøð€‘íÉ½Ü¹­•åôð€‘íÉ½Ü¹‰•™½É•ôð€‘íÉ½Ü¹…™Ñ•Éôð€‘íÉ½Õ¹¡É½Ü¹‘•±Ñ„°€Ì¥ôð€‘ì¡É½Ü¹É…Ñ¥¼€¨€ÄÀÀ¤¹Ñ½¥á• È¥ô”ð€‘íÉ½Ü¹ÍÑ…ÑÕÍôñ€¤°(€€€€ˆˆ°(€t¹©½¥¸ ‰q¸ˆ¤ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰‘¥™˜¹µˆ¤°µ…É­‘½Ý¸¤ì(€É•ÑÕÉ¸ìÍÑ…ÑÕÌè€‰AMLˆ°½µÁ…É•è¹…µ”°É½ÝÌôì)ô()…Íå¹Œ™Õ¹Ñ¥½¸…ÁÁ•¹‘!¥ÍÑ½Éä¡É•½É‘Ì°‰Õ‘•ÑI½ÝÍY…±Õ”°É•Á½ÉÑ%°¥Ð¤ì(€…Ý…¥Ð•¹ÍÕÉ•¥È¡!%MQ=Ie}I==P¤ì(€½¹ÍÐ±¥¹•Ì€ôÉ•½É‘Ì¹µ…À ¡É•½É¤€ôø)M=8¹ÍÑÉ¥¹¥™ä¡ì(€€€Ñ¥µ•ÍÑ…µÀè¹½Ý%Í¼ ¤°(€€€½µµ¥Ðè¥Ð¹½µµ¥Ð°(€€€‰É…¹ è¥Ð¹‰É…¹ °(€€€ÁÈè¥Ð¹ÁÈ°(€€€Ñ¥Ñ±”è¥Ð¹Ñ¥Ñ±”°(€€€…ÕÑ¡½Èè¥Ð¹…ÕÑ¡½È°(€€€Á…”èÉ•½É¹Á…”°(€€€Ù¥•ÝÁ½ÉÐèÉ•½É¹Ù¥•ÝÁ½ÉÐ°(€€€Í•¹…É¥¼èÉ•½É¹Í•¹…É¥¼°(€€€‘ÁÈèÉ•½É¹Ù¥•ÝÁ½ÉÑ9…µ”€ôôô€‰µ½‰¥±”´ÌäÀˆ€ü€¡M9I%=MmÉ•½É¹Í•¹…É¥½tü¹‘ÁÈñð€Ä¤€è€Ä°(€€€™¥ÉÍÑMÉ••¹-èÉ•½É¹µ•ÑÉ¥Ìü¹™¥ÉÍÑMÉ••¹-€üü¹Õ±°°(€€€Ñ½Ñ…±-èÉ•½É¹µ•ÑÉ¥Ìü¹Ñ½Ñ…±-€üü¹Õ±°°(€€€1@èÉ•½É¹µ•ÑÉ¥Ìü¹1@€üüÉ•½É¹±¥¡Ñ¡½ÕÍ”ü¹µ•ÑÉ¥Ìü¹1@€üü¹Õ±°°(€€€1LèÉ•½É¹µ•ÑÉ¥Ìü¹1L€üüÉ•½É¹±¥¡Ñ¡½ÕÍ”ü¹µ•ÑÉ¥Ìü¹1L€üü¹Õ±°°(€€€Q	PèÉ•½É¹µ•ÑÉ¥Ìü¹Q	P€üüÉ•½É¹±¥¡Ñ¡½ÕÍ”ü¹µ•ÑÉ¥Ìü¹Q	P€üü¹Õ±°°(€€€¥µ…•M¡…É”èÉ•½É¹µ•ÑÉ¥Ìü¹¥µ…•M¡…É”€üü¹Õ±°°(€€€É•ÅÕ•ÍÑÌèÉ•½É¹µ•ÑÉ¥Ìü¹É•ÅÕ•ÍÑÌ€üü¹Õ±°°(€€€©Í½¹1‘A…ÍÍI…Ñ”èÉ•½É¹Í¡•µ„ü¹Í¡•µ…MÕµµ…Éäü¹±•¹Ñ €üÉ•½É¹Í¡•µ„¹Í¡•µ…MÕµµ…Éä¹É•‘Õ” ¡ÍÕ´°¥Ñ•´¤€ôøÍÕ´€¬¥Ñ•´¹½Ù•É…”°€À¤€¼É•½É¹Í¡•µ„¹Í¡•µ…MÕµµ…Éä¹±•¹Ñ €è¹Õ±°°(€€€Í¥Ñ•µ…Á	åÑ•ÌèÉ•½É¹Í¥Ñ•µ…Á	åÑ•Ì€üü¹Õ±°°(€€€€Ù¥ÍÕ…±¥™™I…Ñ¥¼èÉ•½É¹Ù¥ÍÕ…±¥™™I…Ñ¥¼€üü¹Õ±°°(€€€€½¹ÑÉ¥‰ÕÑ¥½¸è€¡É•½É¹½¹ÑÉ¥‰ÕÑ¥½¸ñðmt¤(€€€€€€€¹Ñ½M½ÉÑ• ¡„°ˆ¤€ôø9Õµ‰•È¡ˆ¹ÑÉ…¹Í™•É-ñð€À¤€´9Õµ‰•È¡„¹ÑÉ…¹Í™•É-ñð€À¤¤(€€€€€€€¹Í±¥” À°€ÄÀ¤(€€€€€€€¹µ…À ¡¥Ñ•´¤€ôø€¡ì…Ñ•½Éäè¥Ñ•´¹…Ñ•½Éä°ÑÉ…¹Í™•É-èÉ½Õ¹¡¥Ñ•´¹ÑÉ…¹Í™•É-°€È¤°Í¡…É”è¥Ñ•´¹Í¡…É”ô¤¤°(€€€€‰Õ‘•Ðè‰Õ‘•ÑI½ÝÍY…±Õ”¹™¥±Ñ•È ¡É½Ü¤€ôøÉ½Ü¹Á…”€ôôôÉ•½É¹Á…”€˜˜É½Ü¹Ù¥•ÝÁ½ÉÐ€ôôôÉ•½É¹Ù¥•ÝÁ½ÉÐ€˜˜É½Ü¹Í•¹…É¥¼€ôôôÉ•½É¹Í•¹…É¥¼¤¹•Ù•Éä ¡É½Ü¤€ôøÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰AMLˆ¤°(€€€Í¹…ÁÍ¡½Ñ%èÁÉ½•ÍÌ¹•¹Ø¹=AQ}M9AM!=Q}%ñð€ˆˆ°(€€€É•Á½ÉÑ%°(€ô¤¤ì(€…Ý…¥Ð…ÁÁ•¹‘¥±”¡©½¥¸¡!%MQ=Ie}I==P°€‰µ•ÑÉ¥Ì¹©Í½¹°ˆ¤°€‘í±¥¹•Ì¹©½¥¸ ‰q¸ˆ¥õq¹€°€‰ÕÑ˜àˆ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸ÝÉ¥Ñ•I•ÁÉ¼¡É•Á½ÉÑ¥È°±…‰•°°‰…Í•UÉ°¤ì(€½¹ÍÐÍÉ¥ÁÐ€ô€Œ„½ÕÍÈ½‰¥¸½•¹Ø‰…Í¡q¹Í•Ð€µ•Õ¼Á¥Á•™…¥±q¹	M}UI0ôˆ‘íÍ…¹¥Ñ¥é•=É¥¥¸¡‰…Í•UÉ°¥ô‰q¹1	0ô‰É•ÁÉ¼´¡‘…Ñ”€¬•d•´•´• •4•L¤‰q¹q¹¥˜ml€µ¸€ˆ‘ìœ‘í=AQ}	M}UI0èµôôˆutìÑ¡•¸	M}UI0ôˆ‘ìœ‘í=AQ}	M}UI1ôôˆì™¥q¹¹½‘”€´µÙ•ÉÍ¥½¹q¹¹Á´€´µÙ•ÉÍ¥½¹q¹•¡¼€‰I•ÁÉ½‘Õ¥¹œ€‘í±…‰•±ô…Ð€‘ìœ‘í	M}UI1ôô‰q¹¹Á´ÉÕ¸½ÁÐéÙ•É¥™ä€´´€´µ±…‰•°€ˆ‘ìœ‘í1	1ôôˆ€´µ‰…Í”µÕÉ°€ˆ‘ìœ‘í	M}UI1ôôˆ€ˆ‘ìœ‘íôô‰q¹€ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰É•ÁÉ¼¹Í ˆ¤°ÍÉ¥ÁÐ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸µ…¥¸ ¤ì(€½¹ÍÐ…ÉÌ€ôÁ…ÉÍ•ÉÌ ¤ì(€½¹ÍÐ±…‰•°€ôMÑÉ¥¹œ¡…ÉÌ¹±…‰•°ñð€‰‰•™½É”ˆ¤ì(€½¹ÍÐ‰…Í•UÉ°€ôMÑÉ¥¹œ¡…ÉÍl‰‰…Í”µÕÉ°‰tñðÁÉ½•ÍÌ¹•¹Ø¹=AQ}	M}UI0ñðU1Q}	M}UI0¤¹É•Á±…” ½p¼¼°€ˆˆ¤ì(€½¹ÍÐÍ•±•Ñ•‘A…•Ì€ôÁ…•9…µ•Ì¡…ÉÌ¤ì(€½¹ÍÐµ½‘•Ì€ôÉ•ÅÕ•ÍÑ•‘Y¥•ÝÁ½ÉÑ5½‘•Ì¡…ÉÌ¤ì(€½¹ÍÐÍ•¹…É¥½9…µ”€ôMÑÉ¥¹œ¡…ÉÌ¹Í•¹…É¥¼ñð€‰™…ÍÐˆ¤ì(€½¹ÍÐÉ•Á½ÉÑ¥È€ô…Ý…¥ÐÉ•…Ñ•I•Á½ÉÑ¥É•Ñ½Éä¡±…‰•°¤ì(€½¹ÍÐÉ•Á½ÉÑ%€ôÉ•Á½ÉÑ¥È¹ÍÁ±¥Ð ½mqp½t¼¤¹Á½À ¤ì(€½¹ÍÐ¥Ð€ô¥Ñ5•Ñ…‘…Ñ„¡AI=)Q}I==P¤ì(€½¹ÍÐÁ…•I•½É‘Ì€ômtì(€½¹ÍÐ±¥¡Ñ¡½ÕÍ•IÕ¹Ì€ômtì(€½¹ÍÐ™…¥±ÕÉ•Ì€ômtì(€½¹ÍÐ‰Õ‘•Ñ½¹™¥œ€ô…Ý…¥Ð±½…‘	Õ‘•Ð ¤ì(€±•Ð‰É½ÝÍ•Èì(€±•Ð‰É½ÝÍ•ÉÉÉ½È€ô¹Õ±°ì(€ÑÉäì(€€€‰É½ÝÍ•È€ô…Ý…¥Ð¡É½µ¥Õ´¹±…Õ¹ ¡ì¡•…‘±•ÍÌèÑÉÕ”°•á•ÕÑ…‰±•A…Ñ èÁÉ½•ÍÌ¹•¹Ø¹=AQ}!I=5}AQ ñð¡É½µ¥Õ´¹•á•ÕÑ…‰±•A…Ñ  ¤ô¤ì(€ô…Ñ €¡•ÉÉ½È¤ì(€€€‰É½ÝÍ•ÉÉÉ½È€ôMÑÉ¥¹œ¡•ÉÉ½È¤ì(€€€™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‰‰É½ÝÍ•Èˆ°É•…Í½¸è¡É½µ¥Õ´ƒ–B¿–*£–’Ç¢Ò”è€‘í‰É½ÝÍ•ÉÉÉ½Éõ€ô¤ì(€ô((€™½È€¡½¹ÍÐÁ…•%¹™¼½˜Í•±•Ñ•‘A…•Ì¤ì(€€€½¹ÍÐÁ…Ñ €ôÁ…•%¹™¼¹…ÉÑ¥±”€ü…Ý…¥Ð‘¥Í½Ù•ÉÉÑ¥±•A…Ñ ¡‰…Í•UÉ°°…ÉÌ¹…ÉÑ¥±”ñð€ˆˆ¤€èÁ…•%¹™¼¹Á…Ñ ì(€€€™½È€¡½¹ÍÐµ½‘”½˜µ½‘•Ì¤ì(€€€€€¥˜€ …‰É½ÝÍ•È¤‰É•…¬ì(€€€€€½¹ÍÐÉ•½É€ô…Ý…¥Ð½±±•Ñ	É½ÝÍ•ÉA…”¡ì‰É½ÝÍ•È°‰…Í•UÉ°°Á…•%¹™¼°Á…Ñ °Ù¥•ÝÁ½ÉÑ5½‘•Y…±Õ”èµ½‘”°Í•¹…É¥½9…µ”ô¤ì(€€€€€Á…•I•½É‘Ì¹ÁÕÍ ¡É•½É¤ì(€€€€€¥˜€¡É•½É¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌèÉ•½É¹ÍÑ…ÑÕÌ°Í½Á”è€‘íÉ•½É¹Á…•ô¼‘íµ½‘•õ€°É•…Í½¸èÉ•½É¹É•…Í½¸ô¤ì(€€€€€¥˜€¡É•½É¹¥µ…•!•…±Ñ ü¹µ¥ÍÍ¥¹±Ðü¹±•¹Ñ ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‘íÉ•½É¹Á…•ô¼‘íµ½‘•ô½…±Ñ€°É•…Í½¸èƒžòë–ÂD…±Ð€‘íÉ•½É¹¥µ…•!•…±Ñ ¹µ¥ÍÍ¥¹±Ð¹±•¹Ñ¡ôƒ’â©€°¥Ñ•µÌèÉ•½É¹¥µ…•!•…±Ñ ¹µ¥ÍÍ¥¹±Ðô¤ì(€€€€€¥˜€¡É•½É¹¥µ…•!•…±Ñ ü¹µ¥ÍÍ¥¹¥µ•¹Í¥½¹Ìü¹±•¹Ñ ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‘íÉ•½É¹Á…•ô¼‘íµ½‘•ô½‘¥µ•¹Í¥½¹Í€°É•…Í½¸èƒžòë–ÂG–º÷¦®`€‘íÉ•½É¹¥µ…•!•…±Ñ ¹µ¥ÍÍ¥¹¥µ•¹Í¥½¹Ì¹±•¹Ñ¡ôƒ’â©€°¥Ñ•µÌèÉ•½É¹¥µ…•!•…±Ñ ¹µ¥ÍÍ¥¹¥µ•¹Í¥½¹Ìô¤ì(€€€€€¥˜€¡É•½É¹¥µ…•!•…±Ñ ü¹‰É½­•¸ü¹±•¹Ñ ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‘íÉ•½É¹Á…•ô¼‘íµ½‘•ô½¥µ…•Í€°É•…Í½¸èƒ–nûž&!QQ@ƒ–’Ç¢Ò”€‘íÉ•½É¹¥µ…•!•…±Ñ ¹‰É½­•¸¹±•¹Ñ¡ôƒ’â©€°¥Ñ•µÌèÉ•½É¹¥µ…•!•…±Ñ ¹‰É½­•¸ô¤ì(€€€€€¥˜€¡É•½É¹¥µ…•!•…±Ñ ü¹¹½¹5½‘•É¸ü¹±•¹Ñ ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”è€‘íÉ•½É¹Á…•ô¼‘íµ½‘•ô½µ½‘•É¸µ¥µ…•Í€°É•…Í½¸èƒ¦v{ž:Ã’î–nûž&š‚ó–ò<€‘íÉ•½É¹¥µ…•!•…±Ñ ¹¹½¹5½‘•É¸¹±•¹Ñ¡ôƒ’â©€°¥Ñ•µÌèÉ•½É¹¥µ…•!•…±Ñ ¹¹½¹5½‘•É¸ô¤ì((€€€€€¥˜€¡1%!Q!=UM}AL¹¡…Ì¡Á…•%¹™¼¹¹…µ”¤¤ì(€€€€€€€½¹ÍÐ±¥¡Ñ¡½ÕÍ”€ô…Ý…¥ÐÉÕ¹1¥¡Ñ¡½ÕÍ•5•‘¥…¸¡ìÉ•Á½ÉÑ¥È°ÕÉ°èÉ•½É¹ÕÉ°°µ½‘”°±…‰•°è€‘íÁ…•%¹™¼¹­•åô´‘íµ½‘•õ€ô¤ì(€€€€€€€±¥¡Ñ¡½ÕÍ”¹Á…”€ôÁ…•%¹™¼¹¹…µ”ì(€€€€€€€±¥¡Ñ¡½ÕÍ•IÕ¹Ì¹ÁÕÍ ¡±¥¡Ñ¡½ÕÍ”¤ì(€€€€€€€É•½É¹±¥¡Ñ¡½ÕÍ”€ô±¥¡Ñ¡½ÕÍ”ì(€€€€€€€¥˜€¡±¥¡Ñ¡½ÕÍ”¹ÍÑ…ÑÕÌ€„ôô€‰%0ˆ€˜˜±¥¡Ñ¡½ÕÍ”¹µ•ÑÉ¥Ì¤ì(€€€€€€€€€É•½É¹µ•ÑÉ¥Ì€ôì€¸¸¹É•½É¹µ•ÑÉ¥Ì°€¸¸¹±¥¡Ñ¡½ÕÍ”¹µ•ÑÉ¥Ìôì(€€€€€€€ô(€€€€€€€¥˜€¡±¥¡Ñ¡½ÕÍ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤ì(€€€€€€€€€™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è±¥¡Ñ¡½ÕÍ”¼‘íÁ…•%¹™¼¹¹…µ•ô¼‘íµ½‘•õ€°É•…Í½¸è±¥¡Ñ¡½ÕÍ”¹•ÉÉ½Èñð€‰1¥¡Ñ¡½ÕÍ”ƒ–’Ç¢Ò”ˆô¤ì(€€€€€€€ô•±Í”¥˜€¡±¥¡Ñ¡½ÕÍ”¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤ì(€€€€€€€€€™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”è±¥¡Ñ¡½ÕÍ”¼‘íÁ…•%¹™¼¹¹…µ•ô¼‘íµ½‘•õ€°É•…Í½¸è€‰1¥¡Ñ¡½ÕÍ”ƒ’â'š²‡¦š‚ßšr«–£¦£š"C–*¾ò3’öÿžR£–>¿žR£š‚ßšr³’â·’ö7šVÀˆô¤ì(€€€€€€€ô(€€€€€ô(€€€ô(€ô(€¥˜€¡‰É½ÝÍ•È¤…Ý…¥Ð‰É½ÝÍ•È¹±½Í” ¤ì(€¥˜€ …‰É½ÝÍ•È€˜˜€…‰É½ÝÍ•ÉÉÉ½È¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‰‰É½ÝÍ•Èˆ°É•…Í½¸è€‹šÊ‡šr'–>¿žR£šÖ?¢ž#–f ˆô¤ì((€½¹ÍÐÍ¡•µ…I•ÍÕ±ÑÌ€ômtì(€™½È€¡½¹ÍÐÉ•½É½˜Á…•I•½É‘Ì¹™¥±Ñ•È ¡¥Ñ•´¤€ôø¥Ñ•´¹ÍÑ…ÑÕÌ€„ôô€‰%0ˆ¤¤ì(€€€ÑÉäì(€€€€€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð™•Ñ¡]¥Ñ¡Q¥µ•½ÕÐ¡É•½É¹ÕÉ°°íô°€ÈÁ|ÀÀÀ¤ì(€€€€€½¹ÍÐ¡Ñµ°€ô…Ý…¥ÐÉ•ÍÁ½¹Í”¹Ñ•áÐ ¤ì(€€€€€½¹ÍÐÍ¡•µ„€ô…Ý…¥ÐÙ…±¥‘…Ñ•)Í½¹1¡ì¡Ñµ°°Á…•UÉ°èÉ•½É¹ÕÉ°°‰…Í•UÉ°°¡•­%µ…•Ìè€…¡…Í±…œ¡…ÉÌ°€‰Í­¥Àµ¥µ…”µ¡ÑÑÀˆ¤ô¤ì(€€€€€É•½É¹Í¡•µ„€ôÍ¡•µ„ì(€€€€€Í¡•µ…I•ÍÕ±ÑÌ¹ÁÕÍ ¡Í¡•µ„¤ì(€€€€€¥˜€¡Í¡•µ„¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”èÍ¡•µ„¼‘íÉ•½É¹Á…•õ€°É•…Í½¸è€‘íÍ¡•µ„¹¥ÍÍÕ•Ì¹±•¹Ñ¡ôƒšv„)M=8µ1½…¹½¹¥…°ƒ¦^»¦Ša€°¥Ñ•µÌèÍ¡•µ„¹¥ÍÍÕ•Ìô¤ì(€€€€€•±Í”¥˜€¡Í¡•µ„¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”èÍ¡•µ„¼‘íÉ•½É¹Á…•õ€°É•…Í½¸è€‘íÍ¡•µ„¹¥ÍÍÕ•Ì¹±•¹Ñ¡ôƒšv„)M=8µ1ƒ¢¶›–F)€°¥Ñ•µÌèÍ¡•µ„¹¥ÍÍÕ•Ìô¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”èÍ¡•µ„¼‘íÉ•½É¹Á…•õ€°É•…Í½¸èMÑÉ¥¹œ¡•ÉÉ½È¤ô¤ì(€€€ô(€ô(€½¹ÍÐ½µ‰¥¹•‘M¡•µ„€ôì(€€€ÍÑ…ÑÕÌèÍ¡•µ…I•ÍÕ±ÑÌ¹Í½µ” ¡¥Ñ•´¤€ôø¥Ñ•´¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤€ü€‰%0ˆ€èÍ¡•µ…I•ÍÕ±ÑÌ¹Í½µ” ¡¥Ñ•´¤€ôø¥Ñ•´¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤€ü€‰]I8ˆ€èÍ¡•µ…I•ÍÕ±ÑÌ¹±•¹Ñ €ü€‰AMLˆ€è€‰M-%@ˆ°(€€€Á…•ÌèÍ¡•µ…I•ÍÕ±ÑÌ°(€€€Í¡•µ…MÕµµ…ÉäèÍ¡•µ…I•ÍÕ±ÑÌ¹™±…Ñ5…À ¡¥Ñ•´¤€ôø¥Ñ•´¹Í¡•µ…MÕµµ…Éäñðmt¤°(€€€¥ÍÍÕ•ÌèÍ¡•µ…I•ÍÕ±ÑÌ¹™±…Ñ5…À ¡¥Ñ•´¤€ôø¥Ñ•´¹¥ÍÍÕ•Ìñðmt¤°(€ôì((€½¹ÍÐÍ¥Ñ•µ…ÁI•ÍÕ±Ð€ô…Ý…¥ÐÙ…±¥‘…Ñ•M¥Ñ•µ…À¡ì‰…Í•UÉ°°•áÁ•Ñ•‘A…Ñ¡ÌèMQQ%}M%Q5A}AQ!Lô¤ì(€¥˜€¡Í¥Ñ•µ…ÁI•ÍÕ±Ð¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‰Í¥Ñ•µ…Àˆ°É•…Í½¸èÍ¥Ñ•µ…ÁI•ÍÕ±Ð¹™…¥±ÕÉ•Ì¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹É•…Í½¸¤¹©½¥¸ ‹¾òlˆ¤ô¤ì(€•±Í”¥˜€¡Í¥Ñ•µ…ÁI•ÍÕ±Ð¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”è€‰Í¥Ñ•µ…Àˆ°É•…Í½¸èÍ¥Ñ•µ…ÁI•ÍÕ±Ð¹Ý…É¹¥¹Ì¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹É•…Í½¸¤¹©½¥¸ ‹¾òlˆ¤ô¤ì(€™½È€¡½¹ÍÐÉ•½É½˜Á…•I•½É‘Ì¤É•½É¹Í¥Ñ•µ…Á	åÑ•Ì€ôÍ¥Ñ•µ…ÁI•ÍÕ±Ð¹É½½Ðü¹‰åÑ•Ì€üü¹Õ±°ì(€½¹ÍÐÉ½‰½ÑÍI•ÍÕ±Ð€ô…Ý…¥Ð€¡…Íå¹Œ€ ¤€ôøì(€€€ÑÉäì(€€€€€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð™•Ñ¡]¥Ñ¡Q¥µ•½ÕÐ¡É•Í½±Ù•UÉ°¡‰…Í•UÉ°°€ˆ½É½‰½ÑÌ¹ÑáÐˆ¤°íô°€ÄÕ|ÀÀÀ¤ì(€€€€€½¹ÍÐÑ•áÐ€ô…Ý…¥ÐÉ•ÍÁ½¹Í”¹Ñ•áÐ ¤ì(€€€€€½¹ÍÐ½¬€ôÉ•ÍÁ½¹Í”¹½¬€˜˜€½UÍ•Èµ…•¹ÐéqÌ©p¨½¤¹Ñ•ÍÐ¡Ñ•áÐ¤€˜˜€½M¥Ñ•µ…ÀéqÌ©qL¬½¤¹Ñ•ÍÐ¡Ñ•áÐ¤€˜˜€„½¥Í…±±½ÜéqÌ©p½qÌ¨½¥´¹Ñ•ÍÐ¡Ñ•áÐ¤ì(€€€€€É•ÑÕÉ¸ìÍÑ…ÑÕÌè½¬€ü€‰AMLˆ€è€‰%0ˆ°½‘”èÉ•ÍÁ½¹Í”¹ÍÑ…ÑÕÌ°‰½‘äèÑ•áÐ¹É•Á±…” ½¡ÑÑÁÌüép½p½myqÌ½t¬½¤°€‰m½É¥¥¹tˆ¤ôì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€É•ÑÕÉ¸ìÍÑ…ÑÕÌè€‰%0ˆ°É•…Í½¸èMÑÉ¥¹œ¡•ÉÉ½È¤ôì(€€€ô(€ô¤ ¤ì(€¥˜€¡É½‰½ÑÍI•ÍÕ±Ð¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è€‰É½‰½ÑÌ¹ÑáÐˆ°É•…Í½¸èÉ½‰½ÑÍI•ÍÕ±Ð¹É•…Í½¸ñð!QQ@€‘íÉ½‰½ÑÍI•ÍÕ±Ð¹½‘•õ€ô¤ì((€½¹ÍÐ‰…Í•±¥¹”€ô€…‰Õ‘•Ñ½¹™¥œ¹•™™•Ñ¥Ù”ì(€½¹ÍÐ•™™•Ñ¥Ù•	Õ‘•Ð€ô‰…Í•±¥¹”€ü•™™•Ñ¥Ù•	Õ‘•Ñ½È¡‰Õ‘•Ñ½¹™¥œ¹½¹™¥ÕÉ•°Á…•I•½É‘Ì¤€è‰Õ‘•Ñ½¹™¥œ¹•™™•Ñ¥Ù”ì(€½¹ÍÐ‰Õ‘•ÑI½ÝÍY…±Õ”€ô‰Õ‘•ÑI½ÝÌ¡Á…•I•½É‘Ì°•™™•Ñ¥Ù•	Õ‘•Ð°‰…Í•±¥¹”¤ì(€¥˜€ …‰…Í•±¥¹”¤ì(€€€™…¥±ÕÉ•Ì¹ÁÕÍ  ¸¸¹‰Õ‘•ÑI½ÝÍY…±Õ”¹™¥±Ñ•È ¡É½Ü¤€ôøÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤¹µ…À ¡É½Ü¤€ôø€¡ìÍÑ…ÑÕÌè€‰%0ˆ°Í½Á”è‰Õ‘•Ð¼‘íÉ½Ü¹Á…•ô¼‘íÉ½Ü¹Ù¥•ÝÁ½ÉÑô¼‘íÉ½Ü¹µ•ÑÉ¥õ€°É•…Í½¸è€‘íÉ½Ü¹…ÑÕ…±ô€ø€‘íÉ½Ü¹‰Õ‘•Ñ÷¾ò ‘ì¡9Õµ‰•È¡É½Ü¹É…Ñ¥¼¤€¨€ÄÀÀ¤¹Ñ½¥á• Ä¥ô—¾ò%€°µ•ÑÉ¥ŒèÉ½Ü¹µ•ÑÉ¥Œô¤¤¤ì(€€€™…¥±ÕÉ•Ì¹ÁÕÍ  ¸¸¹‰Õ‘•ÑI½ÝÍY…±Õ”¹™¥±Ñ•È ¡É½Ü¤€ôøÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤¹µ…À ¡É½Ü¤€ôø€¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”è‰Õ‘•Ð¼‘íÉ½Ü¹Á…•ô¼‘íÉ½Ü¹Ù¥•ÝÁ½ÉÑô¼‘íÉ½Ü¹µ•ÑÉ¥õ€°É•…Í½¸è€‘íÉ½Ü¹…ÑÕ…±ô€ø€‘íÉ½Ü¹‰Õ‘•Ñ÷¾ò#¢¶›š"K¾ò%€°µ•ÑÉ¥ŒèÉ½Ü¹µ•ÑÉ¥Œô¤¤¤ì(€ô(€…Ý…¥Ð•¹ÍÕÉ•¥È¡!%MQ=Ie}I==P¤ì(€¥˜€¡‰…Í•±¥¹”¤…Ý…¥ÐÝÉ¥Ñ•)Í½¸¡‰Õ‘•Ñ½¹™¥œ¹•™™•Ñ¥Ù•¥±”°•™™•Ñ¥Ù•	Õ‘•Ð¤ì((€½¹ÍÐ¥µ…•Y½±Õµ”€ô…Ý…¥Ð±½…‘%µ…•Y½±Õµ•I•Á½ÉÐ ¤ì(€¥µ…•Y½±Õµ”¹Á…•Ì€ôÁ…•%µ…•Y½±Õµ”¡Á…•I•½É‘Ì¤ì(€¥˜€¡¥µ…•Y½±Õµ”¹ÍÑ…ÑÕÌ€ôôô€‰]I8ˆ¤ì(€€€™…¥±ÕÉ•Ì¹ÁÕÍ ¡ìÍÑ…ÑÕÌè€‰]I8ˆ°Í½Á”è€‰¥µ…•Ìˆ°É•…Í½¸èƒ–nûž&šÒûžRš*—–F+–¶c–r €‘í¥µ…•Y½±Õµ”¹½Ù•ÉQ¡É•Í¡½±ü¹±•¹Ñ ñð€Áôƒ¦†ç¢Úš‚š"X€‘í¥µ…•Y½±Õµ”¹…‰…¹‘½¹•ü¹±•¹Ñ ñð€Áôƒ¦†ç¢Ò’òc–2[šRû–ò€ô¤ì(€ô((€½¹ÍÐÉ…Ü€ôì(€€€±…‰•°°(€€€É•Á½ÉÑ%°(€€€•¹•É…Ñ•‘Ðè¹½Ý%Í¼ ¤°(€€€‰…Í•UÉ°èÍ…¹¥Ñ¥é•=É¥¥¸¡‰…Í•UÉ°¤°(€€€¥Ð°(€€€•¹Øèì¹½‘”èÁÉ½•ÍÌ¹Ù•ÉÍ¥½¸°Á±…Ñ™½É´èÁÉ½•ÍÌ¹Á±…Ñ™½É´°…É èÁÉ½•ÍÌ¹…É °¤è	½½±•…¸¡ÁÉ½•ÍÌ¹•¹Ø¹$¤°Í•¹…É¥¼èÍ•¹…É¥½9…µ”°Ù¥•ÝÁ½ÉÑ5½‘•Ìèµ½‘•Ìô°(€€€Á…•I•½É‘Ì°(€€€±¥¡Ñ¡½ÕÍ•IÕ¹Ì°(€€€Í¡•µ„è½µ‰¥¹•‘M¡•µ„°(€€€Í¥Ñ•µ…ÀèÍ¥Ñ•µ…ÁI•ÍÕ±Ð°(€€€É½‰½ÑÌèÉ½‰½ÑÍI•ÍÕ±Ð°(€€€¥µ…•Y½±Õµ”°(€€€‰Õ‘•Ðèì‰…Í•±¥¹”°½¹™¥ÕÉ•è‰Õ‘•Ñ½¹™¥œ¹½¹™¥ÕÉ•°•™™•Ñ¥Ù”è•™™•Ñ¥Ù•	Õ‘•Ð°É½ÝÌè‰Õ‘•ÑI½ÝÍY…±Õ”ô°(€€€™…¥±ÕÉ•Ì°(€ôì(€…Ý…¥ÐÝÉ¥Ñ•)Í½¸¡©½¥¸¡É•Á½ÉÑ¥È°€‰É…Ü¹©Í½¸ˆ¤°Í…¹¥Ñ¥é•I•Á½ÉÑY…±Õ”¡É…Ü¤¤ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰µ•ÑÉ¥Ì¹ÍØˆ¤°Ñ½ÍØ¡µ•ÑÉ¥I½ÝÌ¡Á…•I•½É‘Ì¤°l‰Á…”ˆ°€‰Ù¥•ÝÁ½ÉÐˆ°€‰Í•¹…É¥¼ˆ°€‰µ•ÑÉ¥Œˆ°€‰Ù…±Õ”‰t¤¤ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰É•Í½ÕÉ•Ì¹ÍØˆ¤°Ñ½ÍØ¡É•Í½ÕÉ•I½ÝÌ¡Á…•I•½É‘Ì¤°l‰Á…”ˆ°€‰Ù¥•ÝÁ½ÉÐˆ°€‰Í•¹…É¥¼ˆ°€‰ÕÉ°ˆ°€‰ÑåÁ”ˆ°€‰…Ñ•½Éäˆ°€‰ÑÉ…¹Í™•É-ˆ°€‰ÍÑ…ÑÕÌˆ°€‰™¥ÉÍÑMÉ••¸ˆ°€‰Ñ¡¥É‘A…ÉÑäˆ°€‰…¡•!¥Ð‰t¤¤ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰‰Õ‘•Ð¹ÍØˆ¤°Ñ½ÍØ¡‰Õ‘•ÑI½ÝÍY…±Õ”°l‰Á…”ˆ°€‰Ù¥•ÝÁ½ÉÐˆ°€‰Í•¹…É¥¼ˆ°€‰µ•ÑÉ¥Œˆ°€‰‰Õ‘•Ðˆ°€‰…ÑÕ…°ˆ°€‰‘¥™™•É•¹”ˆ°€‰É…Ñ¥¼ˆ°€‰ÍÑ…ÑÕÌ‰t¤¤ì(€½¹ÍÐÍ¡•µ…I½ÝÌ€ô½µ‰¥¹•‘M¡•µ„¹Á…•Ì¹™±…Ñ5…À ¡¥Ñ•´¤€ôø€¡¥Ñ•´¹¥ÍÍÕ•Ìñðmt¤¹µ…À ¡¥ÍÍÕ”¤€ôø€¡ìÁ…”èÉ•‘…ÑUÉ°¡¥Ñ•´¹Á…•UÉ°¤°ÑåÁ”è¥ÍÍÕ”¹ÑåÁ”°Á…Ñ è¥ÍÍÕ”¹Á…Ñ °ÍÑ…ÑÕÌè¥ÍÍÕ”¹ÍÑ…ÑÕÌ°µ•ÍÍ…”èÍ…¹¥Ñ¥é•I•Á½ÉÑY…±Õ”¡¥ÍÍÕ”¹µ•ÍÍ…”ñð€ˆˆ¤°Ù…±Õ”èÍ…¹¥Ñ¥é•I•Á½ÉÑY…±Õ”¡¥ÍÍÕ”¹Ù…±Õ”ñð€ˆˆ¤°•áÁ•Ñ•èÍ…¹¥Ñ¥é•I•Á½ÉÑY…±Õ”¡¥ÍÍÕ”¹•áÁ•Ñ•ñð€ˆˆ¤ô¤¤¤ì(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰Í¡•µ„µÉ•ÍÕ±ÑÌ¹ÍØˆ¤°Ñ½ÍØ¡Í¡•µ…I½ÝÌ°l‰Á…”ˆ°€‰ÑåÁ”ˆ°€‰Á…Ñ ˆ°€‰ÍÑ…ÑÕÌˆ°€‰µ•ÍÍ…”ˆ°€‰Ù…±Õ”ˆ°€‰•áÁ•Ñ•‰t¤¤ì(€…Ý…¥ÐÝÉ¥Ñ•)Í½¸¡©½¥¸¡É•Á½ÉÑ¥È°€‰•¹Ø¹©Í½¸ˆ¤°É…Ü¹•¹Ø¤ì(€…Ý…¥ÐÝÉ¥Ñ•I•ÁÉ¼¡É•Á½ÉÑ¥È°±…‰•°°‰…Í•UÉ°¤ì(€¥˜€¡™…¥±ÕÉ•Ì¹Í½µ” ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤¤ì(€€€…Ý…¥ÐÝÉ¥Ñ•)Í½¸¡©½¥¸¡É•Á½ÉÑ¥È°€‰™…¥±ÕÉ•Ì¹©Í½¸ˆ¤°™…¥±ÕÉ•Ì¹™¥±Ñ•È ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤¤ì(€€€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰™…¥±ÕÉ•Ì¹ÍØˆ¤°Ñ½ÍØ¡™…¥±ÕÉ•Ì¹™¥±Ñ•È ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤°l‰ÍÑ…ÑÕÌˆ°€‰Í½Á”ˆ°€‰É•…Í½¸ˆ°€‰µ•ÑÉ¥Œ‰t¤¤ì(€ô(€…Ý…¥ÐÝÉ¥Ñ•Q•áÐ¡©½¥¸¡É•Á½ÉÑ¥È°€‰É•Á½ÉÐ¹µˆ¤°µ…É­‘½Ý¹I•Á½ÉÐ¡ì±…‰•°°‰…Í•UÉ°°¥Ð°Á…•I•½É‘Ì°±¥¡Ñ¡½ÕÍ•IÕ¹Ì°Í¡•µ…I•ÍÕ±ÑÌè½µ‰¥¹•‘M¡•µ„°Í¥Ñ•µ…ÁI•ÍÕ±Ð°É½‰½ÑÍI•ÍÕ±Ð°‰Õ‘•ÑI½ÝÍY…±Õ”°¥µ…•Y½±Õµ”°É•Á½ÉÑ¥È°™…¥±ÕÉ•Ìô¤¤ì(€½¹ÍÐ½µÁ…É”€ô…Ý…¥Ð½µÁ…É•I•Á½ÉÑÌ¡É•Á½ÉÑ¥È°…ÉÌ¹½µÁ…É”°ì±…‰•°°Á…•I•½É‘Ìô¤ì(€…Ý…¥Ð…ÁÁ•¹‘!¥ÍÑ½Éä¡Á…•I•½É‘Ì°‰Õ‘•ÑI½ÝÍY…±Õ”°É•Á½ÉÑ%°¥Ð¤ì(€½¹ÍÐ…±±É••¸€ô€…™…¥±ÕÉ•Ì¹Í½µ” ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤€˜˜‰Õ‘•ÑI½ÝÍY…±Õ”¹•Ù•Éä ¡É½Ü¤€ôøÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰AMLˆñðÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰M-%@ˆñðÉ½Ü¹ÍÑ…ÑÕÌ€ôôô€‰	M1%9ˆ¤ì(€¥˜€¡…±±É••¸€˜˜€…‰…Í•±¥¹”¤…Ý…¥ÐÝÉ¥Ñ•)Í½¸¡©½¥¸¡!%MQ=Ie}I==P°€‰±…ÍÐµÁ…ÍÍ¥¹œ¹©Í½¸ˆ¤°ìÉ•Á½ÉÑ%°½µµ¥Ðè¥Ð¹™Õ±±½µµ¥Ð°Ñ¥µ•ÍÑ…µÀè¹½Ý%Í¼ ¤°Í¹…ÁÍ¡½Ñ%èÁÉ½•ÍÌ¹•¹Ø¹=AQ}M9AM!=Q}%ñð€ˆˆô¤ì(€½¹Í½±”¹±½œ¡)M=8¹ÍÑÉ¥¹¥™ä¡ìÉ•Á½ÉÑ¥È°ÍÑ…ÑÕÌè™…¥±ÕÉ•Ì¹Í½µ” ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤€ü€‰%0ˆ€è‰…Í•±¥¹”€ü€‰	M1%9ˆ€è€‰AMLˆ°½µÁ…É”è½µÁ…É”ü¹ÍÑ…ÑÕÌñð€‰M-%@ˆ°™…¥±ÕÉ•Ìè™…¥±ÕÉ•Ì¹±•¹Ñ ô°¹Õ±°°€È¤¤ì(€¥˜€¡™…¥±ÕÉ•Ì¹Í½µ” ¡™…¥±ÕÉ”¤€ôø™…¥±ÕÉ”¹ÍÑ…ÑÕÌ€ôôô€‰%0ˆ¤¤ÁÉ½•ÍÌ¹•á¥Ñ½‘”€ô€Äì)ô()…Ý…¥Ðµ…¥¸ ¤ì