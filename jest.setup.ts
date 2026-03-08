import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';

type EdgeFetchPrimitives = {
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
  FormData: typeof FormData;
  File: typeof File;
  Blob: typeof Blob;
};

function defineGlobal(key: PropertyKey, value: unknown) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

// Set test environment (this is safe in jest setup)
Object.defineProperty(process.env, 'NODE_ENV', {
  value: 'test',
  writable: false,
});

// Polyfills for Next.js cache functionality in tests
if (typeof globalThis.TextEncoder === 'undefined') {
  defineGlobal('TextEncoder', TextEncoder);
}

if (typeof globalThis.TextDecoder === 'undefined') {
  defineGlobal('TextDecoder', TextDecoder);
}

if (typeof globalThis.ReadableStream === 'undefined') {
  defineGlobal('ReadableStream', ReadableStream);
}

if (typeof globalThis.WritableStream === 'undefined') {
  defineGlobal('WritableStream', WritableStream);
}

if (typeof globalThis.TransformStream === 'undefined') {
  defineGlobal('TransformStream', TransformStream);
}

if (
  typeof global.Headers === 'undefined' ||
  typeof global.Request === 'undefined' ||
  typeof global.Response === 'undefined' ||
  typeof global.FormData === 'undefined' ||
  typeof global.File === 'undefined' ||
  typeof global.Blob === 'undefined'
) {
  // Next bundles stable fetch primitives for environments like Jest + JSDOM.
  // Keep fetch mocked below, but expose the request/response classes expected by app-router code.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const edgeFetch = require('next/dist/compiled/@edge-runtime/primitives/fetch') as EdgeFetchPrimitives;

  if (typeof globalThis.Headers === 'undefined') defineGlobal('Headers', edgeFetch.Headers);
  if (typeof globalThis.Request === 'undefined') defineGlobal('Request', edgeFetch.Request);
  if (typeof globalThis.Response === 'undefined') defineGlobal('Response', edgeFetch.Response);
  if (typeof globalThis.FormData === 'undefined') defineGlobal('FormData', edgeFetch.FormData);
  if (typeof globalThis.File === 'undefined') defineGlobal('File', edgeFetch.File);
  if (typeof globalThis.Blob === 'undefined') defineGlobal('Blob', edgeFetch.Blob);
}

// Mock fetch for unit tests
if (typeof global.fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = jest.fn() as any;
}

afterAll(async () => {
  const teardownCandidates = [
    './lib/db.shared',
    './lib/db.node',
  ] as const;

  for (const modulePath of teardownCandidates) {
    try {
      // Integration suites can initialize either the shared app datasource or the
      // standalone bootstrap datasource. Tear both down so Jest can exit cleanly.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppDataSource } = require(modulePath) as {
        AppDataSource?: { isInitialized?: boolean; destroy?: () => Promise<void> };
      };

      if (AppDataSource?.isInitialized) {
        await AppDataSource.destroy?.();
      }
    } catch {
      // Ignore teardown failures for test files that never touched the datasource.
    }
  }
});
