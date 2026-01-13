// Public barrel export for database utilities
// This provides a clean public API while maintaining server/client separation

// Temporarily disable re-export to test if this is causing Cypress issues
// export * from './db.server';

// Instead, provide explicit exports that are safe for client-side imports
export const isDatabaseConfigured = () => {
  // Client-safe version that doesn't import server code
  return typeof window === 'undefined'; // Always false on client
};

// Note: Other database functions are server-only and should be imported directly from db.server in server contexts