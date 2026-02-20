/** @jest-environment node */

import { promises as fs } from "fs";
import path from "path";
import { POST } from "@/app/api/client-log/route";

jest.mock("fs", () => ({
  promises: {
    mkdir: jest.fn(),
    appendFile: jest.fn(),
  },
}));

describe("/api/client-log route", () => {
  const mkdirMock = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
  const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
  const originalCwd = process.cwd;

  beforeEach(() => {
    jest.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    appendFileMock.mockResolvedValue(undefined);
    process.cwd = jest.fn().mockReturnValue("/test-root");
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  it("writes a formatted client log line and returns ok", async () => {
    const req = new Request("http://localhost/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        message: "Oops",
        stack: "Stack trace",
        source: "component.tsx",
      }),
    });

    const response = await POST(req as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mkdirMock).toHaveBeenCalledWith(path.join("/test-root", "tmp"), {
      recursive: true,
    });
    expect(appendFileMock).toHaveBeenCalledWith(
      path.join("/test-root", "tmp", "client.log"),
      expect.stringMatching(
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] error Oops Stack trace component\.tsx\n$/
      ),
      "utf8"
    );
  });

  it("falls back to defaults when request JSON parsing fails", async () => {
    const req = new Request("http://localhost/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    });

    const response = await POST(req as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(appendFileMock).toHaveBeenCalledWith(
      path.join("/test-root", "tmp", "client.log"),
      expect.stringMatching(
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] client   \n$/
      ),
      "utf8"
    );
  });

  it("returns 500 when filesystem write fails", async () => {
    appendFileMock.mockRejectedValue(new Error("disk error"));

    const req = new Request("http://localhost/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "any" }),
    });

    const response = await POST(req as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false });
  });
});
