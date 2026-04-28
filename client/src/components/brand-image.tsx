import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { getBrandAssetForTheme } from "@/lib/brand";

type BrandImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

function getCurrentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function BrandImage({ alt = "", ...props }: BrandImageProps) {
  const [theme, setTheme] = useState<"dark" | "light">(() => getCurrentTheme());

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(getCurrentTheme());
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return <img src={getBrandAssetForTheme(theme)} alt={alt} {...props} />;
}
