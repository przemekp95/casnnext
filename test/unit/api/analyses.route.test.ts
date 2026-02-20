/** @jest-environment node */

import { GET as getAnalysesRoute } from "@/app/api/analyses/route";
import { GET as getAnalysisBySlugRoute } from "@/app/api/analyses/[slug]/route";
import { getAnalyses, getAnalysisBySlug } from "@/lib/analyses";

jest.mock("@/lib/analyses", () => ({
  getAnalyses: jest.fn(),
  getAnalysisBySlug: jest.fn(),
}));

describe("/api/analyses routes", () => {
  const getAnalysesMock = getAnalyses as jest.MockedFunction<typeof getAnalyses>;
  const getAnalysisBySlugMock =
    getAnalysisBySlug as jest.MockedFunction<typeof getAnalysisBySlug>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PHASE;
  });

  describe("GET /api/analyses", () => {
    it("returns empty list during build phase", async () => {
      process.env.NEXT_PHASE = "phase-production-build";

      const res = await getAnalysesRoute();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([]);
      expect(getAnalysesMock).not.toHaveBeenCalled();
    });

    it("returns analyses list in runtime", async () => {
      getAnalysesMock.mockResolvedValue([
        {
          id: "1",
          title: "Analiza testowa",
          slug: "analiza-testowa",
          authorId: "1",
        },
      ]);

      const res = await getAnalysesRoute();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([
        {
          id: "1",
          title: "Analiza testowa",
          slug: "analiza-testowa",
          authorId: "1",
        },
      ]);
    });

    it("returns 500 when source throws", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      getAnalysesMock.mockRejectedValue(new Error("DB unavailable"));

      const res = await getAnalysesRoute();
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json).toEqual({ error: "Internal server error" });
      consoleSpy.mockRestore();
    });
  });

  describe("GET /api/analyses/[slug]", () => {
    it("returns 503 during build phase", async () => {
      process.env.NEXT_PHASE = "phase-production-build";

      const res = await getAnalysisBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "test-slug" }),
      });
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json).toEqual({ error: "Build time - API unavailable" });
      expect(getAnalysisBySlugMock).not.toHaveBeenCalled();
    });

    it("returns 404 when analysis does not exist", async () => {
      getAnalysisBySlugMock.mockResolvedValue(null);

      const res = await getAnalysisBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "missing" }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json).toEqual({ error: "Analysis not found" });
    });

    it("returns analysis details for existing slug", async () => {
      getAnalysisBySlugMock.mockResolvedValue({
        id: "7",
        title: "Analiza 7",
        slug: "analiza-7",
      });

      const res = await getAnalysisBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "analiza-7" }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(getAnalysisBySlugMock).toHaveBeenCalledWith("analiza-7");
      expect(json).toEqual({
        id: "7",
        title: "Analiza 7",
        slug: "analiza-7",
      });
    });

    it("returns 500 when lookup throws", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      getAnalysisBySlugMock.mockRejectedValue(new Error("lookup failed"));

      const res = await getAnalysisBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "analiza-7" }),
      });
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json).toEqual({ error: "Internal server error" });
      consoleSpy.mockRestore();
    });
  });
});
