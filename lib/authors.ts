import { AppDataSource } from "./db";
import { initializeDatabase } from "./init-db";
import { AuthorSchema, AnalysisSchema } from "./entities";
import { AuthorRow, AuthorDetail } from "../types/author";

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
    console.warn('Database not available for getAuthors()');
    return [];
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
    return null;
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