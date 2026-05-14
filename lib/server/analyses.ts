import 'server-only';

import { unstable_cache } from "next/cache";
import { executeRscQuery } from "../db.rsc";
import { AnalysisSchema } from "../entities";
import { AnalysisRow, AnalysisDetail } from "../../types/analysis";
import { applyAuthorCanonicalOverrides } from "@/lib/server/author-overrides";
import { createExcerpt, stripMarkdown } from "@/lib/searchUtils";
import { IsNull, Not } from "typeorm";

// Mock data for development/testing
const mockAnalyses: AnalysisRow[] = [
  {
    id: "1",
    title: "Geopolityka Europy Zrodkowej",
    slug: "geopolityka-europy-srodkowej",
    authorId: "1",
    author: {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      img: "/images/Balcerowski.png"
    }
  },
  {
    id: "2",
    title: "Transformacje polityczne w regionie",
    slug: "transformacje-polityczne-region",
    authorId: "1",
    author: {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      img: "/images/Balcerowski.png"
    }
  },
  {
    id: "3",
    title: "BezpieczeDstwo cybernetyczne",
    slug: "bezpieczenstwo-cybernetyczne",
    authorId: "2",
    author: {
      id: "2",
      slug: "anna-domanska",
      name: "Anna DomaDska",
      img: "/images/Domanska.png"
    }
  },
  {
    id: "4",
    title: "Transformacja cyfrowa w administracji",
    slug: "transformacja-cyfrowa-administracji",
    authorId: "2",
    author: {
      id: "2",
      slug: "anna-domanska",
      name: "Anna DomaDska",
      img: "/images/Domanska.png"
    }
  },
  {
    id: "5",
    title: "Prawo midzynarodowe w erze cyfrowej",
    slug: "prawo-miedzynarodowe-era-cyfrowa",
    authorId: "3",
    author: {
      id: "3",
      slug: "marek-feszler",
      name: "Marek Feszler",
      img: "/images/Feszler.png"
    }
  },
  {
    id: "6",
    title: "Rynek energii w Europie",
    slug: "rynek-energii-europie",
    authorId: "4",
    author: {
      id: "4",
      slug: "katarzyna-gursztyn",
      name: "Katarzyna Gursztyn",
      img: "/images/Gursztyn.png"
    }
  }
];

// Mock analysis details
const mockAnalysisDetails: Record<string, AnalysisDetail> = {
  "geopolityka-europy-srodkowej": {
    id: "1",
    title: "Geopolityka Europy Zrodkowej",
    slug: "geopolityka-europy-srodkowej",
    author: {
      name: "Piotr Balcerowski",
      bio: "Analityk polityczny specjalizujcy si w geopolityce Europy Zrodkowej i Wschodniej."
    }
  },
  "bezpieczenstwo-cybernetyczne": {
    id: "3",
    title: "BezpieczeDstwo cybernetyczne",
    slug: "bezpieczenstwo-cybernetyczne",
    author: {
      name: "Anna DomaDska",
      bio: "Ekspertka ds. bezpieczeDstwa midzynarodowego i transformacji cyfrowej."
    }
  }
};

const ANALYSIS_LIST_CACHE_KEY = ["analyses:list"];
const ANALYSIS_DETAIL_CACHE_KEY = ["analyses:detail"];
const ANALYSIS_CACHE_TAGS = ["analyses", "articles", "authors"];
const isProductionBuildPhase = (): boolean =>
  process.env.NEXT_PHASE === "phase-production-build";

function toDateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return undefined;
}

function toIsoDateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return undefined;
}

