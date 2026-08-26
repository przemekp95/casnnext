/** @jest-environment node */

import { GET, POST } from "@/app/api/articles/route";

describe("API /api/articles", () => {
  const originalNextPhase = process.env.NEXT_PHASE;

  afterEach(() => {
    if (originalNextPhase === undefined) {
      delete process.env.NEXT_PHASE;
    } else {
      process.env.NEXT_PHASE = originalNextPhase;
    }
  });

  it("keeps GET available during the production build", async () => {
    process.env.NEXT_PHASE = "phase-production-build";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("rejects a valid anonymous article POST as a public read-only boundary", async () => {
    const response = await POST(
      new Request("http://localhost/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Public write attempt",
          slug: "public-write-attempt",
          authorId: 1,
        }),
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "Method not allowed" });
  });
});
