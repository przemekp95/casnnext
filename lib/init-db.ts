// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds

import { AppDataSource } from './db';

// Import entities to ensure they're registered with TypeORM
import './entities/Author';
import './entities/Analysis';
import { AuthorSchema } from './entities/Author';
import { AnalysisSchema } from './entities/Analysis';

export async function initializeDatabase() {
  // Skip initialization during build/static generation if no database is configured
  if ((!process.env.DB_HOST && !process.env.DATABASE_URL) || process.env.NODE_ENV === 'test') {
    console.log('Skipping database initialization - no database configured or in test mode');
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