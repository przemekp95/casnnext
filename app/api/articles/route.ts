import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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
  const articles = await query<ArticleRow>(
    `SELECT a.id, a.title, a.slug, a.authorId,
            au.name AS author_name, au.slug AS author_slug
     FROM analysis a
     LEFT JOIN author au ON a.authorId = au.id
     ORDER BY a.id DESC`
  );
  return NextResponse.json(articles, { status: 200 });
}

// POST: dodaje nowy artykuł
export async function POST(req: Request) {
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
    const author = await query<{ id: number }>(
      `SELECT id FROM author WHERE slug = ? LIMIT 1`,
      [body.authorSlug]
    );
    if (author.length > 0) authorId = author[0].id;
  }

  if (!authorId) {
    return NextResponse.json(
      { error: "authorId or authorSlug required" },
      { status: 400 }
    );
  }

  await query(
    `INSERT INTO analysis (title, slug, authorId) VALUES (?, ?, ?)`,
    [title, slug, authorId]
  );

  const article = await query<ArticleRow>(
    `SELECT a.id, a.title, a.slug, a.authorId,
            au.name AS author_name, au.slug AS author_slug
     FROM analysis a
     LEFT JOIN author au ON a.authorId = au.id
     WHERE a.slug = ? LIMIT 1`,
    [slug]
  );

  return NextResponse.json(article[0], { status: 201 });
}
