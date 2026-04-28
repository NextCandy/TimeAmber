export const BRAND_ASSET_LIGHT_URL = "https://i.see.you/2026/04/28/jN4b/TimeAmberPNG.png";
export const BRAND_ASSET_DARK_URL = "https://i.see.you/2026/04/28/o9fC/TimeAmberPNG-Dark.png";
export const BRAND_ASSET_URL = BRAND_ASSET_LIGHT_URL;

export function getBrandAssetForTheme(theme?: string | null): string {
  return theme === "dark" ? BRAND_ASSET_DARK_URL : BRAND_ASSET_LIGHT_URL;
}
