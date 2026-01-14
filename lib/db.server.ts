import 'server-only';

import { DataSource } from 'typeorm';
import { AuthorSchema } from './entities/Author';
import { AnalysisSchema } from './entities/Analysis';

// Static import of migration class (required for Next.js bundling)
import { InitialSetup1736424470000 } from '../migrations/1736424470000-InitialSetup';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Type for database configuration
interface DatabaseConfig {
  type: 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  dropSchema?: boolean;
  charset?: string;
  collation?: string;
}

// Production-ready configuration with automatic migrations
const databaseUrl = process.env.DATABASE_URL;
let dbConfig: DatabaseConfig;

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

// Check if database is configured
const hasDatabaseConfig = !!(databaseUrl || process.env.DB_HOST || process.env.DB_USER || process.env.DB_NAME);

// Lazy DataSource creation
let _appDataSource: DataSource | null = null;

const getDataSource = (): DataSource | null => {
  if (!hasDatabaseConfig) return null;

  if (!_appDataSource) {
    _appDataSource = new DataSource({
      ...dbConfig,
      entities: [AuthorSchema, AnalysisSchema],
      migrations: [InitialSetup1736424470000], // Static migration class import (Next.js compatible)
      migrationsRun: true, // Automatically run migrations on startup
      subscribers: [],
    });
  }
  return _appDataSource;
};

// Export AppDataSource - create with lazy entity loading
export const AppDataSource = getDataSource();

// Database initialization is handled by the application startup in each runtime

// Helper function to check if database is configured
export const isDatabaseConfigured = () => hasDatabaseConfig;

// Query helper for tests (only available in test environment)
export const query = async (sql: string, params?: unknown[]): Promise<unknown[]> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('query() is only available in test environment');
  }

  const dataSource = getDataSource();
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database not initialized');
  }

  const queryRunner = dataSource.createQueryRunner();
  try {
    const result = await queryRunner.query(sql, params);
    return result;
  } finally {
    await queryRunner.release();
  }
};