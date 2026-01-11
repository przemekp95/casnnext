export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db";
import { initializeDatabase } from "@/lib/init-db";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({ error: "Build time - API unavailable" }, { status: 503 });
    }

    // Ensure database is initialized
    if (AppDataSource && !AppDataSource.isInitialized) {
      await initializeDatabase();
    }

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const analysisRepository = AppDataSource.getRepository('Analysis');
    const analysis = await analysisRepository.findOne({
      where: { slug },
      relations: ['author'],
      select: {
        id: true,
        slug: true,
        title: true,
        author: {
          name: true,
          bio: true,
        },
      },
    });

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}