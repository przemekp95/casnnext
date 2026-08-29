import "server-only";

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "PayloadTooLargeError";
  }
}

export async function readJsonBodyWithinLimit(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
      throw new PayloadTooLargeError();
    }
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;
    if (bytesRead > maximumBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return JSON.parse(text);
}
