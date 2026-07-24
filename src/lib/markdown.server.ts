// 服务端 Markdown 渲染：GFM + 服务端 Shiki 语法高亮 + 无害化处理。
// 通过 *.server.ts 命名约定与客户端 bundle 隔离（Vite 强制），
// 因此 shiki 的异步高亮可以在服务端自然运行，浏览器端零高亮开销。
import type { Element, Root } from "hast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { slugify } from "@/lib/slugify";

// 放行任务列表的复选框，其余沿用 rehype-sanitize 默认白名单（会中和 javascript: 等危险 URL）。
// clobberPrefix 置空：避免与 GFM 脚注自带的 user-content- 前缀叠加导致锚点错位。
const schema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
  attributes: {
    ...defaultSchema.attributes,
    input: ["type", "checked", "disabled"],
  },
};

function textOf(el: Element): string {
  let s = "";
  for (const child of el.children) {
    if (child.type === "text") s += child.value;
    else if (child.type === "element") s += textOf(child);
  }
  return s;
}

function eachElement(node: Root | Element, fn: (el: Element) => void) {
  for (const child of node.children) {
    if (child.type === "element") {
      fn(child);
      eachElement(child, fn);
    }
  }
}

// 标题 id 复用 slugify，保证与目录（TOC）锚点一致。
// 放在 sanitize 之后执行，id 不会被 clobber 前缀污染。
function rehypeHeadingIds() {
  return (tree: Root) => {
    eachElement(tree, (el) => {
      if (/^h[1-6]$/.test(el.tagName)) {
        el.properties = el.properties ?? {};
        el.properties.id = slugify(textOf(el));
      }
    });
  };
}

// 图片：原生懒加载 + 异步解码（宽度自适应与点击放大在前端处理）。
function rehypeLazyImages() {
  return (tree: Root) => {
    eachElement(tree, (el) => {
      if (el.tagName === "img") {
        el.properties = { loading: "lazy", decoding: "async", ...el.properties };
      }
    });
  };
}

// hast 规范用 className，但 @shikijs/rehype 写的是 class（pre 上是字符串、code 上是数组），
// 两个键、两种形态都要认，否则语言标签一律退化成 TEXT。
function classNamesOf(el: Element | undefined): string {
  const props = el?.properties;
  if (!props) return "";
  const parts: string[] = [];
  for (const key of ["className", "class"] as const) {
    const raw = props[key];
    if (Array.isArray(raw)) parts.push(raw.join(" "));
    else if (typeof raw === "string") parts.push(raw);
  }
  return parts.join(" ");
}

// 代码块外框：把每个 <pre> 包进 .code-block，并直出语言标签与复制按钮。
//
// 这一步刻意放在服务端而不是客户端 useEffect：正文是 dangerouslySetInnerHTML 注入的，
// React 任何一次重新提交该节点都会重设 innerHTML、抹掉客户端插入的 DOM。
// 结构由 HTML 自带就不存在这个时序问题，客户端只需用事件委托绑定复制行为。
// 必须排在 sanitize 之后，否则 button 会被白名单过滤掉。
// @shikijs/rehype 把高亮结果作为一个**嵌套的 root 片段**插回父节点，官方 hast 类型里
// 没有这种形态（Root.children 是 RootContent[]，不含 Root），所以遍历时放宽到结构类型，
// 并且必须同时下钻 root —— 只认 element 会把整个代码块跳过去。
type Walkable = { type: string; tagName?: string; children?: Walkable[] };

function rehypeCodeChrome() {
  return (tree: Root) => {
    const walk = (node: Walkable) => {
      const children = node.children;
      if (!children) return;

      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child.type === "root") {
          walk(child);
          continue;
        }
        if (child.type !== "element") continue;

        if (child.tagName === "pre") {
          const pre = child as unknown as Element;
          const code = pre.children.find(
            (c): c is Element => c.type === "element" && c.tagName === "code",
          );
          const cls = `${classNamesOf(code)} ${classNamesOf(pre)}`;
          const lang = (cls.match(/language-([\w-]+)/)?.[1] ?? "text").toUpperCase();

          const wrapped: Element = {
            type: "element",
            tagName: "div",
            properties: { className: ["code-block"] },
            children: [
              {
                type: "element",
                tagName: "div",
                properties: { className: ["code-head"] },
                children: [
                  {
                    type: "element",
                    tagName: "span",
                    properties: { className: ["code-lang"] },
                    children: [{ type: "text", value: lang }],
                  },
                  {
                    type: "element",
                    tagName: "button",
                    properties: { type: "button", className: ["code-copy"] },
                    children: [{ type: "text", value: "复制" }],
                  },
                ],
              },
              pre,
            ],
          };
          children[i] = wrapped as unknown as Walkable;
          continue; // <pre> 内部无需再遍历
        }

        walk(child);
      }
    };
    walk(tree);
  };
}

// 渲染前的内容预处理：
// 1) 统一换行为 LF —— 部分 Notion 内容是 CRLF，会让下面的空行匹配失效。
// 2) Notion 同步在每行之间插入空行，而 GFM 表格要求表头/分隔/数据行连续无空行，
//    否则每行会被当成独立段落、表格无法成形。去掉相邻表格行之间的空行即可恢复。
//    非表格内容不受影响。
function preprocessMarkdown(md: string): string {
  let out = md.replace(/\r\n?/g, "\n");
  let prev: string;
  do {
    prev = out;
    out = out.replace(/^([ \t]*\|.*\|[ \t]*)\n[ \t]*\n(?=[ \t]*\|)/gm, "$1\n");
  } while (out !== prev);
  return out;
}

function build() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, schema)
    .use(rehypeHeadingIds)
    .use(rehypeLazyImages)
    .use(rehypeShiki, {
      theme: "github-dark-dimmed",
      addLanguageClass: true,
      defaultLanguage: "text",
      fallbackLanguage: "text",
    })
    .use(rehypeCodeChrome)
    .use(rehypeStringify);
}

let processor: ReturnType<typeof build> | undefined;

// 简单 LRU：同一篇文章再次浏览时跳过重复高亮。
const cache = new Map<string, string>();
const CACHE_MAX = 256;

export async function renderMarkdown(markdown: string): Promise<string> {
  const md = markdown ?? "";
  if (!md.trim()) return "";

  const cached = cache.get(md);
  if (cached !== undefined) {
    // 命中后移到末尾（最近使用）。
    cache.delete(md);
    cache.set(md, cached);
    return cached;
  }

  processor ??= build();
  const html = String(await processor.process(preprocessMarkdown(md)));

  cache.set(md, html);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return html;
}
