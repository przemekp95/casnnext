/** @jest-environment node */

import { getAuthorBySlug, getAuthors } from "@/lib/server/authors";
import { getAnalyses, getAnalysisBySlug } from "@/lib/server/analyses";
import { executeRscQuery } from "@/lib/db.rsc";

jest.mock("@/lib/db.rsc", () => ({
  executeRscQuery: jest.fn(),
}));

describe("server DB content model behavior", () => {
  const executeRscQueryMock = executeRscQuery as jest.MockedFunction<typeof executeRscQuery>;

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

    const authors = await getAuthors();
    const author = await getAuthorBySlug("any-author");
    const analyses = await getAnalyses();
    const analysis = await getAnalysisBySlug("any-analysis");

    expect(authors).toEqual([]);
    expect(author).toBeNull();
    expect(analyses).toEqual([]);
    expect(analysis).toBeNull();
    expect(executeRscQueryMock).not.toHaveBeenCalled();
  });

  it("returns authors from the database and applies canonical overrides", async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 1,
        slug: "domanska",
        name: "Dr Aldona Domańska",
        displayName: "Dr Aldona Domańska",
        img: "/images/wrong.png",
        bio: "Bio",
        sourceHash: "hash-1",
      },
    ]);

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({ getRepository: jest.fn().mockReturnValue({ find }) } as never)
    );

    const result = await getAuthors();

    expect(result).toEqual([
      {
        id: "1",
        slug: "domanska",
        name: "prof. Agnieszka Domańska",
        displayName: "prof. Agnieszka Domańska",
        img: "/images/Domanska.png",
        bio: "Bio",
        sourceHash: "hash-1",
      },
    ]);
  });

  it("returns author detail with only published analyses from the database", async () => {
    const authorRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        slug: "jan-kowalski",
        name: "Jan Kowalski",
        displayName: "Jan Kowalski",
        img: "/images/jan.png",
        bio: "Biogram",
        sourceHash: "author-hash",
      }),
    };
    const analysisRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 10, title: "Analiza 1", slug: "analiza-1" },
        { id: 11, title: "Analiza 2", slug: "analiza-2" },
      ]),
    };

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({
        getRepository: jest
          .fn()
          .mockReturnValueOnce(authorRepo)
          .mockReturnValueOnce(analysisRepo),
      } as never)
    );

    const result = await getAuthorBySlug("jan-kowalski");

    expect(authorRepo.findOne).toHaveBeenCalledTimes(1);
    expect(analysisRepo.find).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      author: {
        id: "7",
        slug: "jan-kowalski",
        name: "Jan Kowalski",
        displayName: "Jan Kowalski",
        img: "/images/jan.png",
        bio: "Biogram",
        sourceHash: "author-hash",
      },
      analyses: [
        { id: "10", title: "Analiza 1", slug: "analiza-1" },
        { id: "11", title: "Analiza 2", slug: "analiza-2" },
      ],
    });
  });

  it("returns analyses from the database with DB-backed metadata fields", async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 21,
        title: "Analiza DB",
        slug: "analiza-db",
        authorId: 3,
        date: "2026-03-01",
        lead: "Lead",
        description: "Opis",
        category: "geopolityka",
        sourceHash: "analysis-hash",
        author: {
          id: 3,
          slug: "balcerowski",
          name: "Piotr Balcerowski",
          img: "/images/Balcerowski.png",
        },
      },
    ]);

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({ getRepository: jest.fn().mockReturnValue({ find }) } as never)
    );

    const result = await getAnalyses();

    expect(result).toEqual([
      {
        id: "21",
        title: "Analiza DB",
        slug: "analiza-db",
        authorId: "3",
        date: "2026-03-01",
        lead: "Lead",
        description: "Opis",
        category: "geopolityka",
        sourceHash: "analysis-hash",
        author: {
          id: "3",
          slug: "balcerowski",
          name: "Piotr Balcerowski",
          img: "/images/placeholder.png",
        },
      },
    ]);
  });

  it("returns analysis detail from the database with stored MDX", async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 31,
      title: "Analiza szczegółowa",
      slug: "analiza-szczegolowa",
      date: "2026-03-02",
      lead: "Lead",
      description: "Opis",
      category: "bezpieczeństwo",
      contentMdx: "# Treść",
      sourceHash: "detail-hash",
      author: {
        id: 8,
        slug: "jan-nowak",
        name: "Jan Nowak",
        img: "/images/jan.png",
        bio: "Bio autora",
      },
    });

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({ getRepository: jest.fn().mockReturnValue({ findOne }) } as never)
    );

    const result = await getAnalysisBySlug("analiza-szczegolowa");

    expect(result).toEqual({
      id: "31",
      title: "Analiza szczegółowa",
      slug: "analiza-szczegolowa",
      date: "2026-03-02",
      lead: "Lead",
      description: "Opis",
      category: "bezpieczeństwo",
      contentMdx: "# Treść",
      sourceHash: "detail-hash",
      author: {
        id: "8",
        slug: "jan-nowak",
        name: "Jan Nowak",
        img: "/images/jan.png",
        bio: "Bio autora",
      },
    });
  });

  it("falls back to mock legacy data when DB is unavailable", async () => {
    executeRscQueryMock.mockRejectedValue(new Error("db down"));

    const authors = await getAuthors();
    const analyses = await getAnalyses();
    const analysisKnownSlug = await getAnalysisBySlug("geopolityka-europy-srodkowej");
    const analysisUnknownSlug = await getAnalysisBySlug("missing-slug");

    expect(authors.length).toBeGreaterThan(0);
    expect(authors[0].slug).toBe("piotr-balcerowski");
    expect(analyses.length).toBeGreaterThan(0);
    expect(analysisKnownSlug?.slug).toBe("geopolityka-europy-srodkowej");
    expect(analysisUnknownSlug).toBeNull();
  });
});
