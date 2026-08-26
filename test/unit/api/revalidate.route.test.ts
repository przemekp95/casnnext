/** @jest-environment node */

const revalidateTagMock = jest.fn();
const revalidatePathMock = jest.fn();

jest.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

describe("POST /api/revalidate", () => {
  const originalRevalidateSecret = process.env.REVALIDATE_SECRET;
  const originalDirectusWebhookSecret = process.env.DIRECTUS_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REVALIDATE_SECRET = "test-secret";
    delete process.env.DIRECTUS_WEBHOOK_SECRET;
  });

  afterAll(() => {
    if (originalRevalidateSecret === undefined) {
      delete process.env.REVALIDATE_SECRET;
    } else {
      process.env.REVALIDATE_SECRET = originalRevalidateSecret;
    }
    if (originalDirectusWebhookSecret === undefined) {
      delete process.env.DIRECTUS_WEBHOOK_SECRET;
    } else {
      process.env.DIRECTUS_WEBHOOK_SECRET = originalDirectusWebhookSecret;
    }
  });

  async function post(payload: unknown, headers: HeadersInit = {}) {
    const { POST } = await import("@/app/api/revalidate/route");
    return POST(
      new Request("http://localhost/api/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(payload),
      })
    );
  }

  it("returns 503 when no server-side revalidation secret is configured", async () => {
    delete process.env.REVALIDATE_SECRET;
    delete process.env.DIRECTUS_WEBHOOK_SECRET;

    const response = await post({ tag: "analyses" });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Revalidation secret is not configured on the server",
    });
  });

  it.each([
    ["wrong same-length header secret", { "x-directus-secret": "bad-secret" }],
    ["wrong different-length header secret", { "x-directus-secret": "bad" }],
  ])("returns 401 for a %s", async (_description, headers) => {
    const response = await post({ tag: "analyses" }, headers);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("ignores a correct JSON body secret", async () => {
    const response = await post({ tag: "analyses", secret: "test-secret" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("accepts DIRECTUS_WEBHOOK_SECRET as the server-side fallback", async () => {
    delete process.env.REVALIDATE_SECRET;
    process.env.DIRECTUS_WEBHOOK_SECRET = "directus-secret";

    const response = await post(
      { model: "analysis", event: "items.update" },
      { "x-directus-secret": "directus-secret" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, model: "analysis" });
  });

  it("prefers REVALIDATE_SECRET when both server-side secrets differ", async () => {
    process.env.REVALIDATE_SECRET = "preferred-secret";
    process.env.DIRECTUS_WEBHOOK_SECRET = "different-secret";

    const preferred = await post(
      { model: "analysis" },
      { "x-directus-secret": "preferred-secret" },
    );
    const shadowed = await post(
      { model: "analysis" },
      { "x-directus-secret": "different-secret" },
    );

    expect(preferred.status).toBe(200);
    expect(shadowed.status).toBe(401);
  });

  it.each([
    ["x-revalidate-secret", { "x-revalidate-secret": "test-secret" }],
    ["x-directus-secret", { "x-directus-secret": "test-secret" }],
    ["Bearer authorization", { authorization: "Bearer test-secret" }],
  ])("accepts the configured secret from %s", async (_source, headers) => {
    const response = await post({ model: "analysis", event: "entry.publish" }, headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      event: "entry.publish",
      model: "analysis",
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("analyses", "max");
    expect(revalidatePathMock).toHaveBeenCalledWith("/analizy");
  });
});
