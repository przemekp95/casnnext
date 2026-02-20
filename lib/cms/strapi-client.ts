import { getStrapiApiToken, getStrapiInternalUrl } from "./config";
import { mapCmsAnalysis, mapCmsAuthor, mapCmsIssue } from "./mappers";
import type { CmsAnalysis, CmsAuthor, CmsIssue, StrapiListResponse, StrapiSingleResponse } from "./types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  withToken?: boolean;
  timeoutMs?: number;
  retries?: number;
}

type RetryableError = Error & { retryable?: boolean };

function buildUrl(path: string): string {
  const base = getStrapiInternalUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function ensureQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const value = (payload as { error: unknown }).error;
    return JSON.stringify(value);
  }

  return JSON.stringify(payload);
}

export async function strapiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    withToken = false,
    timeoutMs = 8_000,
    retries = 2,
  } = options;

  const token = getStrapiApiToken();
  if (withToken && !token) {
    throw new Error("Strapi API token is required for authenticated requests");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (withToken && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildUrl(path), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const payload = await parseJson<unknown>(response).catch(() => ({}));
        const message = extractErrorMessage(payload);
        const err: RetryableError = new Error(
          `Strapi ${method} ${path} failed: ${response.status} ${message}`
        );
        err.retryable = response.status >= 500;

        if (err.retryable && attempt < retries) {
          lastError = err;
          continue;
        }
        throw err;
      }

      return await parseJson<T>(response);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      const retryable =
        !(error instanceof Error) ||
        (error as RetryableError).retryable !== false;
      if (!retryable) break;
      if (attempt >= retries) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown Strapi request error");
}

export async function fetchCmsAuthors(): Promise<CmsAuthor[]> {
  const params = new URLSearchParams();
  params.append("pagination[pageSize]", "500");
  params.append("sort[0]", "name:asc");
  params.append("populate[avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/authors", params));
  return (response.data || [])
    .map((entry) => mapCmsAuthor(entry))
    .filter((entry): entry is CmsAuthor => entry !== null);
}

export async function fetchCmsAuthorBySlug(slug: string): Promise<CmsAuthor | null> {
  const params = new URLSearchParams();
  params.append("filters[slug][$eq]", slug);
  params.append("pagination[pageSize]", "1");
  params.append("populate[avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/authors", params));
  const first = response.data?.[0];
  return first ? mapCmsAuthor(first) : null;
}

export async function fetchCmsAuthorByLegacyId(legacyId: number): Promise<CmsAuthor | null> {
  const params = new URLSearchParams();
  params.append("filters[legacyId][$eq]", String(legacyId));
  params.append("pagination[pageSize]", "1");
  params.append("populate[avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/authors", params));
  const first = response.data?.[0];
  return first ? mapCmsAuthor(first) : null;
}

export async function fetchCmsAnalyses(): Promise<CmsAnalysis[]> {
  const params = new URLSearchParams();
  params.append("pagination[pageSize]", "1000");
  params.append("sort[0]", "legacyId:desc");
  params.append("sort[1]", "id:desc");
  params.append("populate[author][populate][avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/analyses", params));
  return (response.data || [])
    .map((entry) => mapCmsAnalysis(entry))
    .filter((entry): entry is CmsAnalysis => entry !== null);
}

export async function fetchCmsAnalysisBySlug(slug: string): Promise<CmsAnalysis | null> {
  const params = new URLSearchParams();
  params.append("filters[slug][$eq]", slug);
  params.append("pagination[pageSize]", "1");
  params.append("populate[author][populate][avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/analyses", params));
  const first = response.data?.[0];
  return first ? mapCmsAnalysis(first) : null;
}

export async function fetchCmsAnalysesByAuthorSlug(authorSlug: string): Promise<CmsAnalysis[]> {
  const params = new URLSearchParams();
  params.append("filters[author][slug][$eq]", authorSlug);
  params.append("pagination[pageSize]", "1000");
  params.append("sort[0]", "legacyId:desc");
  params.append("sort[1]", "id:desc");
  params.append("populate[author][populate][avatar][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/analyses", params));
  return (response.data || [])
    .map((entry) => mapCmsAnalysis(entry))
    .filter((entry): entry is CmsAnalysis => entry !== null);
}

export async function fetchCmsIssues(): Promise<CmsIssue[]> {
  const params = new URLSearchParams();
  params.append("pagination[pageSize]", "100");
  params.append("sort[0]", "year:desc");
  params.append("populate[file][fields][0]", "url");
  params.append("populate[cover][fields][0]", "url");

  const response = await strapiRequest<StrapiListResponse>(ensureQuery("/api/issue-collections", params));
  return (response.data || [])
    .map((entry) => mapCmsIssue(entry))
    .filter((entry): entry is CmsIssue => entry !== null);
}

export async function createCmsAnalysis(payload: {
  title: string;
  slug: string;
  authorStrapiId: number;
  category?: string;
}): Promise<CmsAnalysis> {
  const body = {
    data: {
      title: payload.title,
      slug: payload.slug,
      category: payload.category || "analizy",
      contentMdx: "",
      date: new Date().toISOString().slice(0, 10),
      author: payload.authorStrapiId,
      publishedAt: new Date().toISOString(),
    },
  };

  const response = await strapiRequest<StrapiSingleResponse>("/api/analyses", {
    method: "POST",
    body,
    withToken: true,
  });

  const mapped = mapCmsAnalysis(response.data);
  if (!mapped) {
    throw new Error("Strapi analysis create returned invalid payload");
  }

  return mapped;
}
