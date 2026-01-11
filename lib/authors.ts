import { AppDataSource } from "./db";
import { initializeDatabase } from "./init-db";
import { AuthorSchema, AnalysisSchema } from "./entities";

export async function getAuthors() {
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

  return authors;
}

export async function getAuthorBySlug(slug: string) {
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

  return { author, analyses };
}