import type { ImgHTMLAttributes } from "react";

export const RESPONSIVE_IMAGE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

function managedImagePath(source: string): { prefix: string; objectPath: string } | null {
  try {
    const url = new URL(source, "https://timeamber.com");
    const marker = "/supabase/storage/v1/object/public/media/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    return { prefix: url.pathname.slice(0, index + marker.length), objectPath: url.pathname.slice(index + marker.length) };
  } catch {
    return null;
  }
}

export function responsiveVariantUrl(source: string, format: "avif" | "webp", width: number): string | null {
  const managed = managedImagePath(source);
  if (!managed) return null;
  return `${managed.prefix}variants/${managed.objectPath}.w${width}.${format}`;
}

export function responsiveSrcSet(source: string, format: "avif" | "webp"): string | null {
  if (!managedImagePath(source)) return null;
  return RESPONSIVE_IMAGE_WIDTHS.map((width) => `${responsiveVariantUrl(source, format, width)} ${width}w`).join(", ");
}

type ResponsiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet" | "sizes"> & {
  src: string;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
};

/** AVIF → WebP → 原图的渐进式回退；未纳入本站媒体存储的外链保持原始 img。 */
export function ResponsiveImage({ src, alt, width, height, sizes = "100vw", className, ...props }: ResponsiveImageProps) {
  const avif = responsiveSrcSet(src, "avif");
  const webp = responsiveSrcSet(src, "webp");
  const image = (
    <img
      {...props}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={avif ? sizes : undefined}
      className={className}
    />
  );
  if (!avif || !webp) return image;
  return (
    <picture className="block h-full w-full">
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      <source type="image/webp" srcSet={webp} sizes={sizes} />
      {image}
    </picture>
  );
}
