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
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds static, analysis and unique author URLs from DB articles", async () => {
    const analyses = [
      {
        id: 3,
        title: "Analiza 3",
        slug: "analiza-3",
        authorId: 20,
        author: { id: 20, name: "Autor Dwa", slug: "autor-dwa" },
      },
      {
        id: 2,
        title: "Analiza 2",
        slug: "analiza-2",
        authorId: 10,
        author: { id: 10, name: "Autor Jeden", slug: "autor-jeden" },
      },
      {
        id: 1,
        title: "Analiza 1",
        slug: "analiza-1",
        authorId: 10,
        author: { id: 10, name: "Autor Jeden", slug: "autor-jeden" },
      },
    ];

    const findMock = jest.fn().mockResolvedValue(analyses);
    executeRscQueryMock.mockImplementation(async (queryFn) => {
      const dataSource = {
        getRepository: jest.fn().mockReturnValue({
          find: findMock,
        }),
      };
      return queryFn(dataSource as never);
    });

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(executeRscQueryMock).toHaveBeenCalledTimes(2);
    expect(findMock).toHaveBeenCalledTimes(2);
    expect(urls).toContain("https://casn.pl");
    expect(urls).toContain("https://casn.pl/analizy/analiza-1");
    expect(urls).toContain("https://casn.pl/analizy/analiza-2");
    expect(urls).toContain("https://casn.pl/analizy/analiza-3");
    expect(urls).toContain("https://casn.pl/autor/autor-jeden");
    expect(urls).toContain("https://casn.pl/autor/autor-dwa");
    expect(urls.filter((url) => url === "https://casn.pl/autor/autor-jeden")).toHaveLength(1);
  });

  it("returns only static pages when database fetch fails", async () => {
    executeRscQueryMock
      .mockRejectedValueOnce(new Error("db unavailable"))
      .mockRejectedValueOnce(new Error("db unavailable"));

    const result = await sitemap();

    expect(result).toHaveLength(4);
    expect(result.map((entry) => entry.url)).toEqual([
      "https://casn.pl",
      "https://casn.pl/zbiory",
      "https://casn.pl/kontakt",
      "https://casn.pl/autorzy",
    ]);
  });

  it("handles malformed author source by skipping author pages", async () => {
    const articles = [
      {
        id: 1,
        title: "Analiza 1",
        slug: "analiza-1",
        authorId: 10,
        author_name: "Autor Jeden",
        author_slug: "autor-jeden",
      },
    ];

    executeRscQueryMock.mockResolvedValueOnce(articles).mockResolvedValueOnce(null as never);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain("https://casn.pl/analizy/analiza-1");
    expect(urls.some((url) => url.includes("/autor/"))).toBe(false);
  });
});
