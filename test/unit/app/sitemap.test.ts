/** @jest-environment node */

import sitemap from "@/app/sitemap";
import { executeRscQuery } from "@/lib/db.rsc";

jest.mock("@/lib/db.rsc", () => ({
  executeRscQuery: jest.fn(),
}));

describe("app sitemap", () => {
  const executeRscQueryMock = executeRscQuery as jest.MockedFunction<
    typeof executeRscQuery
  >;

  beforeEach(() => {
    executeRscQueryMock.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockRepositories({
    analyses = [],
    authors = [],
    issues = [],
  }: {
    analyses?: Array<Record<string, unknown>>;
    authors?: Array<Record<string, unknown>>;
    issues?: Array<Record<string, unknown>>;
  }) {
    const analysisFindMock = jest.fn().mockResolvedValue(analyses);
    const authorFindMock = jest.fn().mockResolvedValue(authors);
    const issueFindMock = jest.fn().mockResolvedValue(issues);

    executeRscQueryMock.mockImplementation(async (queryFn) => {
      const dataSource = {
        getRepository: jest.fn().mockImplementation((schema: { options?: { name?: string } }) => {
          switch (schema.options?.name) {
            case "Analysis":
              return { find: analysisFindMock };
            case "Author":
              return { find: authorFindMock };
            case "IssueCollection":
              return { find: issueFindMock };
            default:
              throw new Error(`Unexpected repository: ${schema.options?.name}`);
          }
        }),
      };

      return queryFn(dataSource as never);
    });

    return { analysisFindMock, authorFindMock, issueFindMock };
  }

  it("builds static, analysis, author and same-host issue PDF URLs from DB", async () => {
    const publishedAt = new Date("2026-03-07T12:00:00.000Z");
    const { analysisFindMock, authorFindMock, issueFindMock } = mockRepositories({
      analyses: [
        { slug: "analiza-2", publishedAt },
        { slug: "analiza-1", publishedAt: new Date("2026-03-06T12:00:00.000Z") },
      ],
      authors: [
        { slug: "autor-dwa", publishedAt },
        { slug: "autor-jeden", publishedAt: new Date("2026-03-05T12:00:00.000Z") },
      ],
      issues: [
        { fileUrl: "/pdf/zeszyt-2026.pdf", publishedAt },
        { fileUrl: "https://cdn.example.com/zeszyt-2025.pdf", publishedAt },
      ],
    });

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(executeRscQueryMock).toHaveBeenCalledTimes(1);
    expect(analysisFindMock).toHaveBeenCalledTimes(1);
    expect(authorFindMock).toHaveBeenCalledTimes(1);
    expect(issueFindMock).toHaveBeenCalledTimes(1);
    expect(urls).toContain("https://casn.pl");
    expect(urls).toContain("https://casn.pl/analizy");
    expect(urls).toContain("https://casn.pl/analizy/analiza-1");
    expect(urls).toContain("https://casn.pl/analizy/analiza-2");
    expect(urls).toContain("https://casn.pl/autor/autor-jeden");
    expect(urls).toContain("https://casn.pl/autor/autor-dwa");
    expect(urls).toContain("https://casn.pl/pdf/zeszyt-2026.pdf");
    expect(urls).not.toContain("https://cdn.example.com/zeszyt-2025.pdf");
  });

  it("returns only static pages when database fetch fails", async () => {
    executeRscQueryMock.mockRejectedValueOnce(new Error("db unavailable"));

    const result = await sitemap();

    expect(result).toHaveLength(5);
    expect(result.map((entry) => entry.url)).toEqual([
      "https://casn.pl",
      "https://casn.pl/analizy",
      "https://casn.pl/zbiory",
      "https://casn.pl/kontakt",
      "https://casn.pl/autorzy",
    ]);
  });

  it("handles malformed author rows by skipping author pages and preserving analysis URLs", async () => {
    mockRepositories({
      analyses: [{ slug: "analiza-1", publishedAt: new Date("2026-03-07T12:00:00.000Z") }],
      authors: [{ slug: null, publishedAt: new Date("2026-03-07T12:00:00.000Z") }],
    });

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain("https://casn.pl/analizy/analiza-1");
    expect(urls.some((url) => url.includes("/autor/"))).toBe(false);
  });
});
