import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PostBodyBase = { title: string; slug: string };
type BodyWithId = PostBodyBase & { authorId: number };
type BodyWithSlug = PostBodyBase & { authorSlug: string };

function isPostBodyBase(x: unknown): x is PostBodyBase {
  const y = x as Partial<PostBodyBase>;
  return typeof y?.title === 'string' && typeof y?.slug === 'string';
}
function isBodyWithId(x: unknown): x is BodyWithId {
  const y = x as Partial<BodyWithId>;
  return isPostBodyBase(x) && typeof y.authorId === 'number';
}
function isBodyWithSlug(x: unknown): x is BodyWithSlug {
  const y = x as Partial<BodyWithSlug>;
  return isPostBodyBase(x) && typeof y.authorSlug === 'string' && y.authorSlug.length > 0;
}

export async function GET() {
  const articles = await prisma.analysis.findMany({
    orderBy: { id: 'desc' },
    include: { author: true }
  });
  return NextResponse.json(articles, { status: 200 });
}

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!isPostBodyBase(body)) {
    return NextResponse.json({ error: 'title, slug required' }, { status: 400 });
  }

  let authorId: number | null = null;
  let title: string;
  let slug: string;

  if (isBodyWithId(body)) {
    ({ title, slug } = body);
    authorId = body.authorId;
  } else if (isBodyWithSlug(body)) {
    ({ title, slug } = body);
    const author = await prisma.author.findUnique({ where: { slug: body.authorSlug } });
    if (author) authorId = author.id;
  } else {
    return NextResponse.json({ error: 'authorId or authorSlug required' }, { status: 400 });
  }

  if (!authorId) {
    return NextResponse.json({ error: 'authorId or authorSlug required' }, { status: 400 });
  }

  const article = await prisma.analysis.create({
    data: {
      title,
      slug,
      author: { connect: { id: authorId } }
    },
    include: { author: true }
  });

  return NextResponse.json(article, { status: 201 });
}
