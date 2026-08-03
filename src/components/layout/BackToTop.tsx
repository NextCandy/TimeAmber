import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 回到顶部。
 *
 * 位置避开了文章页右下角 —— 那儿没有别的常驻元素，但 /cdn/ 剪藏页的返回胶囊
 * 也在右下，两者不会同时出现（剪藏页不走 React），所以可以共用这个角。
 * 滚动监听用 passive，滚动过程中不阻塞合成线程。
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toTop() {
    // 跟随系统的「减少动态效果」：html 上有 scroll-behavior:smooth，
    // 这里显式传 behavior 覆盖它，否则设置了减少动效的用户仍会看到长距离滑动。
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="回到顶部"
      title="回到顶部"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`press-feedback fixed right-5 bottom-5 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur transition-all duration-[var(--duration-hover)] hover:border-accent-amber/60 hover:text-accent-amber focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:outline-none ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
