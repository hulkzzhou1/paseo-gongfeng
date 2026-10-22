import { z } from "zod";

// Existing unscoped installations belong to this origin.
export const legacySite = "https://git.woa.com";
export const siteUrlSchema = z.string().trim().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return !/[\\\s]/.test(value) && url.protocol === "https:" && !!url.hostname && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}, "请输入 HTTPS 工蜂站点根地址，不含路径、账号或查询参数").transform(value => new URL(value).origin);

export const siteReference = { siteUrl: siteUrlSchema.optional() };
export const storedInstance = (siteUrl: string) => siteUrl === legacySite ? "git.woa.com" : siteUrl;
