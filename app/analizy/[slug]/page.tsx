/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ArticleLayout from "@/components/ArticleLayout";
import Header from "@/components/Header";
import { notFound } from "next/navigation";
import { AppDataSource } from "@/lib/db";
import MDXContent from "@/components/mdx/MDXContent";

// ——— RUNTIME / CACHE ————————————————————————————————————————————————
export const runtime = "nodejs";
// Tymczasowo zostaw; po stabilizacji zamień na: export const revalidate = 300;
export const dynamic = "force-dynamic";

// ——— Typy ——————————————————————————————————————————————————————————————
type Row = {
  id: number;
  slug: string;
  title: string;
  author_name?: string | null;
  author_bio?: string | null;
};

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

    // 1) DB — pobierz meta artykułu (bezpiecznik: nie wywal 500 przy problemie DB)
    let analysis: any = null;
    try {
      const analysisRepository = AppDataSource.getRepository('Analysis');
      analysis = await analysisRepository.findOne({
        where: { slug },
        relations: ['author'],
        select: {
          id: true,
          slug: true,
          title: true,
          author: {
            name: true,
            bio: true,
          },
        },
      });
    } catch (e: any) {
      console.error("DB_ERROR", e?.message || e);
      // zamiast 500 — 404 (jeśli DB padnie, wolimy "nie znaleziono" niż crash SSR)
      return notFound();
    }

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
