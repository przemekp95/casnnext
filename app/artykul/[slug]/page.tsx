import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import Image from "next/image";
import Link from "next/link";
import matter from "gray-matter";
import ArticleLayout from "@/components/ArticleLayout";
import { MDXRemote } from "next-mdx-remote/rsc";

// Utwórz instancję PrismaClient
const prisma = new PrismaClient();

// Funkcja do podmiany placeholderów w treści
function replacePlaceholders(str: string | undefined, placeholders: Record<string, string>): string {
  if (!str) return "";
  return str.replace(/{{(.*?)}}/g, (_, key) => placeholders[key.trim()] ?? "");
}

// Funkcja dynamicznego ładowania treści
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  // Czekamy na rozstrzygnięcie params
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  if (!slug) {
    return <div>404 - Not Found</div>;  // Jeśli brak slug, wyświetl 404
  }

  // Pobierz analizę z bazy danych
  const analysis = await prisma.analysis.findUnique({
    where: { slug },
    include: { author: true }
  });

  if (!analysis) {
    return <div>404 - Not Found</div>;  // Jeśli analiza nie istnieje, wyświetl 404
  }

  // Wczytaj MDX z pliku
  const filePath = path.join(process.cwd(), "posts", `${slug}.mdx`);
  const source = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(source);

  // Placeholdery
  const placeholders: Record<string, string> = {
    analysisTitle: analysis?.title ?? "",
    authorName: analysis?.author?.name ?? "",
    authorBio: analysis?.author?.bio ?? "",
  };

  // Podmiana treści
  const replacedContent = replacePlaceholders(content, placeholders);

  // Podmień frontmatter
  const title = data.title ? replacePlaceholders(data.title, placeholders) : analysis?.title;
  const lead = data.lead ? replacePlaceholders(data.lead, placeholders) : undefined;
  const author = data.author ? replacePlaceholders(data.author, placeholders) : analysis?.author?.name;

  return (
    <ArticleLayout
      title={title}
      date={data.date}
      author={author}
      lead={lead}
    >
      <MDXRemote source={replacedContent} components={{ Link, Image }} />
    </ArticleLayout>
  );
}
