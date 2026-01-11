import { AppDataSource } from "./db";
import { initializeDatabase } from "./init-db";
import { AnalysisSchema } from "./entities";
import { AnalysisRow, AnalysisDetail } from "../types/analysis";

export async function getAnalyses(): Promise<AnalysisRow[]> {
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

  // Transform to UI-friendly format
  return analyses.map(analysis => ({
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    authorId: String(analysis.authorId),
    author: analysis.author ? {
      id: String(analysis.author.id),
      name: analysis.author.name,
    } : undefined,
  }));
}

export async function getAnalysisBySlug(slug: string): Promise<AnalysisDetail | null> {
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

  // Transform to UI-friendly format
  return {
    id: String(analysis.analysis_id || analysis.id),
    title: analysis.analysis_title || analysis.title,
    slug: analysis.analysis_slug || analysis.slug,
    author: analysis.author_name ? {
      name: analysis.author_name,
      bio: analysis.author_bio || undefined,
    } : undefined,
  };
}