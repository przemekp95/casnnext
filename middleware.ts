import { NextRequest, NextResponse } from 'next/server';

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function middleware(request: NextRequest) {
  // Database initialization has been moved to API routes that actually need it
  // This prevents TypeORM from being bundled into the Edge runtime

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