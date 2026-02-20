export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuthorBySlug } from "@/lib/authors";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({ error: "Build time - API unavailable" }, { status: 503 });
    }

    const result = await getAuthorBySlug(slug);
    if (!result) {
      return NextResponse.json({ error: "Author not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Author API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
