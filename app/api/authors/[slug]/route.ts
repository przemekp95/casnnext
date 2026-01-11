export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db";
import { initializeDatabase } from "@/lib/init-db";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  try {
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

    const authorRepository = AppDataSource.getRepository('Author');
    const author = await authorRepository.findOne({
      where: { slug: params.slug },
    });

    if (!author) {
      return NextResponse.json({ error: "Author not found" }, { status: 404 });
    }

    const analysisRepository = AppDataSource.getRepository('Analysis');
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