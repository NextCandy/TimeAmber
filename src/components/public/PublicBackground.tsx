import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { safePublicHref, type PublicSiteConfig } from "@/lib/public-site-settings";
import { PublicLeafDecor } from "@/components/public/PublicLeafDecor";

type BackgroundStyle = CSSProperties & {
  "--page-overlay-opacity"?: number;
  "--glass-blur"?: string;
  "--glass-card-opacity"?: number;
};

function cssUrl(value: string) {
  const safeValue = safePublicHref(value);
  if (!safeValue) return undefined;
  return `url("${safeValue.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll(")", "%29").replaceAll("(", "%28")}")`;
}

function gradient(colors: string[]) {
  return `linear-gradient(135deg, ${colors.join(", ")})`;
}

function BackgroundStatus({ config }: { config: PublicSiteConfig }) {
  if (!config.statusMessages.enabled || config.statusMessages.messages.length === 0) return null;
  const messages = config.statusMessages.messages.slice(
    0,
    config.statusMessages.density === "low" ? 4 : 7,
  );
  return (
    <div
      className={`public-background__status public-background__status--${config.statusMessages.animationSpeed}`}
      aria-hidden="true"
    >
      {messages.map((message, index) => (
        <span key={`${message}-${index}`} style={{ "--status-index": index } as CSSProperties}>
          {message}
        </span>
      ))}
    </div>
  );
}

export function PublicBackground({ config }: { config: PublicSiteConfig }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const lightImages = config.appearance.lightBackgroundImages
    .map((value) => safePublicHref(value))
    .filter((value): value is string => !!value);
  const darkImages = config.appearance.darkBackgroundImages
    .map((value) => safePublicHref(value))
    .filter((value): value is string => !!value);
  const hasImages =
    config.appearance.backgroundMode === "image" &&
    (lightImages.length > 0 || darkImages.length > 0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      !config.appearance.autoRotate ||
      Math.max(lightImages.length, darkImages.length) < 2
    )
      return;
    const timer = window.setInterval(
      () => setActiveIndex((current) => current + 1),
      config.appearance.backgroundIntervalSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [config.appearance, darkImages.length, lightImages.length, reducedMotion]);

  const lightImage = lightImages.length ? lightImages[activeIndex % lightImages.length] : undefined;
  const darkImage = darkImages.length ? darkImages[activeIndex % darkImages.length] : undefined;
  const style = useMemo<BackgroundStyle>(
    () => ({
      "--page-overlay-opacity": config.appearance.backgroundOverlayOpacity,
      "--glass-blur": `${config.appearance.glassBlurStrength}px`,
      "--glass-card-opacity": config.appearance.cardOpacity,
    }),
    [config.appearance],
  );

  return (
    <>
      <div className="public-background" aria-hidden="true" style={style}>
        <div
          className="public-background__base public-background__base--light"
          style={{
            backgroundImage:
              hasImages && lightImage
                ? cssUrl(lightImage)
                : gradient(config.appearance.lightGradientColors),
          }}
        />
        <div
          className="public-background__base public-background__base--dark"
          style={{
            backgroundImage:
              hasImages && darkImage
                ? cssUrl(darkImage)
                : gradient(config.appearance.darkGradientColors),
          }}
        />
        <div className="public-background__overlay" />
        <div className="public-background__grain" />
        <BackgroundStatus config={config} />
      </div>
      <PublicLeafDecor />
    </>
  );
}
