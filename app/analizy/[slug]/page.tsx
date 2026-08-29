import matter from "gray-matter";
import type { Metadata } from "next";
import { cache } from "react";
import ArticleLayout from "@/components/ArticleLayout";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAnalyses, getAnalysisBySlug } from "@/lib/analyses";
import { normalizeCmsMdxMediaPaths } from "@/lib/cms/mdx-media";
import { replacePlaceholders } from "@/lib/cms/placeholders";
import { getRelatedAnalysesBySlug } from "@/lib/server/related-analyses";

import MDXContent from "@/components/mdx/MDXContent";

export const runtime = "nodejs";
export const dynamicParams = true;

const SITE_URL = "https://casn.pl";
const SITE_NAME = "Centrum Analiz Służby Niepodległej";
const DEFAULT_OG_IMAGE = "/images/home2.webp";
type PageProps = { params: Promise<{ slug: string }> };

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export async function generateStaticParams() {
  try {
    const analyses = await getAnalyses();
    return analyses.map((analysis) => ({
      slug: analysis.slug,
    }));
  } catch (error) {
    // W przypadku błędu DB, zwróć pustą tablicę (fallback do SSR)
    console.warn('generateStaticParams failed:', errorMessage(error));
    return [];
  }
}

type FrontmatterMap = Record<string, unknown>;

type AnalysisPageData = {
  id: string;
  slug: string;
  title: string;
  description: string;
  lead?: string;
  authorName?: string;
  authorSlug?: string;
  dateValue?: string;
  dateIso?: string;
  category?: string;
  keywords?: string[];
  canonicalUrl: string;
  ogImageUrl: string;
  content: string;
};

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDisplayDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }
  const dateString = toTrimmedString(value);
  return dateString;
}

