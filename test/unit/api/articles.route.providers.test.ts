/** @jest-environment node */

import { GET, POST } from "@/app/api/articles/route";
import { isStrapiProvider } from "@/lib/content-provider";
import { getAnalyses } from "@/lib/analyses";
import {
  createCmsAnalysis,
  fetchCmsAuthorByLegacyId,
  fetchCmsAuthorBySlug,
} from "@/lib/cms/strapi-client";
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

jest.mock("@/lib/content-provider", () => ({
  isStrapiProvider: jest.fn(),
}));

jest.mock("@/lib/analyses", () => ({
  getAnalyses: jest.fn(),
}));

jest.mock("@/lib/cms/strapi-client", () => ({
  fetchCmsAuthorByLegacyId: jest.fn(),
  fetchCmsAuthorBySlug: jest.fn(),
  createCmsAnalysis: jest.fn(),
}));

jest.mock("@/lib/db.server", () => ({
  AppDataSource: {
    isInitialized: true,
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
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(options.rawMany ?? []),
    getRawOne: jest.fn().mockResolvedValue(options.rawOne ?? null),
  };
}

describe("/api/articles dual-source contract", () => {
  const isStrapiProviderMock = isStrapiProvider as jest.MockedFunction<
    typeof isStrapiProvider
  >;
  const getAnalysesMock = getAnalyses as jest.MockedFunction<typeof getAnalyses>;
  const fetchCmsAuthorByLegacyIdMock =
    fetchCmsAuthorByLegacyId as jest.MockedFunction<
      typeof fetchCmsAuthorByLegacyId
    >;
  const fetchCmsAuthorBySlugMock = fetchCmsAuthorBySlug as jest.MockedFunction<
    typeof fetchCmsAuthorBySlug
  >;
  const createCmsAnalysisMock = createCmsAnalysis as jest.MockedFunction<
    typeof createCmsAnalysis
  >;
  const isDatabaseConfiguredMock = isDatabaseConfigured as jest.MockedFunction<
    typeof isDatabaseConfigured
  >;
  const appDataSourceMock = AppDataSource as unknown as {
    isInitialized: boolean;
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PHASE;
    delete process.env.STRAPI_API_TOKEN;
    isDatabaseConfiguredMock.mockReturnValue(true);
    appDataSourceMock.isInitialized = true;
  });

  it("GET returns Strapi-backed contract when provider=strapi", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    getAnalysesMock.mockResolvedValue([
      {
        id: "1",
        title: "Analiza Strapi",
        slug: "analiza-strapi",
        authorId: "2",
        author: {
          id: "2",
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          img: null,
        },
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      {
        id: "1",
        title: "Analiza Strapi",
        slug: "analiza-strapi",
        authorId: "2",
        author_name: "Jan Kowalski",
        author_slug: "jan-kowalski",
      },
    ]);
  });

  it("GET returns legacy-backed contract when provider=legacy", async () => {
    isStrapiProviderMock.mockReturnValue(false);

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

  it("POST in Strapi mode returns 503 when STRAPI_API_TOKEN is missing", async () => {
    isStrapiProviderMock.mockReturnValue(true);

    const req = new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Nowa analiza",
        slug: "nowa-analiza",
        authorId: 1,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toContain("STRAPI_API_TOKEN");
  });

  it("POST in Strapi mode creates article and keeps JSON contract", async () => {
    isStrapiProviderMock.mockReturnValue(true);
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
    });
    createCmsAnalysisMock.mockResolvedValue({
      id: 99,
      legacyId: null,
      slug: "strapi-post",
      title: "Strapi post",
      lead: null,
      description: null,
      date: "2026-02-17",
      category: "analizy",
      contentMdx: "",
      sourceHash: null,
      author: null,
    });

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
    expect(json).toEqual({
      id: 99,
      title: "Strapi post",
      slug: "strapi-post",
      authorId: 9,
      author_name: "Jan Kowalski",
      author_slug: "jan-kowalski",
    });
    expect(fetchCmsAuthorByLegacyIdMock).not.toHaveBeenCalled();
  });

  it("POST in legacy mode creates article and keeps JSON contract", async () => {
    isStrapiProviderMock.mockReturnValue(false);

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
  });
});
