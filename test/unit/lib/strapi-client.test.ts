/** @jest-environment node */

import {
  createCmsAnalysis,
  fetchCmsAuthors,
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
});
