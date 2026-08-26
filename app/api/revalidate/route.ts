import { revalidatePath, revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type RevalidatePayload = {
  tag?: string;
  tags?: string[];
  model?: string;
  event?: string;
};

function getExpectedSecret(): string {
  return process.env.REVALIDATE_SECRET || process.env.DIRECTUS_WEBHOOK_SECRET || "";
}

function getProvidedSecret(request: Request): string {
  const headerSecret =
    request.headers.get("x-revalidate-secret") || request.headers.get("x-directus-secret");
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] || "";
}

function secretsMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function inferTags(payload: RevalidatePayload): string[] {
  if (Array.isArray(payload.tags) && payload.tags.length > 0) return payload.tags;
  if (payload.tag) return [payload.tag];

  const model = (payload.model || "").toLowerCase();
  if (!model) return ["analyses", "authors", "issues", "articles", "sitemap"];

  if (model.includes("analysis")) return ["analyses", "articles", "sitemap"];
  if (model.includes("author")) return ["authors", "analyses", "articles", "sitemap"];
  if (model.includes("issue")) return ["issues", "sitemap"];
  return ["analyses", "authors", "issues", "articles", "sitemap"];
}

function inferPaths(payload: RevalidatePayload): string[] {
  const model = (payload.model || "").toLowerCase();
  if (!model) return ["/autorzy", "/analizy", "/zbiory", "/sitemap.xml"];

  if (model.includes("analysis")) return ["/analizy", "/sitemap.xml"];
  if (model.includes("author")) return ["/autorzy", "/analizy", "/sitemap.xml"];
  if (model.includes("issue")) return ["/zbiory", "/sitemap.xml"];
  return ["/autorzy", "/analizy", "/zbiory", "/sitemap.xml"];
}

function tryRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    // In tests or non-Next runtime, static generation store may be unavailable.
  }
}

function tryRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // In tests or non-Next runtime, static generation store may be unavailable.
  }
}

export async function POST(req: Request) {
  let payload: RevalidatePayload = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const expected = getExpectedSecret();
  const provided = getProvidedSecret(req);

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Revalidation secret is not configured on the server" },
      { status: 503 }
    );
  }

  if (!secretsMatch(expected, provided)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const tags = inferTags(payload);
  const paths = inferPaths(payload);
  for (const tag of tags) {
    tryRevalidateTag(tag);
  }
  for (const path of paths) {
    tryRevalidatePath(path);
  }

  return NextResponse.json({ ok: true, tags, paths, event: payload.event || null, model: payload.model || null });
}
