export const runtime = "nodejs";

import { DataSource } from 'typeorm';
import { AuthorSchema } from './entities/Author';
import { AnalysisSchema } from './entities/Analysis';

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
}

// Support for DATABASE_URL environment variable (used in CI/testing)
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
    synchronize: false, // Never synchronize - use migrations
    logging: !isProduction && !isTest,
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
    synchronize: false, // Don't synchronize in tests - use migrations
    logging: false,
    dropSchema: false,
  };
} else {
  // Fallback to individual environment variables
  dbConfig = {
    type: 'mysql' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'casn',
    synchronize: !isProduction,
    logging: !isProduction,
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
      migrations: isProduction ? ['dist/migrations/*.js'] : ['lib/migrations/*.ts'],
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