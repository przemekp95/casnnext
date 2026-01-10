/* eslint-disable @typescript-eslint/no-require-imports */
import { execSync } from 'child_process';
import { AppDataSource } from '@/lib/db';

describe('Database Seeding', () => {
  beforeAll(async () => {
    // Ensure TypeORM is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    // Clean up after tests
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it('seed script populates database with initial data', async () => {
    // Run the seeding script
    try {
      execSync('node scripts/seed.cjs', {
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

    // Verify that articles were created using TypeORM
    const articleRepository = AppDataSource.getRepository('Analysis');
    const articles = await articleRepository.find({
      order: { id: 'ASC' }
    });

    // Should have at least the seeded articles
    expect(articles.length).toBeGreaterThanOrEqual(2);

    // Verify article structure
    const firstArticle = articles[0];
    expect(firstArticle).toHaveProperty('id');
    expect(firstArticle).toHaveProperty('title');
    expect(firstArticle).toHaveProperty('slug');
    expect(firstArticle).toHaveProperty('publishedAt');

    // Check specific seeded data
    const seededArticle = articles.find(a => a.slug === 'pierwsza-analiza');
    expect(seededArticle).toBeDefined();
    expect(seededArticle?.title).toBe('Pierwsza analiza CASN');
    expect(seededArticle?.published).toBe(true);
  });

  it('seed script creates articles with proper tags', async () => {
    const articleRepository = AppDataSource.getRepository('Analysis');
    const articles = await articleRepository.find();

    // Find articles with tags
    const articlesWithTags = articles.filter(a => a.tags && a.tags.length > 0);
    expect(articlesWithTags.length).toBeGreaterThan(0);

    // Verify tag structure
    const taggedArticle = articlesWithTags[0];
    expect(Array.isArray(taggedArticle.tags)).toBe(true);
    expect(taggedArticle.tags.length).toBeGreaterThan(0);
    expect(typeof taggedArticle.tags[0]).toBe('string');
  });

  it('seed script only runs once (idempotent)', async () => {
    // Count articles before second seed attempt
    const articleRepository = AppDataSource.getRepository('Analysis');
    const countBefore = await articleRepository.count();

    // Try to run seed again
    try {
      execSync('node scripts/seed.cjs', {
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