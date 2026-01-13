import 'server-only';

import { AppDataSource } from "../db.server";
import { initializeDatabase } from "./init-db";
import { AuthorSchema, AnalysisSchema } from "../entities";
import { AuthorRow, AuthorDetail } from "../../types/author";

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

export async function getAuthors(): Promise<AuthorRow[]> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return [];
  }

  // Ensure database is initialized
  if (AppDataSource && !AppDataSource.isInitialized) {
    await initializeDatabase();
  }

  if (!AppDataSource || !AppDataSource.isInitialized) {
    console.warn('Database not available for getAuthors(), using mock data');
    return mockAuthors;
  }

  try {
    const authorRepository = AppDataSource.getRepository(AuthorSchema);
    const authors = await authorRepository.find({
      order: { name: 'ASC' },
      // Ensure we load all required fields explicitly
      select: ['id', 'slug', 'name', 'displayName', 'img', 'bio'],
    });

    // Transform to UI-friendly format with explicit string conversion
    return authors.map(author => ({
      id: String(author.id),
      slug: String(author.slug),
      name: String(author.name),
      displayName: String(author.displayName),
      img: author.img ? String(author.img) : null,
      bio: author.bio ? String(author.bio) : null,
    }));
  } catch (error) {
    console.error('Error in getAuthors():', error);
    return [];
  }
}

export async function getAuthorBySlug(slug: string): Promise<AuthorDetail | null> {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  // Ensure database is initialized
  if (AppDataSource && !AppDataSource.isInitialized) {
    await initializeDatabase();
  }

  if (!AppDataSource || !AppDataSource.isInitialized) {
    console.warn('Database not available for getAuthorBySlug(), using mock data');
    return mockAuthorDetails[slug] || null;
  }

  const authorRepository = AppDataSource.getRepository(AuthorSchema);
  const author = await authorRepository.findOne({
    where: { slug },
  });

  if (!author) {
    return null;
  }

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const analyses = await analysisRepository.find({
    where: { authorId: author.id },
    order: { id: 'DESC' },
    select: ['id', 'title', 'slug'],
  });

  // Transform to UI-friendly format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorEntity = author as any;
  return {
    author: {
      id: String(authorEntity.id),
      slug: authorEntity.slug,
      name: authorEntity.name,
      displayName: authorEntity.displayName,
      img: authorEntity.img || undefined,
      bio: authorEntity.bio || undefined,
    },
    analyses: analyses.map(analysis => ({
      id: String(analysis.id),
      title: analysis.title,
      slug: analysis.slug,
    })),
  };
}