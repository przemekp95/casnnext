import 'server-only';

import { unstable_cache } from "next/cache";
import { executeRscQuery } from "../db.rsc";
import { AuthorSchema, AnalysisSchema } from "../entities";
import { AuthorRow, AuthorDetail } from "../../types/author";
import { applyAuthorCanonicalOverrides } from "@/lib/server/author-overrides";
import { createExcerpt, stripMarkdown } from "@/lib/searchUtils";
import { IsNull, Not } from "typeorm";

// Mock data for development/testing
const mockAuthors: AuthorRow[] = [
  {
    id: "1",
    slug: "piotr-balcerowski",
    name: "Piotr Balcerowski",
    displayName: "Piotr Balcerowski",
    img: "/images/Balcerowski.png",
    bio: "Analityk polityczny specjalizujcy si w geopolityce Europy Zrodkowej i Wschodniej."
  },
  {
    id: "2",
    slug: "anna-domanska",
    name: "Anna DomaDska",
    displayName: "Anna DomaDska",
    img: "/images/Domanska.png",
    bio: "Ekspertka ds. bezpieczeDstwa midzynarodowego i transformacji cyfrowej."
  },
  {
    id: "3",
    slug: "marek-feszler",
    name: "Marek Feszler",
    displayName: "Marek Feszler",
    img: "/images/Feszler.png",
    bio: "Specjalista w zakresie prawa midzynarodowego i europejskiego."
  },
  {
    id: "4",
    slug: "katarzyna-gursztyn",
    name: "Katarzyna Gursztyn",
    displayName: "Katarzyna Gursztyn",
    img: "/images/Gursztyn.png",
    bio: "Analityczka rynku energii i polityki klimatycznej."
  }
];

// Mock author details with analyses
const mockAuthorDetails: Record<string, AuthorDetail> = {
  "piotr-balcerowski": {
    author: {
      id: "1",
      slug: "piotr-balcerowski",
      name: "Piotr Balcerowski",
      displayName: "Piotr Balcerowski",
      img: "/images/Balcerowski.png",
      bio: "Analityk polityczny specjalizujcy si w geopolityce Europy Zrodkowej i Wschodniej."
    },
    analyses: [
      {
        id: "1",
        title: "Geopolityka Europy Zrodkowej",
        slug: "geopolityka-europy-srodkowej",
        authorId: "1",
        publishedAt: "2025-01-01T00:00:00.000Z",
        excerpt: "Geopolityka Europy Zrodkowej",
        bodyText: "Geopolityka Europy Zrodkowej",
        isPublished: true,
      },
      {
        id: "2",
        title: "Transformacje polityczne w regionie",
        slug: "transformacje-polityczne-region",
        authorId: "1",
        publishedAt: "2024-01-01T00:00:00.000Z",
        excerpt: "Transformacje polityczne w regionie",
        bodyText: "Transformacje polityczne w regionie",
        isPublished: true,
      },
      {
        id: "3",
        title: "O pojciu Nacjonalizmu",
        slug: "balcerowski-nacjonalizm",
        authorId: "1",
        publishedAt: "2023-01-01T00:00:00.000Z",
        excerpt: "O pojciu Nacjonalizmu",
        bodyText: "O pojciu Nacjonalizmu",
        isPublished: true,
      }
    ]
  },
  "anna-domanska": {
    author: {
      id: "2",
      slug: "anna-domanska",
      name: "Anna DomaDska",
      displayName: "Anna DomaDska",
      img: "/images/Domanska.png",
      bio: "Ekspertka ds. bezpieczeDstwa midzynarodowego i transformacji cyfrowej."
    },
    analyses: [
      {
        id: "3",
        title: "BezpieczeDstwo cybernetyczne",
        slug: "bezpieczenstwo-cybernetyczne",
        authorId: "2",
        publishedAt: "2025-02-01T00:00:00.000Z",
        excerpt: "BezpieczeDstwo cybernetyczne",
        bodyText: "BezpieczeDstwo cybernetyczne",
        isPublished: true,
      },
      {
        id: "4",
        title: "Transformacja cyfrowa w administracji",
        slug: "transformacja-cyfrowa-administracji",
        authorId: "2",
        publishedAt: "2024-02-01T00:00:00.000Z",
        excerpt: "Transformacja cyfrowa w administracji",
        bodyText: "Transformacja cyfrowa w administracji",
        isPublished: true,
      }
    ]
  }
};

const AUTHOR_LIST_CACHE_KEY = ["authors:list"];
const AUTHOR_DETAIL_CACHE_KEY = ["authors:detail"];
const AUTHOR_DETAIL_CACHE_TAGS = ["authors", "analyses", "articles"];

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

const isProductionBuildPhase = (): boolean =>
  process.env.NEXT_PHASE === "phase-production-build";

function toIsoDateValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return "";
}

function toDateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

function stripMdxFrontmatter(source: string): string {
  if (!source.trim().startsWith("---")) return source;
  return source.replace(/^---[\s\S]*?---\s*/, "");
}

