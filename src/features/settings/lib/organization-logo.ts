function logoCacheVersion(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Whether the stored logo value can be shown in an `<img>`. */
export function isDisplayableLogoUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("http://") || url.startsWith("https://")) return true;
  if (url.startsWith("/api/organization/logo")) return true;
  return false;
}

/**
 * Resolves a logo URL for display. Data URLs are served via the API route
 * so uploads persist on ephemeral filesystems (e.g. Railway).
 */
export function organizationLogoSrc(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) {
    return `/api/organization/logo?v=${logoCacheVersion(url)}`;
  }
  if (url.startsWith("/uploads/")) {
    return `/api/organization/logo?v=legacy`;
  }
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/api/organization/logo")
  ) {
    return url;
  }
  return null;
}
