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

// Set test environment (this is safe in jest setup)
Object.defineProperty(process.env, 'NODE_ENV', {
  value: 'test',
  writable: false,
});

// Polyfills for Next.js cache functionality in tests
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = ReadableStream;
}

if (typeof global.WritableStream === 'undefined') {
  global.WritableStream = WritableStream;
}

if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = TransformStream;
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

  if (typeof global.Headers === 'undefined') global.Headers = edgeFetch.Headers;
  if (typeof global.Request === 'undefined') global.Request = edgeFetch.Request;
  if (typeof global.Response === 'undefined') global.Response = edgeFetch.Response;
  if (typeof global.FormData === 'undefined') global.FormData = edgeFetch.FormData;
  if (typeof global.File === 'undefined') global.File = edgeFetch.File;
  if (typeof global.Blob === 'undefined') global.Blob = edgeFetch.Blob;
}

// Mock fetch for unit tests
if (typeof global.fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = jest.fn() as any;
}

afterAll(async () => {
  try {
    // Some integration tests initialize the shared TypeORM datasource and rely on Jest config
    // to force-exit the process. Tear it down explicitly so Jest can exit cleanly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppDataSource } = require('./lib/db.shared') as {
      AppDataSource?: { isInitialized?: boolean; destroy?: () => Promise<void> };
    };

    if (AppDataSource?.isInitialized) {
      await AppDataSource.destroy?.();
    }
  } catch {
    // Ignore teardown failures for test files that never touched the datasource.
  }
});
