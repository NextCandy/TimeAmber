import { useEffect, useRef } from "react";

/**
 * 进入视口时淡入上移。
 *
 * 刻意不在 SSR 阶段输出隐藏状态：服务端渲染出来的内容默认可见，
 * 挂载后才由 JS 决定要不要先藏起来。这样无 JS 环境（以及爬虫）看到的是完整内容，
 * 也不会让首屏元素先显示再闪一下 —— 只有还在视口下方的元素才会被设为待揭示。
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof IntersectionObserver === "undefined") return;

    // 已经在视口内（或在其上方）的元素直接保持可见，避免首屏闪烁。
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.dataset.reveal = "shown";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
