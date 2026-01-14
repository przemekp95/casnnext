export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { AppDataSource } from "@/lib/db.server";
import { AuthorSchema } from "@/lib/entities";

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json([]);
    }

    const authorRepository = AppDataSource.getRepository(AuthorSchema);
    const authors = await authorRepository.find({
      order: { name: 'ASC' },
    });

    return NextResponse.json(authors);
  } catch (error) {
    console.error('Authors API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}