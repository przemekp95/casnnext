/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";
import { AnalysisSchema } from "@/lib/entities";
import { applyAuthorCanonicalOverrides } from "@/lib/server/author-overrides";

type ArticleRow = {
  id: number | string;
  title: string;
  slug: string;
  authorId: number | string;
  author_name: string | null;
  author_slug: string | null;
};

function responseWithCache(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "CDN-Cache-Control": "max-age=300",
    },
  });
}

function normalizeArticleAuthor(row: ArticleRow): ArticleRow {
  const normalized = applyAuthorCanonicalOverrides({
    slug: row.author_slug,
    name: row.author_name,
    displayName: row.author_name,
  });

  return {
    ...row,
    author_name: normalized.displayName ?? normalized.name ?? row.author_name,
  };
}

async function getLegacyArticles(): Promise<ArticleRow[]> {
  if (!isDatabaseConfigured()) return [];
  if (!AppDataSource) return [];
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  if (typeof unstable_cache !== "undefined" && process.env.NODE_ENV !== "test") {
    const getArticlesCached = unstable_cache(
      async () => {
        const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
        const data = await analysisRepository
          .createQueryBuilder("analysis")
          .leftJoin("Author", "author", "author.id = analysis.authorId")
          .select([
            "analysis.id AS id",
            "analysis.title AS title",
            "analysis.slug AS slug",
            "analysis.authorId AS authorId",
            "author.name as author_name",
            "author.slug as author_slug",
          ])
          .where("analysis.publishedAt IS NOT NULL")
          .orderBy("analysis.id", "DESC")
          .getRawMany();

        return data
          .map((item: any) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            authorId: item.authorId as number,
            author_name: item.author_name,
            author_slug: item.author_slug,
          }))
          .map(normalizeArticleAuthor);
      },
      ["articles"],
      { revalidate: 300, tags: ["articles"] }
    );

    return getArticlesCached();
  }

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const data = await analysisRepository
    .createQueryBuilder("analysis")
    .leftJoin("Author", "author", "author.id = analysis.authorId")
    .select([
      "analysis.id AS id",
      "analysis.title AS title",
      "analysis.slug AS slug",
      "analysis.authorId AS authorId",
      "author.name as author_name",
      "author.slug as author_slug",
    ])
    .where("analysis.publishedAt IS NOT NULL")
    .orderBy("analysis.id", "DESC")
    .getRawMany();

  return data
    .map((item: any) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      authorId: item.authorId as number,
      author_name: item.author_name,
      author_slug: item.author_slug,
    }))
    .map(normalizeArticleAuthor);
}

export async function GET() {
  try {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return responseWithCache([]);
    }

    const articles = await getLegacyArticles();
    return responseWithCache(articles);
  } catch (error) {
    console.error("Articles API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
