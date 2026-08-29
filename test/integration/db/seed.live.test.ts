import { AppDataSource, initializeDatabase } from '@/lib/init-db';

// Ten plik robi prawdziwe I/O (DB + seed), więc musi mieć większy timeout niż domyślne 5s.
const FILE_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TIMEOUT_MS ?? 120_000);
const TEST_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TEST_TIMEOUT_MS ?? 60_000);

jest.setTimeout(FILE_TIMEOUT_MS);

async function runSeed() {
  const authorRepository = AppDataSource.getRepository('Author');
  const analysisRepository = AppDataSource.getRepository('Analysis');

  const authorCount = await authorRepository.count();
  const analysisCount = await analysisRepository.count();

  if (authorCount > 0 || analysisCount > 0) {
    return;
  }

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

describe('Database Seeding', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it(
    'database has proper structure and data after initialization',
    async () => {
      const authorRepository = AppDataSource.getRepository('Author');
      const analysisRepository = AppDataSource.getRepository('Analysis');

      const authors = await authorRepository.find();
      expect(authors.length).toBeGreaterThan(0);

      const analyses = await analysisRepository.find();
      expect(analyses.length).toBeGreaterThan(0);

      const firstAuthor = authors[0];
      expect(firstAuthor).toHaveProperty('id');
      expect(firstAuthor).toHaveProperty('slug');
      expect(firstAuthor).toHaveProperty('name');
      expect(typeof firstAuthor.id).toBe('number');
      expect(typeof firstAuthor.slug).toBe('string');
      expect(typeof firstAuthor.name).toBe('string');

      const firstAnalysis = analyses[0];
      expect(firstAnalysis).toHaveProperty('id');
      expect(firstAnalysis).toHaveProperty('title');
      expect(firstAnalysis).toHaveProperty('slug');
      expect(firstAnalysis).toHaveProperty('authorId');
      expect(typeof firstAnalysis.id).toBe('number');
      expect(typeof firstAnalysis.title).toBe('string');
      expect(typeof firstAnalysis.slug).toBe('string');
      expect(typeof firstAnalysis.authorId).toBe('number');

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
      const authorRepository = AppDataSource.getRepository('Author');
      const analysisRepository = AppDataSource.getRepository('Analysis');
      const countsBefore = {
        authors: await authorRepository.count(),
        analyses: await analysisRepository.count(),
      };

      await runSeed();

      const countsAfter = {
        authors: await authorRepository.count(),
        analyses: await analysisRepository.count(),
      };
      expect(countsAfter).toEqual(countsBefore);
    },
    TEST_TIMEOUT_MS
  );
});
