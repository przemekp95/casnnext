/** @jest-environment node */

import { GET, POST, toArticleResponse } from "@/app/api/articles/route";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";

jest.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/entities", () => ({
  AnalysisSchema: "AnalysisSchema",
}));

jest.mock("@/lib/db.server", () => ({
  AppDataSource: {
    isInitialized: true,
    initialize: jest.fn(),
    getRepository: jest.fn(),
  },
  isDatabaseConfigured: jest.fn(),
}));

function makeReadQueryBuilder(rawMany: unknown[]) {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawMany),
  };
}

describe("/api/articles DB-backed read contract", () => {
  const isDatabaseConfiguredMock = isDatabaseConfigured as jest.MockedFunction<
    typeof isDatabaseConfigured
  >;
  const appDataSourceMock = AppDataSource as unknown as {
    isInitialized: boolean;
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
    delete process.env.NEXT_PHASE;
    isDatabaseConfiguredMock.mockReturnValue(true);
    appDataSourceMock.isInitialized = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects malformed article rows at the API boundary", () => {
    const malformed: unknown = { id: 7 };

    expect(() => toArticleResponse(malformed)).toThrow("Invalid article record");
  });

  it.each([
    ["number", 7],
    ["text", "article"],
    ["null", null],
  ])("rejects a %s value before reading article fields", (_kind, malformed: unknown) => {
    expect(() => toArticleResponse(malformed)).toThrow("Invalid article record");
  });

  it("GET returns the DB-backed article contract", async () => {
    const queryBuilder = makeReadQueryBuilder([
      {
        id: 5,
        title: "Legacy analiza",
        slug: "legacy-analiza",
        authorId: 12,
        author_name: "Legacy Author",
        author_slug: "legacy-author",
      },
    ]);
    appDataSourceMock.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
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

  it("POST rejects a valid anonymous article without saving a repository record", async () => {
    const save = jest.fn().mockResolvedValue({ id: 77 });
    appDataSourceMock.getRepository.mockReturnValue({ save });

    const response = await POST(
      new Request("http://localhost/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Public write attempt",
          slug: "public-write-attempt",
          authorId: 5,
        }),
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "Method not allowed" });
    expect(save).not.toHaveBeenCalled();
  });
});
