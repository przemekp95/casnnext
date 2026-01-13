// Public barrel export for database utilities
// This provides a clean public API while maintaining strict server/client separation

// Client-safe exports only
export * from './db.client';

// Note: Server-only database functions should be imported directly from './db.server'
// in server contexts (pages, API routes, server components) only.