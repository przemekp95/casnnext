export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  normalizeCmsKind,
  syncAllCmsContent,
  syncCmsEntryById,
  unpublishCmsEntry,
} from "@/lib/server/cms-sync";

type SyncPayload = {
  secret?: string;
  fullSync?: boolean;
  model?: string;
  uid?: string;
  kind?: string;
  event?: string;
  id?: number | string;
  entry?: {
    id?: number | string;
    slug?: string;
    year?: number | string;
  };
};

function getExpectedSecret(): string {
  return (
    process.env.CMS_SYNC_SECRET ||
    process.env.STRAPI_WEBHOOK_SECRET ||
    process.env.REVALIDATE_SECRET ||
    ""
  );
}

function getProvidedSecret(request: Request, payload: SyncPayload): string {
  return (
    request.headers.get("x-cms-sync-secret") ||
    request.headers.get("x-strapi-secret") ||
    request.headers.get("x-revalidate-secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    payload.secret ||
    ""
  );
}

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isUnpublishEvent(event: string | undefined): boolean {
  return /delete|unpublish/i.test(event || "");
}

export async function POST(request: Request) {
  let payload: SyncPayload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const expectedSecret = getExpectedSecret();
  const providedSecret = getProvidedSecret(request, payload);

  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "CMS sync secret is not configured on the server" },
      { status: 503 }
    );
  }

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (payload.fullSync) {
      const summary = await syncAllCmsContent();
      return NextResponse.json({ ok: true, mode: "full", summary });
    }

    const kind = normalizeCmsKind(payload.kind || payload.model || payload.uid);
    if (!kind) {
      return NextResponse.json(
        { ok: false, error: "Unable to infer content kind from payload" },
        { status: 400 }
      );
    }

    const strapiId = toNumber(payload.id) ?? toNumber(payload.entry?.id);
    const slug = payload.entry?.slug ?? null;
    const year = toNumber(payload.entry?.year);

    if (isUnpublishEvent(payload.event)) {
      const unpublished = await unpublishCmsEntry(kind, { strapiId, slug, year });
      return NextResponse.json({
        ok: true,
        mode: "unpublish",
        kind,
        event: payload.event || null,
        unpublished,
      });
    }

    if (strapiId === null) {
      return NextResponse.json(
        { ok: false, error: "Webhook payload is missing entry id" },
        { status: 400 }
      );
    }

    const synced = await syncCmsEntryById(kind, strapiId);
    if (!synced) {
      return NextResponse.json(
        { ok: false, error: "CMS entry could not be fetched after webhook" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "incremental",
      kind,
      event: payload.event || null,
      id: strapiId,
    });
  } catch (error) {
    console.error("CMS sync failed:", error);
    return NextResponse.json(
      { ok: false, error: "CMS sync failed" },
      { status: 500 }
    );
  }
}
