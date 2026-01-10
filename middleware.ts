import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/init-db';

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function middleware(request: NextRequest) {
  // Skip database initialization during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return NextResponse.next();
  }

  // Only initialize database for API routes that need it, not for static pages
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/') && !request.nextUrl.pathname.startsWith('/api/health');

  if (isApiRoute && (process.env.DB_HOST || process.env.DATABASE_URL)) {
    try {
      await initializeDatabase();
    } catch (error) {
      console.error('Database initialization failed in middleware:', error);
      // Continue anyway - let the application handle database errors gracefully
    }
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