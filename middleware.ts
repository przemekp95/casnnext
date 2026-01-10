import { NextRequest, NextResponse } from 'next/server';
import { AppDataSource } from '@/lib/db';

export async function middleware(request: NextRequest) {
  // Ensure database is initialized for all requests
  if (!AppDataSource.isInitialized) {
    try {
      await AppDataSource.initialize();
      console.log('Database initialized in middleware');
    } catch (error) {
      console.error('Database initialization failed:', error);
      // Continue anyway - let the application handle database errors gracefully
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return NextResponse.next();
}

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