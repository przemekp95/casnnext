import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Set test environment
process.env.NODE_ENV = 'test';

// Polyfills for Next.js cache functionality in tests
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}