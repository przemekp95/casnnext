// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds
export const runtime = "nodejs";

import { AppDataSource } from './db';
import { AuthorSchema, AnalysisSchema } from './entities';

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

      // Always run migrations (never synchronize) - this ensures schema + data consistency
      if (process.env.SKIP_TYPEORM_MIGRATE !== '1') {
        console.log('Running database migrations...');
        await AppDataSource.runMigrations();
        console.log('Database migrations completed successfully');
      } else {
        console.log('Skipping database migrations (SKIP_TYPEORM_MIGRATE set)');
      }

      // No more conditional seeding - data should be in migrations
      console.log('Database initialization completed');
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