function stripMdxFrontmatter(source: string): string {
  if (!source.trim().startsWith("---")) return source;
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

function buildExcerpt(analysis: {
  lead?: string | null;
  description?: string | null;
  contentMdx?: string | null;
  title: string;
}): string {
  const fromLead = typeof analysis.lead === "string" ? analysis.lead.trim() : "";
  if (fromLead.length > 0) return createExcerpt(fromLead, 220);

  const fromDescription = typeof analysis.description === "string" ? analysis.description.trim() : "";
  if (fromDescription.length > 0) return createExcerpt(fromDescription, 220);

  const contentSource = stripMdxFrontmatter(analysis.contentMdx ?? "");
  const fromBody = createExcerpt(contentSource, 220);
  if (fromBody.length > 0) return fromBody;

  return analysis.title;
}

function buildBodyText(contentMdx?: string | null): string {
  const source = stripMdxFrontmatter(contentMdx ?? "");
  const cleaned = stripMarkdown(source);
  return cleaned.trim();
}

async function getAnalysesUncached(): Promise<AnalysisRow[]> {
  // Skip during build time
  if (isProductionBuildPhase()) {
    return [];
  }

  try {
    return await executeRscQuery(async (dataSource) => {
      const analysisRepository = dataSource.getRepository(AnalysisSchema);
      const analyses = await analysisRepository.find({
        relations: {
          author: true,
        },
        where: {
          publishedAt: Not(IsNull()),
        },
        order: { publishedAt: 'DESC', id: 'DESC' },
      });

      // Transform to UI-friendly format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = analyses.map((analysis: any) => ({
        id: String(analysis.id),
        title: String(analysis.title),
        slug: String(analysis.slug),
        authorId: String(analysis.authorId),
        date: toDateValue(analysis.date),
        publishedAt:
          toIsoDateValue(analysis.publishedAt) ??
          toIsoDateValue(analysis.date) ??
          "",
        excerpt: buildExcerpt(analysis),
        bodyText: buildBodyText(analysis.contentMdx),
        isPublished: Boolean(analysis.publishedAt),
        lead: analysis.lead ?? undefined,
        description: analysis.description ?? undefined,
        category: analysis.category ?? undefined,
        sourceHash: analysis.sourceHash ?? undefined,
        author: analysis.author ? {
          id: String(analysis.author.id),
          slug: String(analysis.author.slug),
          name: String(analysis.author.name),
          img: analysis.author.img ?? null,
        } : undefined,
      }));

      return result.map((analysis) => ({
        ...analysis,
        author: analysis.author
          ? applyAuthorCanonicalOverrides(analysis.author)
          : undefined,
      }));
    });
  } catch (error) {
    console.warn('Database not available for getAnalyses(), using mock data:', error);
    return mockAnalyses.map((analysis) => ({
      ...analysis,
      publishedAt: analysis.publishedAt ?? "",
      excerpt: analysis.excerpt ?? analysis.title,
      bodyText: analysis.bodyText ?? analysis.title,
      isPublished: analysis.isPublished ?? true,
      author: analysis.author
        ? applyAuthorCanonicalOverrides(analysis.author)
        : undefined,
    }));
  }
}

async function getAnalysisBySlugUncached(slug: string): Promise<AnalysisDetail | null> {
  // Skip during build time
  if (isProductionBuildPhase()) {
    return null;
  }

  try {
    return await executeRscQuery(async (dataSource) => {
      const analysisRepository = dataSource.getRepository(AnalysisSchema);

      const analysis = await analysisRepository.findOne({
        where: {
          slug,
          publishedAt: Not(IsNull()),
        },
        relations: {
          author: true,
        },
      });

      if (!analysis) {
        return null;
      }

      // Transform to UI-friendly format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const author = (analysis as any).author;
      return {
        id: String(analysis.id),
        title: analysis.title,
        slug: analysis.slug,
        date: toDateValue(analysis.date),
        lead: analysis.lead ?? undefined,
        description: analysis.description ?? undefined,
        category: analysis.category ?? undefined,
        contentMdx: analysis.contentMdx ?? undefined,
        sourceHash: analysis.sourceHash ?? undefined,
        author: author
          ? applyAuthorCanonicalOverrides({
              id: String(author.id),
              slug: author.slug || undefined,
              name: author.name || undefined,
              img: author.img || undefined,
              bio: author.bio || undefined,
            })
          : undefined,
      };
    });
  } catch (error) {
    console.warn('Database not available for getAnalysisBySlug(), using mock data:', error);
    const detail = mockAnalysisDetails[slug];
    if (!detail) return null;
    return {
      ...detail,
      author: detail.author
        ? applyAuthorCanonicalOverrides(detail.author)
        : undefined,
    };
  }
}

const getAnalysesCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getAnalysesUncached, ANALYSIS_LIST_CACHE_KEY, {
        tags: ANALYSIS_CACHE_TAGS,
      })
    : getAnalysesUncached;

const getAnalysisBySlugCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getAnalysisBySlugUncached, ANALYSIS_DETAIL_CACHE_KEY, {
        tags: ANALYSIS_CACHE_TAGS,
      })
    : getAnalysisBySlugUncached;

export async function getAnalyses(): Promise<AnalysisRow[]> {
  if (process.env.NODE_ENV === "test" || isProductionBuildPhase()) {
    return getAnalysesUncached();
  }

  return getAnalysesCached();
}

export async function getAnalysisBySlug(slug: string): Promise<AnalysisDetail | null> {
  if (process.env.NODE_ENV === "test" || isProductionBuildPhase()) {
    return getAnalysisBySlugUncached(slug);
  }

  return getAnalysisBySlugCached(slug);
}
