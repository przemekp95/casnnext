/** @jest-environment node */

import { promises as fs } from "fs";
import { POST } from "@/app/api/client-log/route";

describe("API /api/client-log", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not create or append a server-side log file", async () => {
    const mkdirSpy = jest.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    const appendFileSpy = jest.spyOn(fs, "appendFile").mockResolvedValue(undefined);
    const request = new Request("http://localhost/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "public browser error", stack: "trace" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(appendFileSpy).not.toHaveBeenCalled();
  });
});
