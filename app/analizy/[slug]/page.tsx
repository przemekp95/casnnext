// app/analizy/[slug]/page.tsx
import fs from "fs";
import path from "path";
import Image from "next/image";
import Link from "next/link";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import ArticleLayout from "@/components/ArticleLayout";
import Header from "@/components/Header";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";       // używasz fs/prisma → Node runtime
export const revalidate = 3600;        // ISR 1h (opcjonalnie)

type PageParams = { slug: string };

function replacePlaceholders(str: string | undefined, placeholders: Record<string, string>): string {
  if (!str) return "";
  return str.replace(/{{(.*?)}}/g, (_, key) => placeholders[key.trim()] ?? "");
}

export default async function Page({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  if (!slug) return notFound();

  const analysis = await prisma.analysis.findUnique({
    where: { slug },
    include: { author: true },
  });
  if (!analysis) return notFound();

  const filePath = path.join(process.cwd(), "posts", `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return notFound();

  const source = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(source);

  const placeholders: Record<string, string> = {
    analysisTitle: analysis.title ?? "",
    authorName: analysis.author?.name ?? "",
    authorBio: analysis.author?.bio ?? "",
  };

  const replacedContent = replacePlaceholders(content, placeholders);
  const title  = data.title  ? replacePlaceholders(data.title, placeholders)  : analysis.title;
  const lead   = data.lead   ? replacePlaceholders(data.lead, placeholders)   : undefined;
  const author = data.author ? replacePlaceholders(data.author, placeholders) : analysis.author?.name;

  return (
    <main>
      <Header />
      <ArticleLayout
        title={title ?? "Artykuł"}
        date={data.date}
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
    </main>
  );
}

export async function generateStaticParams(): Promise<PageParams[]> {
  const rows = await prisma.analysis.findMany({
    select: { slug: true },
  });

  // Jeżeli typowo slug jest string, to i tak będą same niepuste.
  // Dla bezpieczeństwa zawężam typ, gdyby w bazie trafił się null/"".
  return rows
    .map(({ slug }) => slug)
    .filter((s): s is string => !!s && s.length > 0)
    .map((slug) => ({ slug }));
}
