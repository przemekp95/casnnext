import { AppDataSource } from "./db";
import { initializeDatabase } from "./init-db";
import { AnalysisSchema } from "./entities";

export async function getAnalyses() {
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

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const analyses = await analysisRepository.find({
    relations: ['author'],
    order: { id: 'DESC' },
  });

  return analyses;
}

export async function getAnalysisBySlug(slug: string) {
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

  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);
  const analysis = await analysisRepository
    .createQueryBuilder('analysis')
    .leftJoin('Author', 'author', 'author.id = analysis.authorId')
    .select([
      'analysis.id',
      'analysis.title',
      'analysis.slug',
      'author.name as author_name',
      'author.bio as author_bio'
    ])
    .where('analysis.slug = :slug', { slug })
    .getRawOne();

  if (!analysis) {
    return null;
  }

  // Transform to match expected format
  const result = {
    id: analysis.id,
    title: analysis.title,
    slug: analysis.slug,
    author: {
      name: analysis.author_name,
      bio: analysis.author_bio,
    },
  };

  return result;
}