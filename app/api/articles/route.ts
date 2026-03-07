/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db.server";
import { AuthorSchema, AnalysisSchema } from "@/lib/entities";
import { getAnalyses } from "@/lib/analyses";
import { isStrapiProvider } from "@/lib/content-provider";
import {
  createCmsAnalysis,
  fetchCmsAuthorByLegacyId,
  fetchCmsAuthorBySlug,
} from "@/lib/cms/strapi-client";
import { applyAuthorCanonicalOverrides } from "@/lib/server/author-overrides";

type ArticleRow = {
  id: number | string;
  title: string;
  slug: string;
  authorId: number | string;
  author_name: string | null;
  author_slug: string | null;
};

type PostBodyBase = { title: string; slug: string };
type BodyWithId = PostBodyBase & { authorId: number };
type BodyWithSlug = PostBodyBase & { authorSlug: string };

function isPostBodyBase(x: unknown): x is PostBodyBase {
  const y = x as Partial<PostBodyBase>;
  return typeof y?.title === "string" && typeof y?.slug === "string";
}

function isBodyWithId(x: unknown): x is BodyWithId {
  const y = x as Partial<BodyWithId>;
  return isPostBodyBase(x) && typeof y.authorId === "number";
}

function isBodyWithSlug(x: unknown): x is BodyWithSlug {
  const y = x as Partial<BodyWithSlug>;
  return isPostBodyBase(x) && typeof y.authorSlug === "string" && y.authorSlug.length > 0;
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
  if (!AppDataSource || !AppDataSource.isInitialized) return [];

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

async function getStrapiArticles(): Promise<ArticleRow[]> {
  const analyses = await getAnalyses();
  return analyses
    .map((analysis) => ({
      id: analysis.id,
      title: analysis.title,
      slug: analysis.slug,
      authorId: analysis.authorId,
      author_name: analysis.author?.name || null,
      author_slug: analysis.author?.slug || null,
    }))
    .map(normalizeArticleAuthor);
}

export async function GET() {
  try {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return responseWithCache([]);
    }

    const articles = isStrapiProvider() ? await getStrapiArticles() : await getLegacyArticles();
    return responseWithCache(articles);
  } catch (error) {
    console.error("Articles API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  let author = null;
  if (isBodyWithId(body)) {
    author = await fetchCmsAuthorByLegacyId(body.authorId);
  } else if (isBodyWithSlug(body)) {
    author = await fetchCmsAuthorBySlug(body.authorSlug);
  }

  if (!author) {
    return NextResponse.json({ error: "authorId or authorSlug required" }, { status: 400 });
  }

  const created = await createCmsAnalysis({
    title: body.title,
    slug: body.slug,
    authorStrapiId: author.id,
  });

  if (typeof revalidateTag !== "undefined" && process.env.NODE_ENV !== "test") {
    revalidateTag("articles", "next");
    revalidateTag("analyses", "next");
  }

  return NextResponse.json(
    {
      id: created.id,
      title: created.title,
      slug: created.slug,
      authorId: author.legacyId ?? author.id,
      author_name: author.name,
      author_slug: author.slug,
    },
    { status: 201 }
  );
}

async function createLegacyArticle(body: PostBodyBase | BodyWithId | BodyWithSlug) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  if (!AppDataSource || !AppDataSource.isInitialized) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  let authorId: number | null = null;
  if (isBodyWithId(body)) {
    authorId = body.authorId;
  } else if (isBodyWithSlug(body)) {
    const authorRepository = AppDataSource.getRepository(AuthorSchema);
    const author = await authorRepository.findOne({
      where: { slug: body.authorSlug },
      select: ["id"],
    });
    if (author) authorId = author.id as number;
  }

  if (!authorId) {
    return NextResponse.json({ error: "authorId or authorSlug required" }, { status: 400 });
  }

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const newArticle = await analysisRepository.save({
    title: body.title,
    slug: body.slug,
    authorId,
  });

  const articleWithAuthor = await analysisRepository
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
    .where("analysis.id = :id", { id: newArticle.id })
    .getRawOne();

  if (typeof revalidateTag !== "undefined" && process.env.NODE_ENV !== "test") {
    revalidateTag("articles", "next");
  }

  return NextResponse.json(
    normalizeArticleAuthor({
      id: articleWithAuthor.id,
      title: articleWithAuthor.title,
      slug: articleWithAuthor.slug,
      authorId: articleWithAuthor.authorId as number,
      author_name: articleWithAuthor.author_name,
      author_slug: articleWithAuthor.author_slug,
    }),
    { status: 201 }
  );
}

async function createStrapiArticle(body: PostBodyBase | BodyWithId | BodyWithSlug) {
  if (!process.env.STRAPI_API_TOKEN) {
    return NextResponse.json(
      { error: "STRAPI_API_TOKEN is required to create articles in Strapi mode" },
      { status: 503 }
    );
  }

  let author = null;
  if (isBodyWithId(body)) {
    author = await fetchCmsAuthorByLegacyId(body.authorId);
  } else if (isBodyWithSlug(body)) {
    author = await fetchCmsAuthorBySlug(body.authorSlug);
  }

  if (!author) {
    return NextResponse.json({ error: "authorId or authorSlug required" }, { status: 400 });
  }

  const created = await createCmsAnalysis({
    title: body.title,
    slug: body.slug,
    authorStrapiId: author.id,
  });

  if (typeof revalidateTag !== "undefined" && process.env.NODE_ENV !== "test") {
    revalidateTag("articles", "next");
    revalidateTag("analyses", "next");
  }

  return NextResponse.json(
    normalizeArticleAuthor({
      id: created.id,
      title: created.title,
      slug: created.slug,
      authorId: author.legacyId ?? author.id,
      author_name: author.name,
      author_slug: author.slug,
    }),
    { status: 201 }
  );
}

export async function POST(req: Request) {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ error: "Build time - API unavailable" }, { status: 503 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!isPostBodyBase(body)) {
    return NextResponse.json({ error: "title, slug required" }, { status: 400 });
  }

  try {
    if (isStrapiProvider()) {
      return await createStrapiArticle(body);
    }

    return await createLegacyArticle(body);
  } catch (error) {
    console.error("Articles POST API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
