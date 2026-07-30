/**
 * 剪藏快照外壳。
 *
 * /cdn/ 下是各站原样保存的离线 HTML，由 node.mjs 在 React 之前直接静态伺服 ——
 * 读者点进来看到的是别人网站的完整界面（侧边栏、顶栏、头像全在），没有任何本站
 * 痕迹，也无从知道这是哪天存的、原文在哪。这里给这类响应插一条标注条。
 *
 * 两个硬约束决定了实现方式：
 *   1. 单文件常有十几 MB（图片全部内联成 base64），**不能读进内存再做字符串
 *      替换** —— 只扫描头部找到 <body …> 的结束位置，把外壳拼进去，剩下的部分
 *      照旧走文件流。实测 <body> 在 49 KB 处，256 KB 的扫描窗口留足了余量。
 *   2. 外壳落在别人的 CSS 环境里，所以根元素 all:initial 起手、每条属性都带
 *      !important，否则会被原站样式吃掉。配色写死（深底+琥珀），不跟随原站，
 *      因为原站背景色什么都可能是。
 *
 * 剪藏时间与原文地址取自快照旁边的 <文件名>.timeamber-meta.json（archive-sync
 * 写入，现有快照全覆盖），不必回查数据库 —— 静态伺服这条路径上没有 DB 连接。
 */
import { createReadStream } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { Readable } from "node:stream";

const META_SUFFIX = ".timeamber-meta.json";
const HEAD_SCAN_BYTES = 256 * 1024;

// 603 份快照的 meta 全加起来也才 100 KB 出头，但仍给个上限防止目录无限增长。
const metaCache = new Map();
const META_CACHE_MAX = 800;

/** 只有 /cdn/ 下的 .html 需要套壳，图片、CSS 等附属资源原样放行。 */
export function isClipHtml(pathname) {
  return /\.html?$/i.test(pathname);
}

function rememberMeta(key, value) {
  if (metaCache.size >= META_CACHE_MAX) {
    // 简单淘汰：Map 迭代顺序即插入顺序，删最早的一条。
    const oldest = metaCache.keys().next().value;
    if (oldest !== undefined) metaCache.delete(oldest);
  }
  metaCache.set(key, value);
  return value;
}

