/** @jest-environment node */

import { GET, POST } from "@/app/api/articles/route";

describe("Articles API public contract", () => {
  const originalNextPhase = process.env.NEXT_PHASE;

  afterEach(() => {
    if (originalNextPhase === undefined) {
      delete process.env.NEXT_PHASE;
    } else {
      process.env.NEXT_PHASE = originalNextPhase;
    }
  });

  it("keeps GET cacheable when the route is evaluated at production build time", async () => {
    process.env.NEXT_PHASE = "phase-production-build";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(await response.json()).toEqual([]);
  });

  it("returns the same read-only response without parsing malformed POST data", async () => {
    const response = await POST(
      new Request("http://localhost/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "Method not allowed" });
  });
});
