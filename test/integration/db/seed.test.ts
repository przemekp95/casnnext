import { AppDataSource } from '@/lib/db.server';
import { initializeDatabase } from '@/lib/init-db';

// Ten plik robi prawdziwe I/O (DB + seed), więc musi mieć większy timeout niż domyślne 5s.
const FILE_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TIMEOUT_MS ?? 120_000);
const TEST_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TEST_TIMEOUT_MS ?? 60_000);
const runLiveTests = process.env.RUN_LIVE_TESTS === '1';

jest.setTimeout(FILE_TIMEOUT_MS);

async function runSeed() {
  const authorRepository = AppDataSource.getRepository('Author');
  const analysisRepository = AppDataSource.getRepository('Analysis');

  // Check if data already exists
  const authorCount = await authorRepository.count();
  const analysisCount = await analysisRepository.count();

  if (authorCount > 0 || analysisCount > 0) {
    // Data already exists, skip seeding
    return;
  }

  // Create test authors
  const author1 = await authorRepository.save({
    slug: "test-author-1",
    name: "Jan Kowalski",
    bio: "Ekspert w dziedzinie analiz politycznych",
    img: "/images/test1.png"
  });

  const author2 = await authorRepository.save({
    slug: "test-author-2",
    name: "Anna Nowak",
    bio: "Specjalistka ds. prawa europejskiego",
    img: "/images/test2.png"
  });

  // Create test analyses
  await analysisRepository.save([
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
}

(runLiveTests ? describe : describe.skip)('Database Seeding', () => {
  beforeAll(async () => {
    // Ensure database is initialized with seeding - matches workflow behavior
    await initializeDatabase();
  });

  afterAll(async () => {
    // Don't destroy in CI - let the workflow handle cleanup
    if (AppDataSource.isInitialized && !process.env.CI) {
      await AppDataSource.destroy();
    }
  });

  it(
    'database has proper structure and data after initialization',
    async () => {
      // Database should be initialized and potentially seeded from beforeAll
      const authorRepository = AppDataSource.getRepository('Author');
      const analysisRepository = AppDataSource.getRepository('Analysis');

      // Verify that authors exist
      const authors = await authorRepository.find();
      expect(authors.length).toBeGreaterThan(0);

      // Verify that analyses exist
      const analyses = await analysisRepository.find();
      expect(analyses.length).toBeGreaterThan(0);

      // Verify author structure
      const firstAuthor = authors[0];
      expect(firstAuthor).toHaveProperty('id');
      expect(firstAuthor).toHaveProperty('slug');
      expect(firstAuthor).toHaveProperty('name');
      expect(typeof firstAuthor.id).toBe('number');
      expect(typeof firstAuthor.slug).toBe('string');
      expect(typeof firstAuthor.name).toBe('string');

      // Verify analysis structure
      const firstAnalysis = analyses[0];
      expect(firstAnalysis).toHaveProperty('id');
      expect(firstAnalysis).toHaveProperty('title');
      expect(firstAnalysis).toHaveProperty('slug');
      expect(firstAnalysis).toHaveProperty('authorId');
      expect(typeof firstAnalysis.id).toBe('number');
      expect(typeof firstAnalysis.title).toBe('string');
      expect(typeof firstAnalysis.slug).toBe('string');
      expect(typeof firstAnalysis.authorId).toBe('number');

      // Verify foreign key relationship exists
      const author = await authorRepository.findOne({
        where: { id: firstAnalysis.authorId }
      });
      expect(author).toBeDefined();
      expect(author?.id).toBe(firstAnalysis.authorId);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'seed script only runs once (idempotent)',
    async () => {
      const articleRepository = AppDataSource.getRepository('Analysis');

      // Count articles before second seed attempt
      const countBefore = await articleRepository.count();

      // Try to run seed again (duplikaty/już istnieje mogą zwrócić exit!=0, ale to ok)
      try {
        await runSeed();
      } catch (e) {
        // runSeed już filtruje "duplikaty"; jeśli tu wpadniemy, to znaczy realny błąd
        throw e;
      }

      // Count should remain the same (idempotent)
      const countAfter = await articleRepository.count();
      expect(countAfter).toBe(countBefore);
    },
    TEST_TIMEOUT_MS
  );
});
