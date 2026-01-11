// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds
export const runtime = "nodejs";

import { AppDataSource } from './db';

// Import entities to ensure they're registered with TypeORM
import './entities/Author';
import './entities/Analysis';

export async function initializeDatabase() {
  // Check for database configuration
  const hasDatabaseConfig = !!(
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
  );

  console.log('Database config check:', {
    hasDatabaseConfig,
    DATABASE_URL: !!process.env.DATABASE_URL,
    DB_HOST: !!process.env.DB_HOST,
    DB_USER: !!process.env.DB_USER,
    DB_NAME: !!process.env.DB_NAME,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PHASE: process.env.NEXT_PHASE
  });

  if (!hasDatabaseConfig) {
    console.log('Skipping database initialization - no database configured');
    return AppDataSource;
  }

  // Skip for unit tests without DATABASE_URL
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
    console.log('Skipping database initialization - unit test mode without DATABASE_URL');
    return AppDataSource;
  }

  if (!AppDataSource) {
    console.log('AppDataSource is null - database configuration failed');
    return null;
  }

  if (!AppDataSource.isInitialized) {
    try {
      console.log('Initializing database connection...');
      console.log('Connection config:', {
        host: process.env.DB_HOST || 'from DATABASE_URL',
        port: process.env.DB_PORT || 'from DATABASE_URL',
        database: process.env.DB_NAME || 'from DATABASE_URL',
        user: process.env.DB_USER || 'from DATABASE_URL'
      });

      await AppDataSource.initialize();
      console.log('Database connection established successfully');

      // Always run migrations (never synchronize) - this ensures schema + data consistency
      console.log('Checking SKIP_TYPEORM_MIGRATE:', process.env.SKIP_TYPEORM_MIGRATE);
      if (process.env.SKIP_TYPEORM_MIGRATE !== '1') {
        console.log('Running database migrations...');
        await AppDataSource.runMigrations();
        console.log('Database migrations completed successfully');

        // Verify migrations actually worked by checking database content
        console.log('Verifying migration success...');
        try {
          const authorCount = await AppDataSource.getRepository('Author').count();
          const analysisCount = await AppDataSource.getRepository('Analysis').count();

          console.log(`Verification results: ${authorCount} authors, ${analysisCount} analyses`);

          if (authorCount === 0 || analysisCount === 0) {
            console.warn('Migration verification failed: Expected data not found in database');
            console.warn('This may indicate migration data was not inserted properly');
          } else {
            console.log('Migration verification successful: Data found in database');
          }
        } catch (verificationError) {
          console.error('Migration verification failed:', verificationError.message);
          console.warn('Migrations may have completed but verification failed');
        }
      } else {
        console.log('Skipping database migrations (SKIP_TYPEORM_MIGRATE set)');
      }

      console.log('Database initialization completed');
    } catch (error) {
      console.error('Database initialization failed:', error);

      // Handle specific encoding errors
      if (error.message && error.message.includes('Encoding not recognized')) {
        console.error('Encoding error detected - this may be resolved by removing charset/collation settings');
        console.error('Try: Remove charset and collation from database config');
      }

      console.error('Error details:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState
      });

      // Don't throw in production - just log and continue
      console.log('Continuing without database connection');
      return AppDataSource;
    }
  } else {
    console.log('Database already initialized');
  }

  return AppDataSource;
}

// Export the data source for convenience
export { AppDataSource };