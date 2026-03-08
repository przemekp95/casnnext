import matter from "gray-matter";
import { NextResponse } from "next/server";
import { stripMarkdown, createExcerpt } from "@/lib/searchUtils";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";
import { AnalysisSchema } from "@/lib/entities";
import { AuthorEntity } from "@/lib/entities/Author";
import { IsNull, Not } from "typeorm";

// Typy dla indeksu wyszukiwania
interface SearchIndexItem {
  slug: string;
  title: string;
  author: string;
  date: string;
  excerpt: string;
  content: string;
}

function toDateValue(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    // Skip during build time
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([]);
    }

    // Skip if database is not configured - public runtime depends on DB data.
    if (!isDatabaseConfigured()) {
      return NextResponse.json([]);
    }

    if (!AppDataSource) {
      return NextResponse.json([]);
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
    const analyses = await analysisRepository.find({
      relations: ['author'],
      where: {
        publishedAt: Not(IsNull()),
      },
      order: { id: 'DESC' },
    });

    const searchIndex: SearchIndexItem[] = [];

    for (const analysis of analyses) {
      try {
        const slug = analysis.slug;
        const source = analysis.contentMdx || "";
        const parsed = source.trim().startsWith("---")
          ? matter(source)
          : { content: source };
        const title = analysis.title;
        const author = (analysis.author as AuthorEntity)?.name || "Nieznany autor";
        const content = parsed.content || "";
        const cleanContent = stripMarkdown(content);
        const excerpt = createExcerpt(content, 200);
        const date = toDateValue(analysis.date);

        searchIndex.push({
          slug,
          title,
          author,
          date,
          excerpt,
          content: cleanContent
        });

      } catch (error) {
        console.error(`Error processing search index entry ${analysis.slug}:`, error);
      }
    }

    searchIndex.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(searchIndex);

  } catch (error) {
    console.error("Error generating search index:", error);
    return NextResponse.json([]);
  }
}
