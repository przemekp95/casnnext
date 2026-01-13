// Client-safe database utilities
// These can be safely imported in client components

/**
 * Check if database is configured (client-safe version)
 * Always returns false on client side for security
 */
export const isDatabaseConfigured = (): boolean => {
  // Client-side: always false for security
  // Server-side: would check environment variables
  return false;
};