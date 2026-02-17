/** @jest-environment node */

import { GET as getAuthorsRoute } from "@/app/api/authors/route";
import { GET as getAuthorBySlugRoute } from "@/app/api/authors/[slug]/route";
import { getAuthors, getAuthorBySlug } from "@/lib/authors";

jest.mock("@/lib/authors", () => ({
  getAuthors: jest.fn(),
  getAuthorBySlug: jest.fn(),
}));

describe("/api/authors routes", () => {
  const getAuthorsMock = getAuthors as jest.MockedFunction<typeof getAuthors>;
  const getAuthorBySlugMock =
    getAuthorBySlug as jest.MockedFunction<typeof getAuthorBySlug>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PHASE;
  });

  describe("GET /api/authors", () => {
    it("returns empty list during build phase", async () => {
      process.env.NEXT_PHASE = "phase-production-build";

      const res = await getAuthorsRoute();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([]);
      expect(getAuthorsMock).not.toHaveBeenCalled();
    });

    it("returns authors list in runtime", async () => {
      getAuthorsMock.mockResolvedValue([
        {
          id: "1",
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          displayName: "Jan Kowalski",
          img: null,
          bio: null,
        },
      ]);

      const res = await getAuthorsRoute();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([
        {
          id: "1",
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          displayName: "Jan Kowalski",
          img: null,
          bio: null,
        },
      ]);
    });

    it("returns 500 when source throws", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      getAuthorsMock.mockRejectedValue(new Error("DB unavailable"));

      const res = await getAuthorsRoute();
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json).toEqual({ error: "Internal server error" });
      consoleSpy.mockRestore();
    });
  });

  describe("GET /api/authors/[slug]", () => {
    it("returns 503 during build phase", async () => {
      process.env.NEXT_PHASE = "phase-production-build";

      const res = await getAuthorBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "test-slug" }),
      });
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json).toEqual({ error: "Build time - API unavailable" });
      expect(getAuthorBySlugMock).not.toHaveBeenCalled();
    });

    it("returns 404 when author does not exist", async () => {
      getAuthorBySlugMock.mockResolvedValue(null);

      const res = await getAuthorBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "missing" }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json).toEqual({ error: "Author not found" });
    });

    it("returns author details for existing slug", async () => {
      getAuthorBySlugMock.mockResolvedValue({
        author: {
          id: "1",
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          displayName: "Jan Kowalski",
          img: null,
          bio: null,
        },
        analyses: [
          {
            id: "9",
            title: "Analiza 9",
            slug: "analiza-9",
          },
        ],
      });

      const res = await getAuthorBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "jan-kowalski" }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(getAuthorBySlugMock).toHaveBeenCalledWith("jan-kowalski");
      expect(json).toEqual({
        author: {
          id: "1",
          slug: "jan-kowalski",
          name: "Jan Kowalski",
          displayName: "Jan Kowalski",
          img: null,
          bio: null,
        },
        analyses: [
          {
            id: "9",
            title: "Analiza 9",
            slug: "analiza-9",
          },
        ],
      });
    });

    it("returns 500 when lookup throws", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      getAuthorBySlugMock.mockRejectedValue(new Error("lookup failed"));

      const res = await getAuthorBySlugRoute(new Request("http://localhost"), {
        params: Promise.resolve({ slug: "jan-kowalski" }),
      });
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json).toEqual({ error: "Internal server error" });
      consoleSpy.mockRestore();
    });
  });
});
