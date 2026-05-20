export const BRAND_ASSET_LIGHT_URL = "/timeamber-icon.png";
export const BRAND_ASSET_DARK_URL = "/timeamber-icon.png";
export const BRAND_ASSET_URL = BRAND_ASSET_LIGHT_URL;

export function getBrandAssetForTheme(theme?: string | null): string {
  return theme === "dark" ? BRAND_ASSET_DARK_URL : BRAND_ASSET_LIGHT_URL;
}
