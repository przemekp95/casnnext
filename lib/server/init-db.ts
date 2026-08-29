// Database initialization file to ensure entities are registered
// This file should be imported in the main application to ensure
// TypeORM entities are available in production builds
import 'server-only';

export const runtime = "nodejs";

import { AppDataSource } from '../db.server';
import {
  BALCEROWSKI_CANONICAL_IMAGE,
  DOMANSKA_CANONICAL_IMAGE,
  DOMANSKA_CANONICAL_NAME,
  MASIOR_CANONICAL_NAME,
} from './author-overrides';

// Import entities to ensure they're registered with TypeORM
import '../entities/Author';
import '../entities/Analysis';
import '../entities/IssueCollection';

async function enforceDomanskaName(): Promise<void> {
  if (!AppDataSource?.isInitialized) {
    return;
  }

  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET name = ?, displayName = ?, img = ?
       WHERE (
         LOWER(slug) LIKE '%domanska%'
         OR LOWER(name) LIKE '%domanska%'
         OR LOWER(displayName) LIKE '%domanska%'
         OR LOWER(name) LIKE '%domańska%'
         OR LOWER(displayName) LIKE '%domańska%'
       )
       AND (
         name <> ?
         OR displayName <> ?
         OR COALESCE(img, '') <> ?
       )`,
      [
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_IMAGE,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_IMAGE,
      ]
    ) as { affectedRows?: number };

    if ((result?.affectedRows ?? 0) > 0) {
      console.log(
        `Corrected Domańska canonical data (${result.affectedRows} row(s))`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Could not enforce domanska overwrite:', message);
  }
}

async function enforceBalcerowskiImage(): Promise<void> {
  if (!AppDataSource?.isInitialized) {
    return;
  }

  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET img = ?
       WHERE (
         LOWER(slug) LIKE '%balcerowski%'
         OR LOWER(name) LIKE '%balcerowski%'
         OR LOWER(displayName) LIKE '%balcerowski%'
       )
       AND COALESCE(img, '') <> ?`,
      [BALCEROWSKI_CANONICAL_IMAGE, BALCEROWSKI_CANONICAL_IMAGE]
    ) as { affectedRows?: number };

    if ((result?.affectedRows ?? 0) > 0) {
      console.log(
        `Corrected Balcerowski canonical image (${result.affectedRows} row(s))`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Could not enforce balcerowski image overwrite:', message);
  }
}

async function enforceMasiorName(): Promise<void> {
  if (!AppDataSource?.isInitialized) {
    return;
  }

  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET name = ?, displayName = ?
       WHERE (
         LOWER(slug) LIKE '%masior%'
         OR LOWER(name) LIKE '%masior%'
         OR LOWER(displayName) LIKE '%masior%'
       )
       AND (
         name <> ?
         OR displayName <> ?
       )`,
      [
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
      ]
    ) as { affectedRows?: number };

    if ((result?.affectedRows ?? 0) > 0) {
      console.log(
        `Corrected Masior canonical name (${result.affectedRows} row(s))`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Could not enforce masior name overwrite:', message);
  }
}

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
    throw new Error('Database configuration is required for initialization');
  }

  // Skip for unit tests without DATABASE_URL
  if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
    console.log('Skipping database initialization - unit test mode without DATABASE_URL');
    return AppDataSource;
  }

  if (!AppDataSource) {
    throw new Error('Database datasource could not be created');
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

      console.log('Database migrations require the explicit migration runner');

      // Verify migrations actually worked by checking database content
      console.log('Verifying migration success...');
      const queryRunner = AppDataSource.createQueryRunner();
      try {
        // Check if tables exist first
        const tables = await queryRunner.query('SHOW TABLES');
        const tableNames = tables.map((row: Record<string, unknown>) => Object.values(row)[0] as string);

        console.log('Available tables:', tableNames);

        if (!tableNames.includes('Author') || !tableNames.includes('Analysis')) {
          throw new Error('Migration verification failed: Required tables do not exist');
        }

        // Check actual data counts
        const authorCount = await AppDataSource.getRepository('Author').count();
        const analysisCount = await AppDataSource.getRepository('Analysis').count();

        console.log(`Verification results: ${authorCount} authors, ${analysisCount} analyses`);

        // Check for specific known data
        const knownAuthor = await AppDataSource.getRepository('Author').findOne({
          where: { slug: 'balcerowski' }
        });

        if (authorCount === 0 || analysisCount === 0 || !knownAuthor) {
          throw new Error('Migration verification failed: Expected data not found');
        } else {
          console.log('Migration verification successful: All expected data found in database');
          console.log(`Database contains ${authorCount} authors and ${analysisCount} analyses`);
        }

      } finally {
        await queryRunner.release();
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

      throw error;
    }
  } else {
    console.log('Database already initialized');
  }

  await enforceDomanskaName();
  await enforceBalcerowskiImage();
  await enforceMasiorName();

  return AppDataSource;
}

// Export the data source for convenience
export { AppDataSource };
