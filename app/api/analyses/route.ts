export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db";
import { initializeDatabase } from "@/lib/init-db";

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    // Ensure database is initialized
    if (AppDataSource && !AppDataSource.isInitialized) {
      await initializeDatabase();
    }

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json([]);
    }

    const analysisRepository = AppDataSource.getRepository('Analysis');
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