export type ContentProvider = "legacy" | "strapi";

export function getContentProvider(): ContentProvider {
  return process.env.CONTENT_PROVIDER === "strapi" ? "strapi" : "legacy";
}

export function isStrapiProvider(): boolean {
  return getContentProvider() === "strapi";
}
