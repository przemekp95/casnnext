/** @jest-environment node */

import { POST } from "@/app/api/cms/sync/route";
import {
  syncAllCmsContent,
  syncCmsEntryById,
  unpublishCmsEntry,
} from "@/lib/server/cms-sync";

jest.mock("@/lib/server/cms-sync", () => ({
  normalizeCmsKind: jest.fn((value: string | undefined) => {
    const normalized = (value || "").toLowerCase();
    if (normalized.includes("analysis")) return "analysis";
    if (normalized.includes("author")) return "author";
    if (normalized.includes("issue")) return "issue";
    return null;
  }),
  syncAllCmsContent: jest.fn(),
  syncCmsEntryById: jest.fn(),
  unpublishCmsEntry: jest.fn(),
}));

describe("/api/cms/sync", () => {
  const syncAllCmsContentMock = syncAllCmsContent as jest.MockedFunction<
    typeof syncAllCmsContent
  >;
  const syncCmsEntryByIdMock = syncCmsEntryById as jest.MockedFunction<
    typeof syncCmsEntryById
  >;
  const unpublishCmsEntryMock = unpublishCmsEntry as jest.MockedFunction<
    typeof unpublishCmsEntry
  >;
  const previousSecret = process.env.CMS_SYNC_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CMS_SYNC_SECRET = "test-secret";
  });

  afterAll(() => {
    process.env.CMS_SYNC_SECRET = previousSecret;
  });

  it("rejects unauthorized requests", async () => {
    const req = new Request("http://localhost/api/cms/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullSync: true }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("runs a full sync when requested", async () => {
    syncAllCmsContentMock.mockResolvedValue({
      authors: 10,
      analyses: 20,
      issues: 4,
      unpublished: 2,
    });

    const req = new Request("http://localhost/api/cms/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cms-sync-secret": "test-secret",
      },
      body: JSON.stringify({ fullSync: true }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(syncAllCmsContentMock).toHaveBeenCalledTimes(1);
    expect(json).toEqual({
      ok: true,
      mode: "full",
      summary: {
        authors: 10,
        analyses: 20,
        issues: 4,
        unpublished: 2,
      },
    });
  });

  it("runs an incremental sync for publish/update events", async () => {
    syncCmsEntryByIdMock.mockResolvedValue({ id: 99 } as never);

    const req = new Request("http://localhost/api/cms/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cms-sync-secret": "test-secret",
      },
      body: JSON.stringify({
        event: "entry.publish",
        model: "analysis",
        entry: { id: 99 },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(syncCmsEntryByIdMock).toHaveBeenCalledWith("analysis", 99);
    expect(json).toEqual({
      ok: true,
      mode: "incremental",
      kind: "analysis",
      event: "entry.publish",
      id: 99,
    });
  });

  it("marks entries unpublished for delete/unpublish events", async () => {
    unpublishCmsEntryMock.mockResolvedValue(true);

    const req = new Request("http://localhost/api/cms/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cms-sync-secret": "test-secret",
      },
      body: JSON.stringify({
        event: "entry.unpublish",
        model: "issue-collection",
        entry: { id: 7, year: 2026 },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(unpublishCmsEntryMock).toHaveBeenCalledWith("issue", {
      strapiId: 7,
      slug: null,
      year: 2026,
    });
    expect(json).toEqual({
      ok: true,
      mode: "unpublish",
      kind: "issue",
      event: "entry.unpublish",
      unpublished: true,
    });
  });
});