function buildBodyText(contentMdx?: string | null): string {
  const source = stripMdxFrontmatter(contentMdx ?? "");
  return stripMarkdown(source).trim();
}

function buildExcerpt(analysis: {
  lead?: string | null;
  description?: string | null;
  contentMdx?: string | null;
  title: string;
}): string {
  const source =
    (typeof analysis.lead === "string" && analysis.lead.trim()) ||
    (typeof analysis.description === "string" && analysis.description.trim()) ||
    stripMdxFrontmatter(analysis.contentMdx ?? "") ||
    analysis.title;

  return createExcerpt(source, 220);
}

async function getAuthorsUncached(): Promise<AuthorRow[]> {
  // Skip during build time
  if (isProductionBuildPhase()) {
    return [];
  }

  try {
    return await executeRscQuery(async (dataSource) => {
      const authorRepository = dataSource.getRepository(AuthorSchema);
      const authors = await authorRepository.find({
        where: {
          publishedAt: Not(IsNull()),
        },
        order: { name: 'ASC' },
        select: ['id', 'slug', 'name', 'displayName', 'img', 'bio', 'sourceHash'],
      });

      // Transform to UI-friendly format with explicit string conversion
      return authors
        .map(author => ({
          id: String(author.id),
          slug: String(author.slug),
          name: String(author.name),
          displayName: String(author.displayName),
          img: author.img ? String(author.img) : null,
          bio: author.bio ? String(author.bio) : null,
          sourceHash: author.sourceHash ? String(author.sourceHash) : undefined,
        }))
        .map(applyAuthorCanonicalOverrides);
    });
  } catch (error) {
    console.warn('Database not available for getAuthors(), using mock data:', errorMessage(error));
    return mockAuthors.map(applyAuthorCanonicalOverrides);
  }
}

async function getAuthorBySlugUncached(slug: string): Promise<AuthorDetail | null> {
  // Skip during build time
  if (isProductionBuildPhase()) {
    return null;
  }

  try {
    return await executeRscQuery(async (dataSource) => {
      const authorRepository = dataSource.getRepository(AuthorSchema);
      const author = await authorRepository.findOne({
        where: {
          slug,
          publishedAt: Not(IsNull()),
        },
      });

      if (!author) {
        return null;
      }

      const analysisRepository = dataSource.getRepository(AnalysisSchema);
      const analyses = await analysisRepository.find({
        where: {
          authorId: author.id,
          publishedAt: Not(IsNull()),
        },
        order: { publishedAt: 'DESC', id: 'DESC' },
        select: ['id', 'title', 'slug', 'authorId', 'date', 'lead', 'description', 'contentMdx', 'publishedAt'],
      });

      // Transform to UI-friendly format
      const normalizedAuthor = applyAuthorCanonicalOverrides({
        id: String(author.id),
        slug: author.slug,
        name: author.name,
        displayName: author.displayName,
        img: author.img || undefined,
        bio: author.bio || undefined,
        sourceHash: author.sourceHash || undefined,
      });
      return {
        author: normalizedAuthor,
        analyses: analyses.map(analysis => ({
          id: String(analysis.id),
          title: analysis.title,
          slug: analysis.slug,
          authorId: String(analysis.authorId),
          publishedAt: toIsoDateValue(analysis.publishedAt ?? analysis.date),
          excerpt: buildExcerpt(analysis),
          bodyText: buildBodyText(analysis.contentMdx),
          isPublished: true,
          date: toDateValue(analysis.date),
          lead: analysis.lead ?? undefined,
          description: analysis.description ?? undefined,
        })),
      };
    });
  } catch (error) {
    console.warn('Database not available for getAuthorBySlug(), using mock data:', errorMessage(error));
    const detail = mockAuthorDetails[slug];
    if (!detail) return null;

    return {
      ...detail,
      author: applyAuthorCanonicalOverrides(detail.author),
    };
  }
}

const getAuthorsCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getAuthorsUncached, AUTHOR_LIST_CACHE_KEY, {
        tags: ["authors"],
      })
    : getAuthorsUncached;

const getAuthorBySlugCached =
  typeof unstable_cache === "function"
    ? unstable_cache(getAuthorBySlugUncached, AUTHOR_DETAIL_CACHE_KEY, {
        tags: AUTHOR_DETAIL_CACHE_TAGS,
      })
    : getAuthorBySlugUncached;

export async function getAuthors(): Promise<AuthorRow[]> {
  if (process.env.NODE_ENV === "test" || isProductionBuildPhase()) {
    return getAuthorsUncached();
  }

  return getAuthorsCached();
}

export async function getAuthorBySlug(slug: string): Promise<AuthorDetail | null> {
  if (process.env.NODE_ENV === "test" || isProductionBuildPhase()) {
    return getAuthorBySlugUncached(slug);
  }

  return getAuthorBySlugCached(slug);
}
