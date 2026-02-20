function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return stripTrailingSlash(value);
}

export function getStrapiInternalUrl(): string {
  return ensureUrl(
    process.env.STRAPI_INTERNAL_URL || process.env.CMS_URL || process.env.NEXT_PUBLIC_STRAPI_URL,
    "http://localhost:1337"
  );
}

export function getStrapiPublicUrl(): string {
  return ensureUrl(
    process.env.NEXT_PUBLIC_STRAPI_URL || process.env.STRAPI_PUBLIC_URL || process.env.STRAPI_INTERNAL_URL,
    "http://localhost:1337"
  );
}

export function getStrapiApiToken(): string {
  return process.env.STRAPI_API_TOKEN || "";
}

export function isStrapiTokenConfigured(): boolean {
  return getStrapiApiToken().length > 0;
}

