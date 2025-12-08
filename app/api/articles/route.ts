import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

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
    // Skip Prisma during build time - return empty array for build
    if (process.env.NEXT_PHASE === 'phase-production-build' || !prisma) {
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
          const data = await prisma!.analysis.findMany({
            include: {
              author: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
            orderBy: {
              id: 'desc',
            },
          });

          // Transform to match existing API format
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const data = await prisma.analysis.findMany({
        include: {
          author: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      });

          // Transform to match existing API format
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          articles = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        authorId: item.authorId,
        author_name: item.author.name,
        author_slug: item.author.slug,
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
  // Skip Prisma during build time - return error for build
  if (process.env.NEXT_PHASE === 'phase-production-build' || !prisma) {
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

  let authorId: number | null = null;
  const { title, slug } = body as PostBodyBase;

  if (isBodyWithId(body)) {
    authorId = body.authorId;
  } else if (isBodyWithSlug(body)) {
    const author = await prisma.author.findUnique({
      where: { slug: body.authorSlug },
      select: { id: true },
    });
    if (author) authorId = author.id;
  }

  if (!authorId) {
    return NextResponse.json(
      { error: "authorId or authorSlug required" },
      { status: 400 }
    );
  }

  const newArticle = await prisma.analysis.create({
    data: {
      title,
      slug,
      authorId,
    },
    include: {
      author: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  // Invalidate cache when new article is added (only in production)
  if (typeof revalidateTag !== 'undefined' && process.env.NODE_ENV !== 'test') {
    revalidateTag('articles');
  }

  // Transform to match existing API format
  const article = {
    id: newArticle.id,
    title: newArticle.title,
    slug: newArticle.slug,
    authorId: newArticle.authorId,
    author_name: newArticle.author.name,
    author_slug: newArticle.author.slug,
  };

  return NextResponse.json(article, { status: 201 });
}
