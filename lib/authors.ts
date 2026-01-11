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
      select: ['id', 'slug', 'name', 'img', 'bio'],
    });

    // Transform to UI-friendly format with explicit string conversion
    return authors.map(author => ({
      id: String(author.id),
      slug: String(author.slug),
      name: String(author.name),
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
  return {
    author: {
      id: String(author.id),
      slug: author.slug,
      name: author.name,
      img: author.img || undefined,
      bio: author.bio || undefined,
    },
    analyses: analyses.map(analysis => ({
      id: String(analysis.id),
      title: analysis.title,
      slug: analysis.slug,
    })),
  };
}