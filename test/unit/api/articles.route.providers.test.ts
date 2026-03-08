/** @jest-environment node */

import { GET, POST } from "@/app/api/articles/route";
import {
  createCmsAnalysis,
  fetchCmsAuthorByLegacyId,
  fetchCmsAuthorBySlug,
} from "@/lib/cms/strapi-client";
import { syncCmsEntryById } from "@/lib/server/cms-sync";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";

const revalidateTagMock = jest.fn();

jest.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

jest.mock("@/lib/entities", () => ({
  AuthorSchema: "AuthorSchema",
  AnalysisSchema: "AnalysisSchema",
}));

jest.mock("@/lib/cms/strapi-client", () => ({
  fetchCmsAuthorByLegacyId: jest.fn(),
  fetchCmsAuthorBySlug: jest.fn(),
  createCmsAnalysis: jest.fn(),
}));

jest.mock("@/lib/server/cms-sync", () => ({
  syncCmsEntryById: jest.fn(),
}));

jest.mock("@/lib/db.server", () => ({
  AppDataSource: {
    isInitialized: true,
    initialize: jest.fn(),
    getRepository: jest.fn(),
  },
  isDatabaseConfigured: jest.fn(),
}));

function makeLegacyQueryBuilder(options: {
  rawMany?: unknown[];
  rawOne?: unknown;
}) {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(options.rawMany ?? []),
    getRawOne: jest.fn().mockResolvedValue(options.rawOne ?? null),
  };
}

describe("/api/articles DB-backed contract", () => {
  const fetchCmsAuthorByLegacyIdMock =
    fetchCmsAuthorByLegacyId as jest.MockedFunction<typeof fetchCmsAuthorByLegacyId>;
  const fetchCmsAuthorBySlugMock = fetchCmsAuthorBySlug as jest.MockedFunction<
    typeof fetchCmsAuthorBySlug
  >;
  const createCmsAnalysisMock = createCmsAnalysis as jest.MockedFunction<
    typeof createCmsAnalysis
  >;
  const syncCmsEntryByIdMock = syncCmsEntryById as jest.MockedFunction<
    typeof syncCmsEntryById
  >;
  const isDatabaseConfiguredMock = isDatabaseConfigured as jest.MockedFunction<
    typeof isDatabaseConfigured
  >;
  const appDataSourceMock = AppDataSource as unknown as {
    isInitialized: boolean;
    initialize: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
    delete process.env.NEXT_PHASE;
    delete process.env.STRAPI_API_TOKEN;
    isDatabaseConfiguredMock.mockReturnValue(true);
    appDataSourceMock.isInitialized = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("GET returns the DB-backed article contract", async () => {
    const legacyBuilder = makeLegacyQueryBuilder({
      rawMany: [
        {
          id: 5,
          title: "Legacy analiza",
          slug: "legacy-analiza",
          authorId: 12,
          author_name: "Legacy Author",
          author_slug: "legacy-author",
        },
      ],
    });
    const analysisRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(legacyBuilder),
    };
    appDataSourceMock.getRepository.mockReturnValue(analysisRepo);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      {
        id: 5,
        title: "Legacy analiza",
        slug: "legacy-analiza",
        authorId: 12,
        author_name: "Legacy Author",
        author_slug: "legacy-author",
      },
    ]);
  });

  it("POST with STRAPI_API_TOKEN creates in Strapi, syncs DB and returns DB-backed payload", async () => {
    process.env.STRAPI_API_TOKEN = "token";
    fetchCmsAuthorBySlugMock.mockResolvedValue({
      id: 18,
      legacyId: 9,
      slug: "jan-kowalski",
      name: "Jan Kowalski",
      displayName: "Jan Kowalski",
      bio: null,
      avatarUrl: null,
      legacyImgPath: "/images/jan.png",
      sourceHash: null,
      publishedAt: "2026-03-07T12:00:00.000Z",
    });
    createCmsAnalysisMock.mockResolvedValue({
      id: 99,
      legacyId: null,
      slug: "strapi-post",
      title: "Strapi post",
      lead: null,
      description: null,
      date: "2026-03-07",
      category: "analizy",
      contentMdx: "",
      sourceHash: null,
      author: null,
      publishedAt: "2026-03-07T12:00:00.000Z",
    });
    syncCmsEntryByIdMock.mockResolvedValue({ id: 99 } as never);

    const legacyBuilder = makeLegacyQueryBuilder({
      rawMany: [
        {
          id: 99,
          title: "Strapi post",
          slug: "strapi-post",
          authorId: 9,
          author_name: "Jan Kowalski",
          author_slug: "jan-kowalski",
        },
      ],
    });
    const analysisRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(legacyBuilder),
    };
    appDataSourceMock.getRepository.mockReturnValue(analysisRepo);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Strapi post",
        slug: "strapi-post",
        authorSlug: "jan-kowalski",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(syncCmsEntryByIdMock).toHaveBeenCalledWith("analysis", 99);
    expect(json).toEqual({
      id: 99,
      title: "Strapi post",
      slug: "strapi-post",
      authorId: 9,
      author_name: "Jan Kowalski",
      author_slug: "jan-kowalski",
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("articles", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("analyses", "max");
    expect(fetchCmsAuthorByLegacyIdMock).not.toHaveBeenCalled();
  });

  it("POST with STRAPI_API_TOKEN returns 400 when CMS author cannot be resolved", async () => {
    process.env.STRAPI_API_TOKEN = "token";
    fetchCmsAuthorBySlugMock.mockResolvedValue(null);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Strapi post",
        slug: "strapi-post",
        authorSlug: "missing-author",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("authorId or authorSlug required");
  });

  it("POST without STRAPI_API_TOKEN falls back to direct DB create", async () => {
    const legacyBuilder = makeLegacyQueryBuilder({
      rawOne: {
        id: 77,
        title: "Legacy post",
        slug: "legacy-post",
        authorId: 5,
        author_name: "Legacy Author",
        author_slug: "legacy-author",
      },
    });
    const analysisRepo = {
      save: jest.fn().mockResolvedValue({ id: 77 }),
      createQueryBuilder: jest.fn().mockReturnValue(legacyBuilder),
    };
    appDataSourceMock.getRepository.mockReturnValue(analysisRepo);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Legacy post",
        slug: "legacy-post",
        authorId: 5,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({
      id: 77,
      title: "Legacy post",
      slug: "legacy-post",
      authorId: 5,
      author_name: "Legacy Author",
      author_slug: "legacy-author",
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("articles", "max");
  });
});
