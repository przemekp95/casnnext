export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db.server";
import { initializeDatabase } from "@/lib/init-db";
import { AuthorSchema, AnalysisSchema } from "@/lib/entities";

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

    const authorRepository = AppDataSource.getRepository(AuthorSchema);
    const author = await authorRepository.findOne({
      where: { slug },
    });

    if (!author) {
      return NextResponse.json({ error: "Author not found" }, { status: 404 });
    }

    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const analyses = await analysisRepository.find({
      where: { authorId: author.id },
      order: { id: 'DESC' },
      select: ['id', 'title', 'slug'],
    });

    return NextResponse.json({ author, analyses });
  } catch (error) {
    console.error('Author API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}