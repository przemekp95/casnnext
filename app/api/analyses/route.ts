export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAnalyses } from "@/lib/analyses";

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    const analyses = await getAnalyses();
    return NextResponse.json(analyses);
  } catch (error) {
    console.error('Analyses API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