async function loadMeta(target) {
  if (metaCache.has(target)) return metaCache.get(target);
  try {
    const raw = await readFile(`${target}${META_SUFFIX}`, "utf8");
    const parsed = JSON.parse(raw);
    return rememberMeta(target, {
      pageUrl: parsed?.customMetadata?.pageUrl || "",
      source: parsed?.customMetadata?.source || "",
      uploaded: parsed?.uploaded || "",
    });
  } catch {
    // 没有 meta 也照样套壳，只是少了时间与原文入口。
    return rememberMeta(target, { pageUrl: "", source: "", uploaded: "" });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 站内其余地方的日期都按上海时区渲染，这里保持一致。 */
function formatClipDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 原文域名，给"查看原文"补一个可读的来源提示。 */
function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const SHELL_CSS = `
.ta-clip-shell,.ta-clip-shell *{all:initial!important;box-sizing:border-box!important;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif!important}
.ta-clip-shell{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:8px 14px!important;padding:10px 18px!important;background:#13120e!important;color:#ecebe7!important;font-size:13px!important;line-height:1.5!important;border-bottom:2px solid #e3a860!important;position:relative!important;z-index:2147483646!important;width:100%!important}
.ta-clip-shell a{cursor:pointer!important;text-decoration:none!important}
.ta-clip-brand{display:inline-flex!important;align-items:center!important;gap:7px!important;color:#ecebe7!important;font-weight:600!important;font-size:13px!important}
.ta-clip-brand img{display:block!important;width:20px!important;height:20px!important;object-fit:contain!important}
.ta-clip-meta{color:#a9a69c!important;font-size:12px!important}
.ta-clip-origin{color:#e3a860!important;font-size:12px!important;border-bottom:1px solid rgba(227,168,96,.45)!important;padding-bottom:1px!important}
.ta-clip-note{color:#6f6c64!important;font-size:11px!important;margin-left:auto!important}
.ta-clip-back{position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;display:inline-flex!important;align-items:center!important;gap:6px!important;padding:9px 14px!important;background:#13120e!important;color:#ecebe7!important;font-size:12px!important;font-weight:600!important;line-height:1!important;border:1px solid #e3a860!important;border-radius:999px!important;box-shadow:0 6px 20px rgba(0,0,0,.35)!important;text-decoration:none!important;cursor:pointer!important;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif!important}
@media print{.ta-clip-shell,.ta-clip-back{display:none!important}}
`.replace(/\n/g, "");

// 出站链接改 target/rel 需要遍历整篇文档，服务端做等于要处理十几 MB 正文；
// 交给客户端在 DOMContentLoaded 之后跑一遍，服务端零开销。原站若带 CSP
// 挡掉内联脚本，静态外壳照常显示，只是少了这一层，属于可接受的降级。
const SHELL_JS = `(function(){try{var h=location.host;var f=function(){var a=document.getElementsByTagName("a");for(var i=0;i<a.length;i++){var el=a[i];if(el.host&&el.host!==h&&/^https?:$/.test(el.protocol)&&!el.getAttribute("data-ta-skip")){el.target="_blank";el.rel="noopener noreferrer";}}};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",f);}else{f();}}catch(e){}})();`;

function buildShell(meta) {
  const date = formatClipDate(meta.uploaded);
  const host = hostOf(meta.pageUrl);

  const metaText = date ? `剪藏存档 · ${escapeHtml(date)} 保存` : "剪藏存档";
  const origin = meta.pageUrl
    ? `<a class="ta-clip-origin" href="${escapeHtml(meta.pageUrl)}" target="_blank" rel="noopener noreferrer" data-ta-skip="1">查看原文${host ? ` · ${escapeHtml(host)}` : ""} ↗</a>`
    : "";

  const html =
    `<style>${SHELL_CSS}</style>` +
    `<div class="ta-clip-shell" role="complementary" aria-label="TimeAmber 剪藏说明">` +
    `<a class="ta-clip-brand" href="/" data-ta-skip="1"><img src="/brand/icon-512.png" alt="">TimeAmber</a>` +
    `<span class="ta-clip-meta">${metaText}</span>` +
    origin +
    `<span class="ta-clip-note">本页为原站快照，样式与内容保持原样未作改动</span>` +
    `</div>` +
    `<a class="ta-clip-back" href="/" data-ta-skip="1">← 返回 TimeAmber</a>` +
    `<script>${SHELL_JS}</script>`;

  return Buffer.from(html, "utf8");
}

async function readHead(target, size) {
  const handle = await open(target, "r");
  try {
    const buf = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buf, 0, size, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** 返回 <body …> 结束标记之后的字节偏移；找不到就返回 -1，交给调用方原样放行。 */
function findBodyInsertPos(head) {
  const text = head.toString("latin1"); // 只用来定位 ASCII 标记，不做解码
  const match = /<body\b[^>]*>/i.exec(text);
  if (!match) return -1;
  return match.index + match[0].length;
}

/**
 * 给剪藏 HTML 套壳。返回 Response；任何一步不成立都返回 null，
 * 调用方回退到原来的静态文件响应。
 */
export async function clipShellResponse(target, info, contentType) {
  try {
    const head = await readHead(target, Math.min(HEAD_SCAN_BYTES, info.size));
    const insertPos = findBodyInsertPos(head);
    if (insertPos < 0) return null;

    const shell = buildShell(await loadMeta(target));
    const stream = Readable.from(
      (async function* () {
        yield head.subarray(0, insertPos);
        yield shell;
        if (insertPos < info.size) {
          yield* createReadStream(target, { start: insertPos });
        }
      })(),
    );

    return new Response(Readable.toWeb(stream), {
      headers: new Headers({
        "content-type": contentType,
        "content-length": String(info.size + shell.length),
        // 外壳会随代码更新，快照本身也可能被 archive-sync 覆盖重写，
        // 所以这条不能跟着别的媒体资源走 immutable。
        "cache-control": "public, max-age=300",
      }),
    });
  } catch {
    return null;
  }
}
