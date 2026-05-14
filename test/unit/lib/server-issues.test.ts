/** @jest-environment node */

import { executeRscQuery } from "@/lib/db.rsc";
import { getIssueCollections } from "@/lib/server/issues";

jest.mock("@/lib/db.rsc", () => ({
  executeRscQuery: jest.fn(),
}));

describe("lib/server/issues", () => {
  const executeRscQueryMock = executeRscQuery as jest.MockedFunction<typeof executeRscQuery>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns DB-backed issue collections when available", async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 91,
        year: 2026,
        title: "Zeszyt Analiz 2026",
        fileUrl: "https://casn.pl/cms/uploads/analizy_2026.pdf",
        coverUrl: "https://casn.pl/cms/uploads/analizy_2026.webp",
      },
      {
        id: 92,
        year: 2025,
        title: "Zeszyt Analiz 2025",
        fileUrl: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf",
        coverUrl: null,
      },
    ]);

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({ getRepository: jest.fn().mockReturnValue({ find }) } as never)
    );

    const issues = await getIssueCollections();

    expect(issues).toEqual([
      {
        id: "91",
        year: 2026,
        title: "Zeszyt Analiz 2026",
        file: "https://casn.pl/cms/uploads/analizy_2026.pdf",
        cover: "https://casn.pl/cms/uploads/analizy_2026.webp",
      },
      {
        id: "92",
        year: 2025,
        title: "Zeszyt Analiz 2025",
        file: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf",
        cover: null,
      },
    ]);
  });

  it("skips DB rows without downloadable files", async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 93,
        year: 2027,
        title: "Zeszyt Analiz 2027",
        fileUrl: "#",
        coverUrl: "https://casn.pl/cms/uploads/analizy_2027.webp",
      },
      {
        id: 94,
        year: 2026,
        title: "Zeszyt Analiz 2026",
        fileUrl: "https://casn.pl/cms/uploads/analizy_2026.pdf",
        coverUrl: null,
      },
    ]);

    executeRscQueryMock.mockImplementation(async (queryFn) =>
      queryFn({ getRepository: jest.fn().mockReturnValue({ find }) } as never)
    );

    const issues = await getIssueCollections();

    expect(issues.map((issue) => issue.year)).toEqual([2026]);
  });

  it("returns built-in fallback issues when DB access fails", async () => {
    executeRscQueryMock.mockRejectedValue(new Error("db down"));

    const issues = await getIssueCollections();

    expect(issues.map((issue) => issue.year)).toEqual([2025, 2024, 2023, 2022]);
    expect(issues.every((issue) => !issue.file.includes(" "))).toBe(true);
    expect(issues.find((issue) => issue.year === 2024)?.file).toBe(
      "/Katalog%20CASN_online_08_12_24.pdf",
    );
  });
});
