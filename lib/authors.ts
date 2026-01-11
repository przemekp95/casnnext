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
    return [];
  }

  const authorRepository = AppDataSource.getRepository(AuthorSchema);
  const authors = await authorRepository.find({
    order: { name: 'ASC' },
  });

  // Transform to UI-friendly format with explicit string conversion
  const result = authors.map(author => ({
    id: String(author.id),
    slug: String(author.slug),
    name: String(author.name),
    img: author.img ? String(author.img) : null,
    bio: author.bio ? String(author.bio) : null,
  }));

  // Debug: log author data
  console.log('Authors from DB:', authors.map(a => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    img: a.img,
    bio: a.bio
  })));
  console.log('Authors transformed:', result);

  return result;
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