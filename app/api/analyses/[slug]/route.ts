export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db";
import { initializeDatabase } from "@/lib/init-db";
import { AnalysisSchema } from "@/lib/entities";

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

    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const analysis = await analysisRepository
      .createQueryBuilder('analysis')
      .leftJoin('Author', 'author', 'author.id = analysis.authorId')
      .select([
        'analysis.id',
        'analysis.title',
        'analysis.slug',
        'author.name as author_name',
        'author.bio as author_bio'
      ])
      .where('analysis.slug = :slug', { slug })
      .getRawOne();

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Transform to match expected format
    const result = {
      id: analysis.id,
      title: analysis.title,
      slug: analysis.slug,
      author: {
        name: analysis.author_name,
        bio: analysis.author_bio,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}