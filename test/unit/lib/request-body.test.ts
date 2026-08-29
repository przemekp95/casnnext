/** @jest-environment node */

import {
  PayloadTooLargeError,
  readJsonBodyWithinLimit,
} from "@/lib/server/request-body";

function streamedRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readJsonBodyWithinLimit", () => {
  it("rejects a declared content length above the byte limit before reading", async () => {
    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "content-length": "11" },
      body: "{}",
    });
    const readerSpy = jest.spyOn(request.body!, "getReader");

    await expect(readJsonBodyWithinLimit(request, 10)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    expect(readerSpy).not.toHaveBeenCalled();
  });

  it("rejects a chunked body when the streamed bytes cross the limit", async () => {
    const request = streamedRequest(["{\"value\":\"", "1234567890", "\"}"]);

    await expect(readJsonBodyWithinLimit(request, 12)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("parses a JSON body whose streamed bytes stay within the limit", async () => {
    const request = streamedRequest(["{\"model\":", "\"Analysis\"}"]);

    await expect(readJsonBodyWithinLimit(request, 64)).resolves.toEqual({
      model: "Analysis",
    });
  });
});
