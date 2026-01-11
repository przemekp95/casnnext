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
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve('')
  })) as any;
}