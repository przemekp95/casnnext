import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" as const },
  });
  return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=60" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title || !body?.slug || !body?.contentMd) {
    return NextResponse.json({ error: "title, slug, contentMd required" }, { status: 400 });
  }
  const article = await prisma.article.create({
    data: {
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt ?? null,
      contentMd: body.contentMd,
      tags: Array.isArray(body.tags) ? body.tags : [],
      published: !!body.published,
      publishedAt: body.published ? new Date() : null,
    },
  });
  return NextResponse.json(article, { status: 201 });
}
