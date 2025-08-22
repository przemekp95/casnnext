import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.analysis.findMany({
    include: { author: true },
    orderBy: { id: "desc" }, // albo publishedAt jeśli dodasz do schemy
  });
  return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=60" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title || !body?.slug) {
    return NextResponse.json({ error: "title, slug required" }, { status: 400 });
  }
  const article = await prisma.analysis.create({
    data: {
      title: body.title,
      slug: body.slug,
      authorId: body.authorId, // 👈 wymagane w modelu Analysis
    },
  });
  return NextResponse.json(article, { status: 201 });
}
