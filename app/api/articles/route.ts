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

type ArticleRawRow = {
  id: string;
  title: string;
  slug: string;
  authorId: string | null;
  author_name: string | null;
  author_slug: string | null;
};

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isArticleIdentifier(value: unknown): value is number | string {
  return typeof value === "number" || typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function toArticleResponse(value: unknown): ArticleRow {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid article record");
  }

  const row = value as Record<string, unknown>;
  const { id, title, slug, authorId, author_name, author_slug } = row;
  if (
    !isArticleIdentifier(id) ||
    typeof title !== "string" ||
    typeof slug !== "string" ||
    !isArticleIdentifier(authorId) ||
    !isNullableString(author_name) ||
    !isNullableString(author_slug)
  ) {
    throw new Error("Invalid article record");
  }

  return {
    id,
    title,
    slug,
    authorId,
    author_name,
    author_slug,
  };
}

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
          .getRawMany<ArticleRawRow>();

        return data.map(toArticleResponse).map(normalizeArticleAuthor);
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
    .getRawMany<ArticleRawRow>();

  return data.map(toArticleResponse).map(normalizeArticleAuthor);
}

export async function GET() {
  try {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return responseWithCache([]);
    }

    const articles = await getLegacyArticles();
    return responseWithCache(articles);
  } catch (error) {
    console.error("Articles API error:", errorMessage(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
