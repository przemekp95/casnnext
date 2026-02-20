export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuthors } from "@/lib/authors";

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    const authors = await getAuthors();
    return NextResponse.json(authors);
  } catch (error) {
    console.error('Authors API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
