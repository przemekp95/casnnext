// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds

import { AppDataSource } from './db';

// Import entities to ensure they're registered with TypeORM
import './entities/Author';
import './entities/Analysis';

export async function initializeDatabase() {
  // Skip initialization during build/static generation if no database is configured
  if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
    console.log('Skipping database initialization - no database configured');
    return AppDataSource;
  }

  // Skip for unit tests without DATABASE_URL
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
    console.log('Skipping database initialization - unit test mode without DATABASE_URL');
    return AppDataSource;
  }

  if (!AppDataSource.isInitialized) {
    try {
      console.log('Initializing database connection...');
      await AppDataSource.initialize();
      console.log('Database connection established successfully');

      // In production, ensure schema is synchronized if needed
      if (process.env.NODE_ENV === 'production') {
        console.log('Running database synchronization for production...');
        await AppDataSource.synchronize(false);
        console.log('Database schema synchronized');
      }

      // Seed database if empty (only in development/test, not production)
      if (process.env.NODE_ENV !== 'production') {
        await seedDatabaseIfEmpty();
      }
    } catch (error) {
      console.error('Database initialization failed:', error);
      // In build time, don't throw - just log and continue
      if (process.env.NODE_ENV === 'development' && process.env.NEXT_PHASE === 'phase-production-build') {
        console.log('Build time detected - continuing without database');
        return AppDataSource;
      }
      throw error;
    }
  } else {
    console.log('Database already initialized');
  }

  return AppDataSource;
}

// Export the data source for convenience
export { AppDataSource };

async function seedDatabaseIfEmpty() {
  try {
    const authorRepository = AppDataSource.getRepository('Author');
    const analysisRepository = AppDataSource.getRepository('Analysis');

    // Check if data already exists
    const authorCount = await authorRepository.count();
    const analysisCount = await analysisRepository.count();

    if (authorCount > 0 || analysisCount > 0) {
      console.log('Database already has data, skipping seeding');
      return;
    }

    console.log('Seeding database with initial data...');

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

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Database seeding failed:', error);
    // Don't throw - seeding failure shouldn't break app startup
  }
}