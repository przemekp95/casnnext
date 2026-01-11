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

  // Use raw query with join since relations don't work with EntitySchema
  const analyses = await analysisRepository
    .createQueryBuilder('analysis')
    .leftJoin('Author', 'author', 'author.id = analysis.authorId')
    .select([
      'analysis.id as analysis_id',
      'analysis.title as analysis_title',
      'analysis.slug as analysis_slug',
      'analysis.authorId as analysis_authorId',
      'author.id as author_id',
      'author.slug as author_slug',
      'author.name as author_name',
      'author.img as author_img'
    ])
    .orderBy('analysis.id', 'DESC')
    .getRawMany();

  // Transform to UI-friendly format
  return analyses.map(analysis => ({
    id: String(analysis.analysis_id),
    title: String(analysis.analysis_title),
    slug: String(analysis.analysis_slug),
    authorId: String(analysis.analysis_authorId),
    author: analysis.author_id ? {
      id: String(analysis.author_id),
      slug: String(analysis.author_slug),
      name: String(analysis.author_name),
      img: analysis.author_img ?? null,
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