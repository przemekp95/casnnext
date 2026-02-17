/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import ArticleLayout from "@/components/ArticleLayout";
import { notFound } from "next/navigation";
import { getAnalyses, getAnalysisBySlug } from "@/lib/analyses";
import Script from "next/script";
import { isStrapiProvider } from "@/lib/content-provider";
import { normalizeCmsMdxMediaPaths } from "@/lib/cms/mdx-media";

import MDXContent from "@/components/mdx/MDXContent";

// ——— RUNTIME / CACHE ————————————————————————————————————————————————
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Force dynamic rendering - always fresh data
export const revalidate = 0; // No revalidation needed for dynamic rendering
export const fetchCache = "force-no-store"; // Disable all caching

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

// Generate metadata for each analysis article
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const analysis = await getAnalysisBySlug(slug);

    if (!analysis) {
      return {
        title: "Nie znaleziono artykułu - Centrum Analiz Służby Niepodległej",
        description: "Artykuł nie został znaleziony.",
      };
    }

    const title = `${analysis.title} - Centrum Analiz Służby Niepodległej`;
    const description = analysis.author?.bio ? `${analysis.title} - ${analysis.author.bio}` : analysis.title;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        authors: analysis.author?.name ? [analysis.author.name] : [],
        siteName: "Centrum Analiz Służby Niepodległej",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
      alternates: {
        canonical: `https://casn.pl/analizy/${slug}`,
      },
    };
  } catch (error) {
    console.warn('Error generating metadata for analysis:', error);
    return {
      title: "Centrum Analiz Służby Niepodległej",
      description: "Analizy polityki i społeczeństwa",
    };
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

    // 2) MDX — primary source from CMS; filesystem fallback for migration period
    let content = analysis.contentMdx || "";
    let data: Record<string, string> = {
      title: analysis.title,
      date: analysis.date || "",
      lead: analysis.lead || "",
      author: analysis.author?.name || "",
      description: analysis.description || "",
      category: analysis.category || "",
    };

    if (content.trim().startsWith("---")) {
      const parsed = matter(content);
      data = { ...data, ...(parsed.data as Record<string, string>) };
      content = parsed.content;
      logDbg("STEP", "frontmatter_from_cms", Object.keys(parsed.data).join(","));
    }

    if (!content) {
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

      const parsed = matter(source);
      data = { ...data, ...(parsed.data as Record<string, string>) };
      content = parsed.content;
      logDbg("STEP", "frontmatter_from_file", Object.keys(parsed.data).join(","));
    }

    const placeholders: Record<string, string> = {
      analysisTitle: analysis.title ?? "",
      authorName: analysis.author?.name ?? "",
      authorBio: analysis.author?.bio ?? "",
    };

    const replacedContent = replacePlaceholders(content, placeholders);
    const normalizedContent = isStrapiProvider()
      ? normalizeCmsMdxMediaPaths(replacedContent)
      : replacedContent;
    const title = data.title ? replacePlaceholders(data.title, placeholders) : analysis.title;
    const lead = data.lead ? replacePlaceholders(data.lead, placeholders) : analysis.lead || undefined;
    const author = data.author ? replacePlaceholders(data.author, placeholders) : analysis.author?.name ?? undefined;
    const dateValue = data.date || analysis.date || undefined;

    logDbg("STEP", "pre_mdx", (normalizedContent || "").length);

    // Generate structured data
    const articleStructuredData = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": title,
      "description": lead || title,
      "author": {
        "@type": "Person",
        "name": author || "Centrum Analiz Służby Niepodległej"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Centrum Analiz Służby Niepodległej",
        "logo": {
          "@type": "ImageObject",
          "url": "https://casn.pl/images/logo.png"
        }
      },
      "datePublished": dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
      "dateModified": dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://casn.pl/analizy/${slug}`
      }
    };

    const breadcrumbStructuredData = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Strona główna",
          "item": "https://casn.pl"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Analizy",
          "item": "https://casn.pl/analizy"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": title,
          "item": `https://casn.pl/analizy/${slug}`
        }
      ]
    };

    // 3) Render (MDX renderuje komponent MDXContent — bez sieciowych pluginów)
    return (
      <>
        <Script
          id="article-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(articleStructuredData)
          }}
        />
        <Script
          id="breadcrumb-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbStructuredData)
          }}
        />
        <div id="analysis-page" data-page-type="analysis"></div>
        <ArticleLayout
          title={title ?? "Artykuł"}
          date={dateValue}
          author={author}
          lead={lead}
          breadcrumbs={[
            { label: "Strona główna", href: "/" },
            { label: "Analizy", href: "/analizy" },
            { label: title ?? slug, active: true },
          ]}
        >
          <MDXContent source={normalizedContent} />
        </ArticleLayout>
      </>
    );
  } catch (e: any) {
    logDbg("FATAL error in Page:", e?.stack || e);
    throw e;
  }
}
