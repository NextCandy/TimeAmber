/**
 * 剪藏类文章正文地址的打开方式。
 *
 * VS.DO 那批文章的 external_url 是**站内**相对路径（/cdn/vsdo-html/<n>/index.html，
 * 由 server/node.mjs 从 MEDIA_ROOT 直出），不是外部网站。站内地址开新标签只会
 * 让读者以为「点了没反应」，还断了浏览器后退返回列表的路径 —— 所以同页跳转。
 * 只有真外链（http/https 开头）才另开标签。
 *
 * 数据库里 open_in 目前一律是 _blank，那是导入时的默认值，不代表真实意图，
 * 因此这里以地址形态为准。
 */
export function isExternalHref(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** `<a target>` 的取值：站内同页，外链新标签。 */
export function linkTarget(url: string): "_self" | "_blank" {
  return isExternalHref(url) ? "_blank" : "_self";
}

/** 只有另开标签时才需要 noopener noreferrer。 */
export function linkRel(url: string): string | undefined {
  return isExternalHref(url) ? "noopener noreferrer" : undefined;
}
