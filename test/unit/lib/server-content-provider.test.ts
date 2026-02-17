/** @jest-environment node */

import { getAuthorBySlug, getAuthors } from "@/lib/server/authors";
import { getAnalyses, getAnalysisBySlug } from "@/lib/server/analyses";
import { isStrapiProvider } from "@/lib/content-provider";
import {
  fetchCmsAnalyses,
  fetchCmsAnalysesByAuthorSlug,
  fetchCmsAnalysisBySlug,
  fetchCmsAuthorBySlug,
  fetchCmsAuthors,
} from "@/lib/cms/strapi-client";
import { executeRscQuery } from "@/lib/db.rsc";

jest.mock("@/lib/content-provider", () => ({
  isStrapiProvider: jest.fn(),
}));

jest.mock("@/lib/cms/strapi-client", () => ({
  fetchCmsAuthors: jest.fn(),
  fetchCmsAuthorBySlug: jest.fn(),
  fetchCmsAnalysesByAuthorSlug: jest.fn(),
  fetchCmsAnalyses: jest.fn(),
  fetchCmsAnalysisBySlug: jest.fn(),
}));

jest.mock("@/lib/db.rsc", () => ({
  executeRscQuery: jest.fn(),
}));

describe("server content provider dual-source behavior", () => {
  const isStrapiProviderMock = isStrapiProvider as jest.MockedFunction<
    typeof isStrapiProvider
  >;
  const fetchCmsAuthorsMock = fetchCmsAuthors as jest.MockedFunction<
    typeof fetchCmsAuthors
  >;
  const fetchCmsAuthorBySlugMock = fetchCmsAuthorBySlug as jest.MockedFunction<
    typeof fetchCmsAuthorBySlug
  >;
  const fetchCmsAnalysesByAuthorSlugMock =
    fetchCmsAnalysesByAuthorSlug as jest.MockedFunction<
      typeof fetchCmsAnalysesByAuthorSlug
    >;
  const fetchCmsAnalysesMock = fetchCmsAnalyses as jest.MockedFunction<
    typeof fetchCmsAnalyses
  >;
  const fetchCmsAnalysisBySlugMock =
    fetchCmsAnalysisBySlug as jest.MockedFunction<typeof fetchCmsAnalysisBySlug>;
  const executeRscQueryMock = executeRscQuery as jest.MockedFunction<
    typeof executeRscQuery
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PHASE;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("short-circuits to empty/null during production build phase", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    isStrapiProviderMock.mockReturnValue(true);

    const authors = await getAuthors();
    const author = await getAuthorBySlug("any-author");
    const analyses = await getAnalyses();
    const analysis = await getAnalysisBySlug("any-analysis");

    expect(authors).toEqual([]);
    expect(author).toBeNull();
    expect(analyses).toEqual([]);
    expect(analysis).toBeNull();
    expect(fetchCmsAuthorsMock).not.toHaveBeenCalled();
    expect(fetchCmsAuthorBySlugMock).not.toHaveBeenCalled();
    expect(fetchCmsAnalysesMock).not.toHaveBeenCalled();
    expect(fetchCmsAnalysisBySlugMock).not.toHaveBeenCalled();
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("returns authors from Strapi when provider=strapi and response is non-empty", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAuthorsMock.mockResolvedValue([
      {
        id: 10,
        legacyId: 2,
        slug: "jan-kowalski",
        name: "Jan Kowalski",
        displayName: "Jan Kowalski",
        bio: null,
        avatarUrl: null,
        legacyImgPath: "/images/jan.png",
        sourceHash: "h1",
      },
    ]);

    const result = await getAuthors();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("jan-kowalski");
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("falls back to legacy query in getAuthors() when Strapi throws", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAuthorsMock.mockRejectedValue(new Error("strapi offline"));
    executeRscQueryMock.mockResolvedValue([
      {
        id: "1",
        slug: "legacy-author",
        name: "Legacy Author",
        displayName: "Legacy Author",
        img: null,
        bio: null,
      },
    ]);

    const result = await getAuthors();

    expect(executeRscQueryMock).toHaveBeenCalledTimes(1);
    expect(result[0].slug).toBe("legacy-author");
  });

  it("falls back to legacy query in getAuthorBySlug() when Strapi has no matching slug", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAuthorBySlugMock.mockResolvedValue(null);
    executeRscQueryMock.mockResolvedValue({
      author: {
        id: "2",
        slug: "legacy-author",
        name: "Legacy Author",
        displayName: "Legacy Author",
        img: null,
        bio: null,
      },
      analyses: [{ id: "11", title: "Legacy analysis", slug: "legacy-analysis" }],
    });

    const result = await getAuthorBySlug("legacy-author");

    expect(fetchCmsAnalysesByAuthorSlugMock).not.toHaveBeenCalled();
    expect(executeRscQueryMock).toHaveBeenCalledTimes(1);
    expect(result?.author.slug).toBe("legacy-author");
  });

  it("returns author detail from Strapi when author slug exists in CMS", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAuthorBySlugMock.mockResolvedValue({
      id: 2,
      legacyId: 22,
      slug: "strapi-author",
      name: "Strapi Author",
      displayName: "Strapi Author",
      bio: "Bio from strapi",
      avatarUrl: "https://cdn/avatar.jpg",
      legacyImgPath: "/images/fallback.jpg",
      sourceHash: "author-hash",
    });
    fetchCmsAnalysesByAuthorSlugMock.mockResolvedValue([
      {
        id: 8,
        legacyId: 18,
        slug: "strapi-analysis",
        title: "Strapi Analysis",
        lead: null,
        description: null,
        date: "2026-01-01",
        category: "analizy",
        contentMdx: "# test",
        sourceHash: "analysis-hash",
        author: null,
      },
    ]);

    const result = await getAuthorBySlug("strapi-author");

    expect(result?.author.slug).toBe("strapi-author");
    expect(result?.analyses).toEqual([
      { id: "8", slug: "strapi-analysis", title: "Strapi Analysis" },
    ]);
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("returns analyses from Strapi when provider=strapi and response is non-empty", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAnalysesMock.mockResolvedValue([
      {
        id: 90,
        legacyId: 8,
        slug: "strapi-analysis",
        title: "Strapi Analysis",
        lead: "Lead",
        description: null,
        date: "2026-02-01",
        category: "analizy",
        contentMdx: "# Content",
        sourceHash: "ha",
        author: {
          id: 10,
          legacyId: 2,
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          displayName: "Jan Kowalski",
          bio: null,
          avatarUrl: null,
          legacyImgPath: "/images/jan.png",
          sourceHash: "hb",
        },
      },
    ]);

    const result = await getAnalyses();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("strapi-analysis");
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("falls back to legacy query in getAnalyses() when Strapi returns empty list", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAnalysesMock.mockResolvedValue([]);
    executeRscQueryMock.mockResolvedValue([
      {
        id: "11",
        title: "Legacy Analysis",
        slug: "legacy-analysis",
        authorId: "1",
        author: { id: "1", slug: "legacy-author", name: "Legacy Author", img: null },
      },
    ]);

    const result = await getAnalyses();

    expect(executeRscQueryMock).toHaveBeenCalledTimes(1);
    expect(result[0].slug).toBe("legacy-analysis");
  });

  it("falls back to legacy query in getAnalysisBySlug() when Strapi throws", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAnalysisBySlugMock.mockRejectedValue(new Error("strapi timeout"));
    executeRscQueryMock.mockResolvedValue({
      id: "17",
      title: "Legacy Analysis",
      slug: "legacy-analysis",
      author: { name: "Legacy Author", bio: "Legacy bio" },
    });

    const result = await getAnalysisBySlug("legacy-analysis");

    expect(executeRscQueryMock).toHaveBeenCalledTimes(1);
    expect(result?.slug).toBe("legacy-analysis");
  });

  it("returns analysis detail from Strapi when analysis slug exists in CMS", async () => {
    isStrapiProviderMock.mockReturnValue(true);
    fetchCmsAnalysisBySlugMock.mockResolvedValue({
      id: 21,
      legacyId: 121,
      slug: "strapi-analysis",
      title: "Strapi Analysis",
      lead: "Lead",
      description: "Description",
      date: "2026-02-02",
      category: "analizy",
      contentMdx: "## Content",
      sourceHash: "hash",
      author: {
        id: 4,
        legacyId: 14,
        slug: "strapi-author",
        name: "Strapi Author",
        displayName: "Strapi Author",
        bio: "Author bio",
        avatarUrl: "https://cdn/avatar.png",
        legacyImgPath: null,
        sourceHash: "author-hash",
      },
    });

    const result = await getAnalysisBySlug("strapi-analysis");

    expect(result?.slug).toBe("strapi-analysis");
    expect(result?.author?.name).toBe("Strapi Author");
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("falls back to mock legacy data when DB is unavailable in legacy mode", async () => {
    isStrapiProviderMock.mockReturnValue(false);
    executeRscQueryMock.mockRejectedValue(new Error("db down"));

    const authors = await getAuthors();
    const analyses = await getAnalyses();
    const analysisKnownSlug = await getAnalysisBySlug("geopolityka-europy-srodkowej");
    const analysisUnknownSlug = await getAnalysisBySlug("missing-slug");

    expect(authors.length).toBeGreaterThan(0);
    expect(authors[0].slug).toBe("piotr-balcerowski");
    expect(analyses.length).toBeGreaterThan(0);
    expect(analyses[0].slug).toBe("geopolityka-europy-srodkowej");
    expect(analysisKnownSlug?.slug).toBe("geopolityka-europy-srodkowej");
    expect(analysisUnknownSlug).toBeNull();
  });
});
