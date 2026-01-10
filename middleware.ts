import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/init-db';

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function middleware(request: NextRequest) {
  // Ensure database is initialized for all requests
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Database initialization failed in middleware:', error);
    // Continue anyway - let the application handle database errors gracefully
  }

  return NextResponse.next();
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/health (health check endpoint)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/health|_next/static|_next/image|favicon.ico).*)',
  ],
};