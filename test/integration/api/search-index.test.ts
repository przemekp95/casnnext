/** @jest-environment node */

jest.mock("@/lib/db.server", () => ({
  AppDataSource: {
    isInitialized: true,
    initialize: jest.fn(),
    getRepository: jest.fn(),
  },
  isDatabaseConfigured: jest.fn(),
}));

jest.mock("@/lib/entities", () => ({
  AnalysisSchema: "AnalysisSchema",
}));

import { GET } from "@/app/api/search-index/route";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";

describe("API /api/search-index", () => {
  let errorSpy: jest.SpyInstance;
  const mockAppDataSource = AppDataSource as unknown as {
    isInitialized: boolean;
    initialize: jest.Mock;
    getRepository: jest.Mock;
  };
  const mockIsDatabaseConfigured = isDatabaseConfigured as jest.MockedFunction<
    typeof isDatabaseConfigured
  >;
  const mockFind = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.NEXT_PHASE;
    mockAppDataSource.isInitialized = true;
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockAppDataSource.getRepository.mockReturnValue({ find: mockFind });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns search index items from DB-backed MDX", async () => {
    mockFind.mockResolvedValue([
      {
        slug: "test-article-1",
        title: "Test Article One",
        date: "2024-01-15",
        contentMdx: `---
title: "Test Article One"
---

# Header

This is the content of the first article.`,
        author: { name: "Test Author" },
      },
      {
        slug: "test-article-2",
        title: "Test Article Two",
        date: "2024-01-10",
        contentMdx: "Second article content.",
        author: { name: "Another Author" },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      {
        slug: "test-article-1",
        title: "Test Article One",
        author: "Test Author",
        date: "2024-01-15",
        excerpt: expect.any(String),
        content: expect.stringContaining("This is the content of the first article"),
      },
      {
        slug: "test-article-2",
        title: "Test Article Two",
        author: "Another Author",
        date: "2024-01-10",
        excerpt: expect.any(String),
        content: expect.stringContaining("Second article content"),
      },
    ]);
  });

  it("sorts results by article date descending", async () => {
    mockFind.mockResolvedValue([
      {
        slug: "old-article",
        title: "Old Article",
        date: "2024-01-01",
        contentMdx: "Old content.",
        author: { name: "Author" },
      },
      {
        slug: "new-article",
        title: "New Article",
        date: "2024-01-15",
        contentMdx: "New content.",
        author: { name: "Author" },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data[0].date).toBe("2024-01-15");
    expect(data[1].date).toBe("2024-01-01");
  });

  it("initializes the datasource when needed", async () => {
    mockAppDataSource.isInitialized = false;
    mockFind.mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(mockAppDataSource.initialize).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when DB is not configured", async () => {
    mockIsDatabaseConfigured.mockReturnValue(false);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
    expect(mockAppDataSource.getRepository).not.toHaveBeenCalled();
  });

  it("returns an empty list when DB access fails", async () => {
    mockFind.mockRejectedValue(new Error("db down"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("creates cleaned excerpts and strips markdown from indexed content", async () => {
    mockFind.mockResolvedValue([
      {
        slug: "markdown-article",
        title: "Markdown Article",
        date: "2024-01-20",
        contentMdx: `# Header

**bold** text and [link](https://example.com)

\`\`\`ts
console.log("ignore");
\`\`\``,
        author: { name: "Author" },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data[0].content).not.toContain("# Header");
    expect(data[0].content).toContain("bold");
    expect(data[0].content).toContain("text and link");
    expect(data[0].excerpt.length).toBeGreaterThan(0);
  });
});
