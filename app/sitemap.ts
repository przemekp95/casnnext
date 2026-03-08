import { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { executeRscQuery } from "@/lib/db.rsc";
import { AnalysisSchema, AuthorSchema, IssueCollectionSchema } from "@/lib/entities";
import { IsNull, Not } from "typeorm";

// Build-safe dynamic shell; sitemap payload itself is tag-invalidated.
export const dynamic = "force-dynamic";

const SITE_URL = "https://casn.pl";

type SitemapAnalysisRow = {
  slug: string;
  publishedAt: Date | null;
};

type SitemapAuthorRow = {
  slug: string | null;
  publishedAt: Date | null;
};

type SitemapIssueRow = {
  fileUrl: string;
  publishedAt: Date | null;
};

type SitemapPayload = {
  analyses: SitemapAnalysisRow[];
  authors: SitemapAuthorRow[];
  issues: SitemapIssueRow[];
};

function latestPublishedAt<T extends { publishedAt: Date | null }>(
  rows: T[],
  fallback: Date,
): Date {
  const timestamps = rows
    .map((row) => row.publishedAt)
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime());

  if (timestamps.length === 0) return fallback;
  return new Date(Math.max(...timestamps));
}

function toSameHostSitemapUrl(value: string, baseUrl: string): string | null {
  if (!value || value === "#") return null;

  try {
    const resolved = new URL(value, baseUrl);
    const siteHost = new URL(baseUrl).host;
    return resolved.host === siteHost ? resolved.toString() : null;
  } catch {
    return null;
  }
}

async function getSitemapPayloadUncached(): Promise<SitemapPayload> {
  try {
    return await executeRscQuery(async (dataSource) => {
      const analysisRepository = dataSource.getRepository(AnalysisSchema);
      const authorRepository = dataSource.getRepository(AuthorSchema);
      const issueRepository = dataSource.getRepository(IssueCollectionSchema);

      const [analyses, authors, issues] = await Promise.all([
        analysisRepository.find({
          where: {
            publishedAt: Not(IsNull()),
          },
          order: { publishedAt: "DESC", id: "DESC" },
          select: ["slug", "publishedAt"],
        }),
        authorRepository.find({
          where: {
            publishedAt: Not(IsNull()),
          },
          order: { publishedAt: "DESC", id: "DESC" },
          select: ["slug", "publishedAt"],
        }),
        issueRepository.find({
          where: {
            publishedAt: Not(IsNull()),
          },
          order: { publishedAt: "DESC", year: "DESC" },
          select: ["fileUrl", "publishedAt"],
        }),
      ]);

      return {
        analyses: analyses.map((analysis) => ({
          slug: String(analysis.slug),
          publishedAt: analysis.publishedAt ?? null,
        })),
        authors: authors.map((author) => ({
          slug: typeof author.slug === "string" ? author.slug : null,
          publishedAt: author.publishedAt ?? null,
        })),
        issues: issues.map((issue) => ({
          fileUrl: String(issue.fileUrl),
          publishedAt: issue.publishedAt ?? null,
        })),
      };
    });
  } catch (error) {
    console.warn("Database not available for sitemap payload:", error);
    return {
      analyses: [],
      authors: [],
      issues: [],
    };
  }
}

const getSitemapPayloadCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getSitemapPayloadUncached, ["sitemap:payload"], {
        tags: ["sitemap", "authors", "analyses", "articles", "issues"],
      })
    : getSitemapPayloadUncached;

async function getSitemapPayload(): Promise<SitemapPayload> {
  if (process.env.NODE_ENV === "test") {
    return getSitemapPayloadUncached();
  }

  return getSitemapPayloadCached();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const { analyses, authors, issues } = await getSitemapPayload();

  const analysesLastModified = latestPublishedAt(analyses, now);
  const authorsLastModified = latestPublishedAt(authors, now);
  const issuesLastModified = latestPublishedAt(issues, now);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/analizy`,
      lastModified: analysesLastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/zbiory`,
      lastModified: issuesLastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/kontakt`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/autorzy`,
      lastModified: authorsLastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const analysisPages: MetadataRoute.Sitemap = analyses.map((analysis) => ({
    url: `${SITE_URL}/analizy/${analysis.slug}`,
    lastModified: analysis.publishedAt ?? analysesLastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const authorPages: MetadataRoute.Sitemap = authors
    .filter((author): author is SitemapAuthorRow & { slug: string } => Boolean(author.slug))
    .map((author) => ({
      url: `${SITE_URL}/autor/${author.slug}`,
      lastModified: author.publishedAt ?? authorsLastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const issuePdfPages: MetadataRoute.Sitemap = issues
    .map((issue) => {
      const fileUrl = toSameHostSitemapUrl(issue.fileUrl, SITE_URL);
      if (!fileUrl) return null;

      return {
        url: fileUrl,
        lastModified: issue.publishedAt ?? issuesLastModified,
        changeFrequency: "yearly" as const,
        priority: 0.5,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return [...staticPages, ...authorPages, ...analysisPages, ...issuePdfPages];
}
