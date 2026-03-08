import 'server-only';

import { unstable_cache } from "next/cache";
import { executeRscQuery } from "../db.rsc";
import { AuthorSchema, AnalysisSchema } from "../entities";
import { AuthorRow, AuthorDetail } from "../../types/author";
import { applyAuthorCanonicalOverrides } from "@/lib/server/author-overrides";
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
      { id: "1", title: "Geopolityka Europy Zrodkowej", slug: "geopolityka-europy-srodkowej" },
      { id: "2", title: "Transformacje polityczne w regionie", slug: "transformacje-polityczne-region" },
      { id: "3", title: "O pojciu Nacjonalizmu", slug: "balcerowski-nacjonalizm" }
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
      { id: "3", title: "BezpieczeDstwo cybernetyczne", slug: "bezpieczenstwo-cybernetyczne" },
      { id: "4", title: "Transformacja cyfrowa w administracji", slug: "transformacja-cyfrowa-administracji" }
    ]
  }
};

const AUTHOR_LIST_CACHE_KEY = ["authors:list"];
const AUTHOR_DETAIL_CACHE_KEY = ["authors:detail"];
const AUTHOR_DETAIL_CACHE_TAGS = ["authors", "analyses", "articles"];

async function getAuthorsUncached(): Promise<AuthorRow[]> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
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
    console.warn('Database not available for getAuthors(), using mock data:', error);
    return mockAuthors.map(applyAuthorCanonicalOverrides);
  }
}

async function getAuthorBySlugUncached(slug: string): Promise<AuthorDetail | null> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
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
        order: { id: 'DESC' },
        select: ['id', 'title', 'slug'],
      });

      // Transform to UI-friendly format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authorEntity = author as any;
      const normalizedAuthor = applyAuthorCanonicalOverrides({
        id: String(authorEntity.id),
        slug: authorEntity.slug,
        name: authorEntity.name,
        displayName: authorEntity.displayName,
        img: authorEntity.img || undefined,
        bio: authorEntity.bio || undefined,
        sourceHash: authorEntity.sourceHash || undefined,
      });
      return {
        author: normalizedAuthor,
        analyses: analyses.map(analysis => ({
          id: String(analysis.id),
          title: analysis.title,
          slug: analysis.slug,
        })),
      };
    });
  } catch (error) {
    console.warn('Database not available for getAuthorBySlug(), using mock data:', error);
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
  if (process.env.NODE_ENV === "test") {
    return getAuthorsUncached();
  }

  return getAuthorsCached();
}

export async function getAuthorBySlug(slug: string): Promise<AuthorDetail | null> {
  if (process.env.NODE_ENV === "test") {
    return getAuthorBySlugUncached(slug);
  }

  return getAuthorBySlugCached(slug);
}
