import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

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

// Mock fetch for unit tests
if (typeof global.fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = jest.fn() as any;
}