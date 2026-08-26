import 'server-only';

import { DataSource } from 'typeorm';
import { AuthorSchema } from './entities/Author';
import { AnalysisSchema } from './entities/Analysis';
import { IssueCollectionSchema } from './entities/IssueCollection';
import { InitialSetup1736424470000 } from '../migrations/1736424470000-InitialSetup';
import { AddCmsReadModel1736424470002 } from '../migrations/1736424470002-AddCmsReadModel';
import { shouldRunDatabaseMigrations } from './server/migration-policy';

// RSC-specific DataSource creation (not a global singleton)
// Each RSC call gets its own fresh connection
export async function createRscDataSource(): Promise<DataSource> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // Production-ready configuration with automatic migrations
  const databaseUrl = process.env.DATABASE_URL;
  let dbConfig;

  if (databaseUrl) {
    // Parse DATABASE_URL for connection details
    const url = new URL(databaseUrl);
    dbConfig = {
      type: 'mysql' as const,
      host: url.hostname,
      port: parseInt(url.port || '3306'),
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading slash
      synchronize: false, // Production: never use synchronize
      logging: !isProduction && !isTest,
      // Remove charset/collation to use MySQL defaults and avoid encoding conflicts
    };
  } else if (isTest) {
    // Use MySQL for testing with test database
    dbConfig = {
      type: 'mysql' as const,
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'casn_test',
      synchronize: false, // Tests: use migrations, not synchronize
      logging: false,
      dropSchema: false,
      // Remove charset/collation to use MySQL defaults and avoid encoding conflicts
    };
  } else {
    // Development: fallback to individual environment variables
    dbConfig = {
      type: 'mysql' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'casn',
      synchronize: false, // Development: use migrations for consistency
      logging: !isProduction,
      // Remove charset/collation to use MySQL defaults and avoid encoding conflicts
    };
  }

  const dataSource = new DataSource({
    ...dbConfig,
    entities: [AuthorSchema, AnalysisSchema, IssueCollectionSchema],
    migrations: [
      InitialSetup1736424470000,
      AddCmsReadModel1736424470002,
    ],
    migrationsRun: shouldRunDatabaseMigrations(process.env),
    subscribers: [],
  });

  // Initialize the connection
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  return dataSource;
}

// Helper function to execute queries with automatic connection management
export async function executeRscQuery<T>(
  queryFn: (dataSource: DataSource) => Promise<T>
): Promise<T> {
  const dataSource = await createRscDataSource();
  try {
    return await queryFn(dataSource);
  } finally {
    // Close connection after use (important for RSC)
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}
