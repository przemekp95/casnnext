import { NextRequest, NextResponse } from 'next/server';
// import { initializeDatabase } from '@/lib/init-db';

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function middleware(request: NextRequest) {
  // Temporarily disable database initialization to test if middleware is causing issues
  // Skip database initialization during build time
  // if (process.env.NEXT_PHASE === 'phase-production-build') {
  //   return NextResponse.next();
  // }

  // Only initialize database for actual runtime requests when database is configured
  // if (process.env.DB_HOST || process.env.DATABASE_URL) {
  //   try {
  //     await initializeDatabase();
  //   } catch (error) {
  //     console.error('Database initialization failed in middleware:', error);
  //     // Continue anyway - let the application handle database errors gracefully
  //   }
  // }

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