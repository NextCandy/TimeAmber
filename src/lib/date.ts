const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** 固定按站点时区（Asia/Shanghai）输出，避免 SSR 与浏览器水合日期不一致。 */
export function formatDateKey(iso: string) {
  const parts = shanghaiDateParts(iso);
  if (!parts) return iso.slice(0, 10);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatChineseDate(iso: string) {
  const parts = shanghaiDateParts(iso);
  if (!parts) return iso;
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
}
