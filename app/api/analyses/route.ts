export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db.server";
import { initDatabase } from "@/lib/server/db";
import { AnalysisSchema } from "@/lib/entities";

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    // Ensure database is initialized
    await initDatabase();

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json([]);
    }

    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const analyses = await analysisRepository.find({
      relations: ['author'],
      order: { id: 'DESC' },
    });

    return NextResponse.json(analyses);
  } catch (error) {
    console.error('Analyses API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}