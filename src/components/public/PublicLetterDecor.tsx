import { useEffect, useRef } from "react";

const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"];

/* ── 观感参数：数量、速度、浓淡都在这儿调 ────────────── */

/** 屏幕越宽给的字母越多；窄屏干脆不放，跟原先的落叶一个口径。 */
function countFor(width: number) {
  if (width < 768) return 0;
  if (width < 1100) return 28;
  if (width < 1600) return 48;
  return 72;
}

/** 下落速度（px/秒）：越「近」的越快，depth 在两者之间插值。 */
const FALL_MIN = 24;
const FALL_MAX = 72;

/** 不透明度区间：远处淡、近处实。 */
const ALPHA_MIN = 0.24;
const ALPHA_MAX = 0.72;

/** 字号区间（px）。 */
const SIZE_MIN = 12;
const SIZE_MAX = 38;

type Flake = {
  ch: string;
  x: number;
  y: number;
  depth: number;
  rot: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  drift: number;
  driftPhase: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * 飘落的字母。整块是纯装饰，canvas 不接鼠标事件。
 *
 * 没上 three.js —— 景深用字号和透明度分层来伪造，绕竖轴翻面用 scaleX(cos) 模拟，
 * 视觉上够用，代价却只有几 KB，手机和树莓派都扛得住。
 */
export function PublicLetterDecor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let raf = 0;
    let last = performance.now();
    // 颜色跟着明暗主题走，主题一变就重新取一次
    let ink = "rgba(60, 44, 32, 1)";

    const spawn = (seeded: boolean): Flake => ({
      ch: ALPHABET[(Math.random() * ALPHABET.length) | 0],
      x: Math.random() * width,
      y: seeded ? Math.random() * height : rand(-140, -20),
      depth: rand(0.35, 1),
      rot: rand(0, Math.PI * 2),
      spin: rand(-1, 1) * 0.65,
      flip: rand(0, Math.PI * 2),
      flipSpeed: rand(0.2, 0.75) * (Math.random() < 0.5 ? -1 : 1),
      drift: rand(-10, 10),
      driftPhase: rand(0, Math.PI * 2),
    });

    const readInk = () => {
      ink = getComputedStyle(canvas).color || ink;
    };

    const resize = () => {
      const prevW = width;
      const prevH = height;
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width);
      height = Math.round(rect.height);
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const want = countFor(width);
      if (flakes.length !== want) {
        flakes =
          want > flakes.length
            ? [...flakes, ...Array.from({ length: want - flakes.length }, () => spawn(true))]
            : flakes.slice(0, want);
      } else if (prevW > 1 && prevH > 1) {
        // 换了窗口大小，按比例把字母挪过去，免得都堆在一边
        for (const f of flakes) {
          f.x *= width / prevW;
          f.y *= height / prevH;
        }
      }
    };

    const draw = (flake: Flake) => {
      const size = SIZE_MIN + flake.depth * (SIZE_MAX - SIZE_MIN);
      const x = flake.x + Math.sin(flake.driftPhase) * flake.drift;
      ctx.save();
      ctx.translate(x, flake.y);
      ctx.rotate(flake.rot);
      // 转到侧面时收缩到接近 0，就是纸片翻面的样子
      ctx.scale(Math.cos(flake.flip), 1);
      ctx.globalAlpha = ALPHA_MIN + flake.depth * (ALPHA_MAX - ALPHA_MIN);
      ctx.font = `700 ${size}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(flake.ch, 0, 0);
      ctx.restore();
    };

    const renderStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;
      for (const f of flakes) draw(f);
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;
      for (const f of flakes) {
        f.y += (FALL_MIN + f.depth * (FALL_MAX - FALL_MIN)) * dt;
        f.rot += f.spin * dt;
        f.flip += f.flipSpeed * dt;
        f.driftPhase += dt * 0.35;
        if (f.y - 40 > height) Object.assign(f, spawn(false));
        draw(f);
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf || reduced.matches || !flakes.length) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onMotionChange = () => {
      stop();
      if (reduced.matches) renderStatic();
      else start();
    };
    // 切到别的标签页就别烧 CPU 了
    const onVisibility = () => (document.hidden ? stop() : onMotionChange());

    readInk();
    resize();
    onMotionChange();

    const ro = new ResizeObserver(() => {
      resize();
      // 首帧容器可能还没尺寸，那一次 flakes 是空的、start() 会直接返回；
      // 等尺寸到位补出 flakes 后，必须在这里把循环真正拉起来。
      if (reduced.matches) renderStatic();
      else start();
    });
    ro.observe(canvas);
    // 主题在 <html> 上切 class，换了就重新取墨色
    const themeObserver = new MutationObserver(() => {
      readInk();
      if (reduced.matches) renderStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    reduced.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      themeObserver.disconnect();
      reduced.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="public-background__letters" aria-hidden="true" />;
}
