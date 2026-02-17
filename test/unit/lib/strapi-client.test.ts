/** @jest-environment node */

import {
  createCmsAnalysis,
  fetchCmsAnalyses,
  fetchCmsAnalysesByAuthorSlug,
  fetchCmsAnalysisBySlug,
  fetchCmsAuthorByLegacyId,
  fetchCmsAuthorBySlug,
  fetchCmsAuthors,
  fetchCmsIssues,
  strapiRequest,
} from "@/lib/cms/strapi-client";
import {
  getStrapiApiToken,
  getStrapiInternalUrl,
  getStrapiPublicUrl,
} from "@/lib/cms/config";

jest.mock("@/lib/cms/config", () => ({
  getStrapiApiToken: jest.fn(),
  getStrapiInternalUrl: jest.fn(),
  getStrapiPublicUrl: jest.fn(),
  isStrapiTokenConfigured: jest.fn(),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("strapi-client", () => {
  const getTokenMock = getStrapiApiToken as jest.MockedFunction<
    typeof getStrapiApiToken
  >;
  const getInternalUrlMock = getStrapiInternalUrl as jest.MockedFunction<
    typeof getStrapiInternalUrl
  >;
  const getPublicUrlMock = getStrapiPublicUrl as jest.MockedFunction<
    typeof getStrapiPublicUrl
  >;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    getTokenMock.mockReturnValue("strapi-token");
    getInternalUrlMock.mockReturnValue("http://cms.internal");
    getPublicUrlMock.mockReturnValue("http://cms.public/cms");
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("retries on 5xx and returns the next successful payload", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, 500))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }, 200));

    const result = await strapiRequest<{ data: { ok: boolean } }>(
      "/api/authors",
      { retries: 1 }
    );

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx errors", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "bad request" } }, 400)
    );

    await expect(
      strapiRequest("/api/authors", { retries: 3 })
    ).rejects.toThrow("400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts timed out requests and retries up to configured limit", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });

    await expect(
      strapiRequest("/api/authors", { timeoutMs: 10, retries: 1 })
    ).rejects.toThrow("aborted");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("filters invalid author payload entries from Strapi list responses", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 99, attributes: { name: "No slug entry" } },
          {
            id: 1,
            attributes: {
              legacyId: 10,
              slug: "jan-kowalski",
              name: "Jan Kowalski",
              displayName: "Jan Kowalski",
              avatar: {
                data: {
                  id: 100,
                  attributes: { url: "/uploads/jan.png" },
                },
              },
            },
          },
        ],
      })
    );

    const authors = await fetchCmsAuthors();

    expect(authors).toHaveLength(1);
    expect(authors[0].slug).toBe("jan-kowalski");
    expect(authors[0].avatarUrl).toBe("http://cms.public/cms/uploads/jan.png");
  });

  it("fails fast for authenticated write requests when token is missing", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    getTokenMock.mockReturnValue("");

    await expect(
      createCmsAnalysis({
        title: "Nowa analiza",
        slug: "nowa-analiza",
        authorStrapiId: 7,
      })
    ).rejects.toThrow(
      "Strapi API token is required for authenticated requests"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends bearer token for createCmsAnalysis write requests", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 22,
          attributes: {
            legacyId: null,
            slug: "analiza-ci",
            title: "Analiza CI",
            contentMdx: "",
            author: {
              data: {
                id: 7,
                attributes: {
                  slug: "jan-kowalski",
                  name: "Jan Kowalski",
                  displayName: "Jan Kowalski",
                },
              },
            },
          },
        },
      })
    );

    await createCmsAnalysis({
      title: "Analiza CI",
      slug: "analiza-ci",
      authorStrapiId: 7,
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers.Authorization).toBe("Bearer strapi-token");
  });

  it("normalizes request path and attaches JSON headers when body is provided", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    await strapiRequest("api/custom-endpoint", {
      method: "POST",
      body: { hello: "world" },
      retries: 0,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe("http://cms.internal/api/custom-endpoint");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers["Content-Type"]).toBe("application/json");
  });

  it("retries transient network errors and succeeds on subsequent attempt", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    const result = await strapiRequest<{ data: { ok: boolean } }>(
      "/api/authors",
      { retries: 1 }
    );

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves author by slug and builds expected query parameters", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 7,
            attributes: {
              legacyId: 17,
              slug: "autor-testowy",
              name: "Autor Testowy",
              displayName: "Autor Testowy",
              avatar: {
                data: {
                  id: 1,
                  attributes: { url: "/uploads/autor-testowy.png" },
                },
              },
            },
          },
        ],
      })
    );

    const author = await fetchCmsAuthorBySlug("autor-testowy");

    expect(author?.slug).toBe("autor-testowy");
    const [requestUrl] = fetchMock.mock.calls[0];
    expect(requestUrl).toContain("/api/authors?");
    expect(requestUrl).toContain("filters%5Bslug%5D%5B%24eq%5D=autor-testowy");
    expect(requestUrl).toContain("populate%5Bavatar%5D%5Bfields%5D%5B0%5D=url");
  });

  it("returns null when author lookup by legacyId yields invalid payload", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: 3, attributes: { legacyId: 33, name: "Brak sluga" } }],
      })
    );

    const author = await fetchCmsAuthorByLegacyId(33);

    expect(author).toBeNull();
  });

  it("maps analyses list and filters out invalid entries", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 1, attributes: { title: "Brak sluga" } },
          {
            id: 22,
            attributes: {
              legacyId: 200,
              slug: "analiza-testowa",
              title: "Analiza Testowa",
              contentMdx: "## Test",
              author: {
                data: {
                  id: 7,
                  attributes: {
                    slug: "autor-testowy",
                    name: "Autor Testowy",
                    displayName: "Autor Testowy",
                  },
                },
              },
            },
          },
        ],
      })
    );

    const analyses = await fetchCmsAnalyses();

    expect(analyses).toHaveLength(1);
    expect(analyses[0].slug).toBe("analiza-testowa");
    expect(analyses[0].author?.slug).toBe("autor-testowy");
  });

  it("returns null when analysis-by-slug response contains invalid item", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: 5, attributes: { slug: "bez-tytulu" } }],
      })
    );

    const analysis = await fetchCmsAnalysisBySlug("bez-tytulu");

    expect(analysis).toBeNull();
  });

  it("builds author slug filter query for analysis listing by author", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await fetchCmsAnalysesByAuthorSlug("autor-z-filtra");

    const [requestUrl] = fetchMock.mock.calls[0];
    expect(requestUrl).toContain("filters%5Bauthor%5D%5Bslug%5D%5B%24eq%5D=autor-z-filtra");
    expect(requestUrl).toContain("sort%5B0%5D=legacyId%3Adesc");
    expect(requestUrl).toContain("sort%5B1%5D=id%3Adesc");
  });

  it("maps issues including media URLs", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 3,
            attributes: {
              year: 2025,
              title: "Zbior 2025",
              file: {
                data: {
                  id: 4,
                  attributes: { url: "/uploads/issue-2025.pdf" },
                },
              },
              cover: {
                data: {
                  id: 5,
                  attributes: { url: "/uploads/issue-2025.jpg" },
                },
              },
            },
          },
        ],
      })
    );

    const issues = await fetchCmsIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0].fileUrl).toBe("http://cms.public/cms/uploads/issue-2025.pdf");
    expect(issues[0].coverUrl).toBe("http://cms.public/cms/uploads/issue-2025.jpg");
  });

  it("throws when createCmsAnalysis receives an unmappable payload", async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 100,
          attributes: {
            title: "Bez wymaganego sluga",
            author: { data: null },
          },
        },
      })
    );

    await expect(
      createCmsAnalysis({
        title: "Testowa analiza",
        slug: "testowa-analiza",
        authorStrapiId: 1,
      })
    ).rejects.toThrow("Strapi analysis create returned invalid payload");
  });
});
