/* eslint-disable @typescript-eslint/no-require-imports */
import { execSync } from 'child_process';
import { AppDataSource } from '@/lib/db';

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

  it('seed script populates database with initial data', async () => {
    // Clear existing data first to ensure clean test state
    // Clear child table first (Analysis) then parent table (Author) to avoid FK constraints
    const authorRepository = AppDataSource.getRepository('Author');
    const analysisRepository = AppDataSource.getRepository('Analysis');

    // Use query to disable FK checks temporarily for clean truncation
    await AppDataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await analysisRepository.clear();
      await authorRepository.clear();
    } finally {
      await AppDataSource.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    // Run the seeding script
    try {
      execSync('npx tsx scripts/seed.ts', {
        stdio: 'pipe',
        timeout: 30000,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL || 'mysql://testuser:testpass@localhost:3306/casn_test'
        }
      });
    } catch (error) {
      // If seeding fails because data already exists, that's ok for this test
      console.log('Seeding completed (data may already exist)');
    }

    // Verify that analyses were created using TypeORM
    const analyses = await analysisRepository.find({
      order: { id: 'ASC' }
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
    const seededAnalysis = analyses.find(a => a.slug === 'pierwsza-analiza');
    expect(seededAnalysis).toBeDefined();
    expect(seededAnalysis?.title).toBe('Pierwsza analiza CASN');
    expect(typeof seededAnalysis?.authorId).toBe('number');
  });



  it('seed script only runs once (idempotent)', async () => {
    // Count articles before second seed attempt
    const articleRepository = AppDataSource.getRepository('Analysis');
    const countBefore = await articleRepository.count();

    // Try to run seed again
    try {
      execSync('npx tsx scripts/seed.ts', {
        stdio: 'pipe',
        timeout: 30000,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL || 'mysql://testuser:testpass@localhost:3306/casn_test'
        }
      });
    } catch (error) {
      // Expected if data already exists
    }

    // Count should remain the same (idempotent)
    const countAfter = await articleRepository.count();
    expect(countAfter).toBe(countBefore);
  });
});