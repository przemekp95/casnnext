import fs from "fs";
import path from "path";
import Image from "next/image";
import Link from "next/link";
import matter from "gray-matter";
import { MDXRemote } from "next-mdx-remote/rsc";
import ArticleLayout from "@/components/ArticleLayout";
import Header from "@/components/Header";
// import Footer from "@/components/Footer";
import { prisma } from "@/lib/prisma";

function replacePlaceholders(str: string | undefined, placeholders: Record<string, string>): string {
  if (!str) return "";
  return str.replace(/{{(.*?)}}/g, (_, key) => placeholders[key.trim()] ?? "");
}

export default async function Page({ params }: { params: { slug: string } }) {
  const { slug } = params;
  if (!slug) return <div>404 - Not Found</div>;

  const analysis = await prisma.analysis.findUnique({
    where: { slug },
    include: { author: true },
  });
  if (!analysis) return <div>404 - Not Found</div>;

  const filePath = path.join(process.cwd(), "posts", `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return <div>404 - Not Found</div>;

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
        // HERO i breadcrumbs renderuje ArticleLayout – jak w Twoim legacy:
        breadcrumbs={[
          { label: "Strona główna", href: "/" },
          { label: "Analizy", href: "/analizy" },
          { label: title ?? slug, active: true },
        ]}
        // opcjonalnie: tło wewnętrznego boxa w HERO w ArticleLayout (domyślnie rgba(30,30,30,.65))
        // innerBg="rgba(30,30,30,.65)"
      >
        <MDXRemote source={replacedContent} components={{ Link, Image }} />
      </ArticleLayout>

    </main>
  );
}
