// app/analizy/[slug]/page.tsx
import fs from "fs";
import path from "path";
import Image from "next/image";
import Link from "next/link";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import ArticleLayout from "@/components/ArticleLayout";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const runtime = "nodejs";     // używamy fs/path – potrzebny runtime Node
export const revalidate = 3600;      // opcjonalnie: ISR 1h

function replacePlaceholders(
  str: string | undefined,
  placeholders: Record<string, string>
): string {
  if (!str) return "";
  return str.replace(/{{(.*?)}}/g, (_, key) => placeholders[key.trim()] ?? "");
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Next.js 15: params jest Promise → await
  const { slug } = await params;
  if (!slug) notFound();

  // 1) DB
  const analysis = await prisma.analysis.findUnique({
    where: { slug },
    include: { author: true },
  });
  if (!analysis) notFound();

  // 2) MDX z /posts/<slug>.mdx
  const filePath = path.join(process.cwd(), "posts", `${slug}.mdx`);
  if (!fs.existsSync(filePath)) notFound();

  const source = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(source);

  // 3) Placeholdery
  const placeholders: Record<string, string> = {
    analysisTitle: analysis.title ?? "",
    authorName: analysis.author?.name ?? "",
    authorBio: analysis.author?.bio ?? "",
  };

  const replacedContent = replacePlaceholders(content, placeholders);
  const title =
    (data as any).title
      ? replacePlaceholders((data as any).title, placeholders)
      : analysis.title ?? slug;

  const lead =
    (data as any).lead
      ? replacePlaceholders((data as any).lead, placeholders)
      : undefined;

  const author =
    (data as any).author
      ? replacePlaceholders((data as any).author, placeholders)
      : analysis.author?.name ?? "";

  // 4) Render
  return (
    <main>
      <Header />

      <ArticleLayout
        title={title ?? "Artykuł"}
        date={(data as any).date}
        author={author}
        lead={lead}
        breadcrumbs={[
          { label: "Strona główna", href: "/" },
          { label: "Analizy", href: "/analizy" },
          { label: title ?? slug, active: true },
        ]}
      >
        <MDXRemote source={replacedContent} components={{ Link, Image }} />
      </ArticleLayout>

      <Footer />
    </main>
  );
}

// (opcjonalnie) pre-render znanych slugów
export async function generateStaticParams() {
  const rows = await prisma.analysis.findMany({ select: { slug: true } });
  return rows.map(({ slug }) => ({ slug }));
}
