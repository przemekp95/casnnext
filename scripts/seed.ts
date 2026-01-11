// scripts/seed.ts
import { AppDataSource } from '@/lib/db';
import { AuthorSchema, AnalysisSchema } from '@/lib/entities';

async function main() {
  console.log("Starting seed script...");
  // Initialize TypeORM
  if (!AppDataSource.isInitialized) {
    console.log("Initializing TypeORM...");
    await AppDataSource.initialize();
    console.log("TypeORM initialized.");
  }

  const authorRepository = AppDataSource.getRepository(AuthorSchema);
  const analysisRepository = AppDataSource.getRepository(AnalysisSchema);

  // Check if data already exists
  const authorCount = await authorRepository.count();
  const analysisCount = await analysisRepository.count();
  console.log(`Current counts - Authors: ${authorCount}, Analyses: ${analysisCount}`);

  if (authorCount > 0 || analysisCount > 0) {
    console.log("Data already exists, skipping seed.");
    return;
  }

  console.log("Creating test data...");

  // Create test authors
  const author1 = await authorRepository.save({
    slug: "test-author-1",
    name: "Jan Kowalski",
    bio: "Ekspert w dziedzinie analiz politycznych",
    img: "/images/test1.png"
  });
  console.log("Created author 1:", author1.id);

  const author2 = await authorRepository.save({
    slug: "test-author-2",
    name: "Anna Nowak",
    bio: "Specjalistka ds. prawa europejskiego",
    img: "/images/test2.png"
  });
  console.log("Created author 2:", author2.id);

  // Create test analyses
  const analyses = await analysisRepository.save([
    {
      title: "Pierwsza analiza CASN",
      slug: "pierwsza-analiza",
      authorId: author1.id,
    },
    {
      title: "Druga analiza CASN",
      slug: "druga-analiza",
      authorId: author2.id,
    },
  ]);
  console.log("Created analyses:", analyses.length);

  console.log("Seed done successfully.");
}

main().finally(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});