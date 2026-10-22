// Avatar requests never carry the OpenAPI token; ignore URLs containing credentials or query data.
export function avatarUrl(value: unknown, siteUrl: string): string | null {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\\\s]/.test(value)) return null;
  try {
    const site = new URL(siteUrl);
    const url = new URL(value.startsWith(`${site.host}/`) ? `https://${value}` : value, site);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
