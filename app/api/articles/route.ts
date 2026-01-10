/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { AppDataSource, isDatabaseConfigured } from "@/lib/db";
import { initializeDatabase } from "@/lib/init-db";

// Typy danych
type ArticleRow = {
  id: number;
  title: string;
  slug: string;
  authorId: number;
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
  return (
    isPostBodyBase(x) && typeof y.authorSlug === "string" && y.authorSlug.length > 0
  );
}

// GET: pobiera wszystkie artykuły
export async function GET() {
  try {
    // Skip during build time - return empty array for build
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json([], {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'max-age=300',
        },
      });
    }

    // Skip if database is not configured
    if (!isDatabaseConfigured()) {
      return NextResponse.json([], {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'max-age=300',
        },
      });
    }

    // Ensure database is initialized
    try {
      if (AppDataSource && !AppDataSource.isInitialized) {
        await initializeDatabase();
      }
    } catch (error) {
      console.error('Database initialization failed in GET:', error);
      return NextResponse.json([], {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'max-age=300',
        },
      });
    }

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json([], {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'max-age=300',
        },
      });
    }

    // Use caching only in production Next.js runtime, not in tests
    let articles: ArticleRow[];
    if (typeof unstable_cache !== 'undefined' && process.env.NODE_ENV !== 'test') {
      const getArticlesCached = unstable_cache(
        async () => {
          const analysisRepository = AppDataSource.getRepository('Analysis');
          const data = await analysisRepository
            .createQueryBuilder('analysis')
            .leftJoin('Author', 'author', 'author.id = analysis.authorId')
            .select([
              'analysis.id',
              'analysis.title',
              'analysis.slug',
              'analysis.authorId',
              'author.name as author_name',
              'author.slug as author_slug'
            ])
            .orderBy('analysis.id', 'DESC')
            .getRawMany();

          // Transform to match existing API format
          return data.map((item: any) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            authorId: item.authorId,
            author_name: item.author.name,
            author_slug: item.author.slug,
          }));
        },
        ['articles'],
        {
          revalidate: 300, // Cache for 5 minutes
          tags: ['articles']
        }
      );
      articles = await getArticlesCached();
    } else {
      // Direct query for tests or when caching unavailable
      const analysisRepository = AppDataSource.getRepository('Analysis');
      const data = await analysisRepository
        .createQueryBuilder('analysis')
        .leftJoin('Author', 'author', 'author.id = analysis.authorId')
        .select([
          'analysis.id',
          'analysis.title',
          'analysis.slug',
          'analysis.authorId',
          'author.name as author_name',
          'author.slug as author_slug'
        ])
        .orderBy('analysis.id', 'DESC')
        .getRawMany();

      articles = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        authorId: item.authorId,
        author_name: item.author_name,
        author_slug: item.author_slug,
      }));
    }

    return NextResponse.json(articles, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'max-age=300',
      },
    });
  } catch (error) {
    console.error('Articles API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: dodaje nowy artykuł
export async function POST(req: Request) {
  // Skip during build time - return error for build
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return NextResponse.json({ error: "Build time - API unavailable" }, { status: 503 });
  }

  // Skip if database is not configured
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
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

  let authorId: number | null = null;
  const { title, slug } = body as PostBodyBase;

  if (isBodyWithId(body)) {
    authorId = body.authorId;
  } else if (isBodyWithSlug(body)) {
    // Ensure database is initialized
    try {
      if (AppDataSource && !AppDataSource.isInitialized) {
        await initializeDatabase();
      }
    } catch (error) {
      console.error('Database initialization failed in POST:', error);
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    if (!AppDataSource || !AppDataSource.isInitialized) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const authorRepository = AppDataSource.getRepository('Author');
    const author = await authorRepository.findOne({
      where: { slug: body.authorSlug },
      select: ['id'],
    });
    if (author) authorId = author.id;
  }

  if (!authorId) {
    return NextResponse.json(
      { error: "authorId or authorSlug required" },
      { status: 400 }
    );
  }

  // Ensure database is initialized for saving
  try {
    if (AppDataSource && !AppDataSource.isInitialized) {
      await initializeDatabase();
    }
  } catch (error) {
    console.error('Database initialization failed in POST save:', error);
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  if (!AppDataSource || !AppDataSource.isInitialized) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  const analysisRepository = AppDataSource.getRepository('Analysis');
  const newArticle = await analysisRepository.save({
    title,
    slug,
    authorId,
  });

  // Load the author data for the response using query builder
  const articleWithAuthor = await analysisRepository
    .createQueryBuilder('analysis')
    .leftJoin('Author', 'author', 'author.id = analysis.authorId')
    .select([
      'analysis.id',
      'analysis.title',
      'analysis.slug',
      'analysis.authorId',
      'author.name as author_name',
      'author.slug as author_slug'
    ])
    .where('analysis.id = :id', { id: newArticle.id })
    .getRawOne();

  // Invalidate cache when new article is added (only in production)
  if (typeof revalidateTag !== 'undefined' && process.env.NODE_ENV !== 'test') {
    revalidateTag('articles', 'next');
  }

  // Transform to match existing API format
  const article = {
    id: articleWithAuthor.id,
    title: articleWithAuthor.title,
    slug: articleWithAuthor.slug,
    authorId: articleWithAuthor.authorId,
    author_name: articleWithAuthor.author_name,
    author_slug: articleWithAuthor.author_slug,
  };

  return NextResponse.json(article, { status: 201 });
}