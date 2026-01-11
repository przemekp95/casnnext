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
    relations: {
      author: true,
    },
    order: { id: 'DESC' },
  });

  // Transform to UI-friendly format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = analyses.map((analysis: any) => ({
    id: String(analysis.id),
    title: String(analysis.title),
    slug: String(analysis.slug),
    authorId: String(analysis.authorId),
    author: analysis.author ? {
      id: String(analysis.author.id),
      slug: String(analysis.author.slug),
      name: String(analysis.author.name),
      img: analysis.author.img ?? null,
    } : undefined,
  }));

  return result;
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

  // U|yj findOne zamiast query builder dla prostoty i niezawodno[ci
  const analysis = await analysisRepository.findOne({
    where: { slug },
    relations: {
      author: true,
    },
  });

  if (!analysis) {
    return null;
  }

  // Transform to UI-friendly format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const author = (analysis as any).author;
  return {
    id: String(analysis.id),
    title: analysis.title,
    slug: analysis.slug,
    author: author ? {
      name: author.name || undefined,
      bio: author.bio || undefined,
    } : undefined,
  };
}