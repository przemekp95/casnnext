export type EdgeFetchPrimitives = {
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
  FormData: typeof FormData;
  File: typeof File;
  Blob: typeof Blob;
};

export function defineGlobal(key: PropertyKey, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

export function installEdgeFetchPrimitives(
  primitives: EdgeFetchPrimitives,
): void {
  for (const key of ['Headers', 'Request', 'Response', 'FormData', 'File', 'Blob'] as const) {
    if (typeof globalThis[key] === 'undefined') {
      defineGlobal(key, primitives[key]);
    }
  }
}
