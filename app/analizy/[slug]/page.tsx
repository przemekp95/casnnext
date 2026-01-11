/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ArticleLayout from "@/components/ArticleLayout";
import Header from "@/components/Header";
import { notFound } from "next/navigation";
import { getAnalyses, getAnalysisBySlug } from "@/lib/analyses";

import MDXContent from "@/components/mdx/MDXContent";

// ——— RUNTIME / CACHE ————————————————————————————————————————————————
export const runtime = "nodejs";
// Generuj statycznie dla lepszej wydajności i SEO
export const dynamicParams = true; // Allow dynamic params for new content
export const revalidate = 3600; // Revalidate every hour

// Generuj statyczne ścieżki dla istniejących analiz
export async function generateStaticParams() {
  try {
    const analyses = await getAnalyses();
    return analyses.map((analysis) => ({
      slug: analysis.slug,
    }));
  } catch (error) {
    // W przypadku błędu DB, zwróć pustą tablicę (fallback do SSR)
    console.warn('generateStaticParams failed:', error);
    return [];
  }
}

// ——— Typy ——————————————————————————————————————————————————————————————

// ——— Utils ————————————————————————————————————————————————————————————
function replacePlaceholders(str: string | undefined, placeholders: Record<string, string>) {
  if (!str) return "";
  return str.replace(/{{(.*?)}}/g, (_, key) => placeholders[key.trim()] ?? "");
}

// Lekki logger (aktywny tylko w DEV na serwerze)
const LOGFILE = path.join(process.cwd(), "tmp", "mdx-error.log");
function logDbg(...args: any[]) {
  if (process.env.NODE_ENV !== "development") return;
  try {
    fs.mkdirSync(path.dirname(LOGFILE), { recursive: true });
    const line =
      `[${new Date().toISOString()}] ` +
      args
        .map((a) => {
          try {
            return typeof a === "string" ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ") +
      "\n";
    fs.appendFileSync(LOGFILE, line);
  } catch {
    /* ignore */
  }
}

// ——— Główna strona ————————————————————————————————————————————————
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug) return notFound();

    logDbg("STEP", "slug", slug);

    // 1) DB — pobierz meta artykułu
    const analysis = await getAnalysisBySlug(slug);

    if (!analysis) {
      logDbg("STEP", "notFound_db", slug);
      return notFound();
    }
    logDbg("STEP", "db_ok", analysis.id, analysis.title);

    // 2) MDX — wczytaj z dysku (async I/O, bez blokowania)
    // W kontenerze: /app/posts
    // W lokalnym środowisku: ./posts
    const POSTS_DIR = process.env.APP_ROOT
      ? path.join(process.env.APP_ROOT, "posts")
      : path.join(process.cwd(), "posts");
    const filePath = path.join(POSTS_DIR, `${slug}.mdx`);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      logDbg("STEP", "notFound_file", filePath);
      return notFound();
    }
    logDbg("STEP", "file_exists", filePath);

    const source = await fs.promises.readFile(filePath, "utf8");
    if (source.length > 2_000_000) {
      // zabezpieczenie przed przypadkowym wrzutem ogromnego pliku
      logDbg("STEP", "file_too_big", source.length);
      throw new Error("MDX too large");
    }
    logDbg("STEP", "file_read_ok", source.length);

    const { data, content } = matter(source);
    logDbg("STEP", "frontmatter_ok", Object.keys(data).join(","));

    const placeholders: Record<string, string> = {
      analysisTitle: analysis.title ?? "",
      authorName: analysis.author?.name ?? "",
      authorBio: analysis.author?.bio ?? "",
    };

    const replacedContent = replacePlaceholders(content, placeholders);
    const title = data.title ? replacePlaceholders(data.title, placeholders) : analysis.title;
    const lead = data.lead ? replacePlaceholders(data.lead, placeholders) : undefined;
    const author = data.author ? replacePlaceholders(data.author, placeholders) : analysis.author?.name ?? undefined;

    logDbg("STEP", "pre_mdx", (replacedContent || "").length);

    // 3) Render (MDX renderuje komponent MDXContent — bez sieciowych pluginów)
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
          <MDXContent source={replacedContent} />
        </ArticleLayout>
      </main>
    );
  } catch (e: any) {
    logDbg("FATAL error in Page:", e?.stack || e);
    throw e;
  }
}