function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const dateString = toTrimmedString(value);
  if (!dateString) return undefined;
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${SITE_URL}${normalized}`;
}

function toKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toTrimmedString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const textValue = toTrimmedString(value);
  if (!textValue) return [];
  return textValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMdx(raw: string): { content: string; frontmatter: FrontmatterMap } {
  if (!raw.trim().startsWith("---")) {
    return { content: raw, frontmatter: {} };
  }
  const parsed = matter(raw);
  return {
    content: parsed.content,
    frontmatter: (parsed.data as FrontmatterMap) || {},
  };
}

function getFrontmatterValue(frontmatter: FrontmatterMap, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      return frontmatter[key];
    }
  }
  return undefined;
}

function excerptFromMdx(source: string, maxLength = 180): string | undefined {
  const plain = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return undefined;
  if (plain.length <= maxLength) return plain;
  const snippet = plain.slice(0, maxLength);
  const lastWhitespace = snippet.lastIndexOf(" ");
  const cropped = lastWhitespace > 0 ? snippet.slice(0, lastWhitespace) : snippet;
  return `${cropped.trim()}...`;
}

function replaceTemplate(value: unknown, placeholders: Record<string, string>): string | undefined {
  const text = toTrimmedString(value);
  if (!text) return undefined;
  return replacePlaceholders(text, placeholders);
}

async function loadAnalysisData(slug: string, requireContent: boolean): Promise<AnalysisPageData | null> {
  const analysis = await getAnalysisBySlug(slug);
  if (!analysis) return null;

  let content = analysis.contentMdx || "";
  let frontmatter: FrontmatterMap = {};

  if (content.trim()) {
    const parsed = parseMdx(content);
    content = parsed.content;
    frontmatter = parsed.frontmatter;
  }

  if (!content.trim() && requireContent) {
    return null;
  }

  const placeholders: Record<string, string> = {
    analysisTitle: analysis.title ?? "",
    authorName: analysis.author?.name ?? "",
    authorBio: analysis.author?.bio ?? "",
  };

  const replacedContent = replacePlaceholders(content, placeholders);
  const normalizedContent = normalizeCmsMdxMediaPaths(replacedContent);

  const title = replaceTemplate(frontmatter.title, placeholders) || analysis.title;
  const lead =
    replaceTemplate(frontmatter.lead, placeholders) ||
    replaceTemplate(analysis.lead, placeholders);
  const authorName =
    replaceTemplate(frontmatter.author, placeholders) ||
    replaceTemplate(analysis.author?.name, placeholders);
  const category =
    replaceTemplate(frontmatter.category, placeholders) ||
    replaceTemplate(analysis.category, placeholders);
  const explicitDescription =
    replaceTemplate(frontmatter.description, placeholders) ||
    replaceTemplate(analysis.description, placeholders);

  const dateSource = frontmatter.date ?? analysis.date;
  const dateValue = toDisplayDate(dateSource);
  const dateIso = toIsoDate(dateSource);

  const fallbackDescription =
    lead ||
    (analysis.author?.bio ? `${title} - ${analysis.author.bio}` : undefined) ||
    excerptFromMdx(normalizedContent) ||
    title;
  const description = explicitDescription || fallbackDescription;

  const frontmatterKeywords = toKeywords(frontmatter.keywords);
  const keywordSet = new Set<string>();
  frontmatterKeywords.forEach((keyword) => keywordSet.add(keyword));
  if (category) keywordSet.add(category);

  const imageValue = replaceTemplate(
    getFrontmatterValue(frontmatter, ["ogImage", "og_image", "image", "cover", "thumbnail"]),
    placeholders,
  );
  const ogImageUrl = toAbsoluteUrl(imageValue) || `${SITE_URL}${DEFAULT_OG_IMAGE}`;

  return {
    id: analysis.id,
    slug,
    title,
    description,
    lead,
    authorName,
    authorSlug: analysis.author?.slug,
    dateValue,
    dateIso,
    category,
    keywords: keywordSet.size > 0 ? Array.from(keywordSet) : undefined,
    canonicalUrl: `${SITE_URL}/analizy/${slug}`,
    ogImageUrl,
    content: normalizedContent,
  };
}

const getAnalysisPageData = cache(async (slug: string): Promise<AnalysisPageData | null> =>
  loadAnalysisData(slug, true),
);

const getAnalysisMetadataData = cache(async (slug: string): Promise<AnalysisPageData | null> =>
  loadAnalysisData(slug, false),
);

function isControlledNotFound(error: unknown): boolean {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  const message = error instanceof Error ? error.message : "";

  return digest === "NEXT_HTTP_ERROR_FALLBACK;404" || message === "NEXT_HTTP_ERROR_FALLBACK;404";
}

// Generate metadata for each analysis article
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { slug } = await params;
    const article = await getAnalysisMetadataData(slug);

    if (!article) {
      return {
        title: "Nie znaleziono artykułu - Centrum Analiz Służby Niepodległej",
        description: "Artykuł nie został znaleziony.",
      };
    }

    const title = `${article.title} - ${SITE_NAME}`;

    return {
      title,
      description: article.description,
      keywords: article.keywords,
      openGraph: {
        title,
        description: article.description,
        type: "article",
        url: article.canonicalUrl,
        siteName: SITE_NAME,
        authors: article.authorName ? [article.authorName] : [],
        images: [
          {
            url: article.ogImageUrl,
            width: 1200,
            height: 630,
            alt: article.title,
          },
        ],
        ...(article.category ? { section: article.category } : {}),
        ...(article.dateIso
          ? {
              publishedTime: article.dateIso,
              modifiedTime: article.dateIso,
            }
          : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: article.description,
        images: [article.ogImageUrl],
      },
      alternates: {
        canonical: article.canonicalUrl,
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  } catch (error) {
    console.warn("Error generating metadata for analysis:", errorMessage(error));
    return {
      title: "Centrum Analiz Służby Niepodległej",
      description: "Analizy polityki i społeczeństwa",
    };
  }
}

// ——— Główna strona ————————————————————————————————————————————————
export default async function Page({ params }: PageProps) {
  try {
    const { slug } = await params;
    if (!slug) return notFound();
    const article = await getAnalysisPageData(slug);
    if (!article) return notFound();
    const related = await getRelatedAnalysesBySlug(slug);
    const relatedEntries = related?.related ?? [];
    const authorProfileHref = article.authorSlug ? `/autor/${article.authorSlug}` : null;

    const publishedDate = article.dateIso || new Date().toISOString();

    // Generate structured data
    const articleStructuredData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": article.title,
      "description": article.description,
      "author": {
        "@type": "Person",
        "name": article.authorName || SITE_NAME
      },
      "publisher": {
        "@type": "Organization",
        "name": SITE_NAME,
        "logo": {
          "@type": "ImageObject",
          "url": `${SITE_URL}/images/logo.png`
        }
      },
      "datePublished": publishedDate,
      "dateModified": publishedDate,
      "image": [article.ogImageUrl],
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": article.canonicalUrl
      },
      ...(article.category ? { "articleSection": article.category } : {}),
      ...(article.keywords ? { "keywords": article.keywords.join(", ") } : {}),
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
          "name": article.title,
          "item": article.canonicalUrl
        }
      ]
    };

    // 3) Render (MDX renderuje komponent MDXContent — bez sieciowych pluginów)
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
        />
        <div id="analysis-page" data-page-type="analysis"></div>
        <ArticleLayout
          title={article.title || "Artykuł"}
          date={article.dateValue}
          author={article.authorName}
          lead={article.lead}
          breadcrumbs={[
            { label: "Strona główna", href: "/" },
            { label: "Analizy", href: "/analizy" },
            { label: article.title ?? slug, active: true },
          ]}
        >
          <div className="analysis-internal-links mb-4">
            <p className="mb-2">
              <strong>Nawigacja:</strong>{" "}
              <Link href="/analizy">Wróć do wszystkich analiz</Link>
            </p>
            {authorProfileHref && article.authorName ? (
              <p className="mb-0">
                <strong>Autor artykułu:</strong>{" "}
                <Link href={authorProfileHref}>{article.authorName}</Link>
              </p>
            ) : null}
          </div>
          <MDXContent source={article.content} />
          {relatedEntries.length > 0 ? (
            <section className="mt-5 pt-4 border-top" aria-label="Powiązane analizy">
              <h2 className="h4 mb-3">Powiązane analizy</h2>
              <ul className="list-unstyled mb-0">
                {relatedEntries.map((entry) => (
                  <li key={entry.slug} className="mb-2">
                    <Link href={`/analizy/${entry.slug}`}>{entry.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </ArticleLayout>
      </>
    );
  } catch (error) {
    if (!isControlledNotFound(error)) {
      console.warn("FATAL error in analysis page:", errorMessage(error));
    }
    throw error;
  }
}
