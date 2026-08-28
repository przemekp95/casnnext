/** @jest-environment node */

import { promises as fs } from "fs";
import { POST } from "@/app/api/client-log/route";

jest.mock("fs", () => {
  const actualFs = jest.requireActual<typeof import("fs")>("fs");

  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      mkdir: jest.fn(),
      appendFile: jest.fn(),
    },
  };
});

describe("/api/client-log route", () => {
  it("discards attacker-controlled telemetry without parsing or persisting it", async () => {
    const request = new Request("http://localhost/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        message: "attacker-controlled\nforged-log-entry",
        stack: "x".repeat(100_000),
        source: "component.tsx",
      }),
    });
    const jsonSpy = jest.spyOn(request, "json");

    const response = await POST(request as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.appendFile).not.toHaveBeenCalled();
  });
});
