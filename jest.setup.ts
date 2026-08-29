import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import {
  defineGlobal,
  installEdgeFetchPrimitives,
  type EdgeFetchPrimitives,
} from './test/setup/edge-fetch-primitives';

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

// Next's compiled fetch implementation expects the stream globals above to exist
// when the module is evaluated.
const edge = jest.requireActual<EdgeFetchPrimitives>(
  'next/dist/compiled/@edge-runtime/primitives/fetch',
);
installEdgeFetchPrimitives(edge);

// Mock fetch for unit tests
const mockedFetch = jest.fn<typeof fetch>();
defineGlobal('fetch', mockedFetch as typeof fetch);

afterAll(async () => {
  // Importing the canonical datasource does not initialize it. Integration
  // suites that initialized it are responsible for leaving no open handles.
  const { AppDataSource } = await import('@/lib/db.shared');
  if (AppDataSource?.isInitialized && typeof AppDataSource.destroy === 'function') {
    await AppDataSource.destroy();
  }
});
