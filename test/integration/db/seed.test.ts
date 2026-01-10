/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from 'child_process';
import { AppDataSource } from '@/lib/db';

// Ten plik robi prawdziwe I/O (DB + seed), więc musi mieć większy timeout niż domyślne 5s.
const FILE_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TIMEOUT_MS ?? 120_000);
const TEST_TIMEOUT_MS = Number(process.env.JEST_INTEGRATION_TEST_TIMEOUT_MS ?? 60_000);

jest.setTimeout(FILE_TIMEOUT_MS);

function runSeed() {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL || 'mysql://testuser:testpass@localhost:3306/casn_test',
  };

  // spawnSync daje nam status + stdout/stderr, więc możemy sensownie rozróżnić błędy
  const res = spawnSync('npx', ['tsx', 'scripts/seed.ts'], {
    stdio: 'pipe',
    timeout: 60_000, // Increase timeout to 60 seconds for seeding
    env,
  });

  const stdout = (res.stdout ?? '').toString();
  const stderr = (res.stderr ?? '').toString();
  const combined = `${stdout}\n${stderr}`;

  if (res.error) {
    // np. timeout, brak npx itp.
    throw res.error;
  }

  if (res.status !== 0) {
    // Ignorujemy tylko typowe komunikaty świadczące o idempotency/duplikatach
    const looksLikeDuplicate =
      /ER_DUP_ENTRY|Duplicate entry|already exists|UNIQUE/i.test(combined);

    if (!looksLikeDuplicate) {
      throw new Error(
        `Seed failed (exit=${res.status}). Output:\n${combined}`.trim()
      );
    }
  }

  return { stdout, stderr };
}

describe('Database Seeding', () => {
  beforeAll(async () => {
    // Ensure TypeORM is initialized - in CI this should already be connected
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    // Don't destroy in CI - let the workflow handle cleanup
    if (AppDataSource.isInitialized && !process.env.CI) {
      await AppDataSource.destroy();
    }
  });

  it(
    'seed script populates database with initial data',
    async () => {
      // Clear existing data first to ensure clean test state
      // Clear child table first (Analysis) then parent table (Author) to avoid FK constraints
      const authorRepository = AppDataSource.getRepository('Author');
      const analysisRepository = AppDataSource.getRepository('Analysis');

      // Use query to disable FK checks temporarily for clean truncation/clearing
      await AppDataSource.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        await analysisRepository.clear();
        await authorRepository.clear();
      } finally {
        await AppDataSource.query('SET FOREIGN_KEY_CHECKS = 1');
      }

      // Run the seeding script (throw only on real failures)
      runSeed();

      // Verify that analyses were created using TypeORM
      const analyses = await analysisRepository.find({
        order: { id: 'ASC' },
      });

      // Should have at least the seeded analyses
      expect(analyses.length).toBeGreaterThanOrEqual(2);

      // Verify analysis structure
      const firstAnalysis = analyses[0];
      expect(firstAnalysis).toHaveProperty('id');
      expect(firstAnalysis).toHaveProperty('title');
      expect(firstAnalysis).toHaveProperty('slug');
      expect(firstAnalysis).toHaveProperty('authorId');

      // Check specific seeded data
      const seededAnalysis = analyses.find((a) => a.slug === 'pierwsza-analiza');
      expect(seededAnalysis).toBeDefined();
      expect(seededAnalysis?.title).toBe('Pierwsza analiza CASN');
      expect(typeof seededAnalysis?.authorId).toBe('number');
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
        runSeed();
      } catch (e) {
        // runSeed już filtruje “duplikaty”; jeśli tu wpadniemy, to znaczy realny błąd
        throw e;
      }

      // Count should remain the same (idempotent)
      const countAfter = await articleRepository.count();
      expect(countAfter).toBe(countBefore);
    },
    TEST_TIMEOUT_MS
  );
});