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
    synchronize: !isProduction,
    logging: !isProduction,
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

export const AppDataSource = new DataSource({
  ...dbConfig,
  entities: [], // Load entities conditionally to avoid validation during build
  migrations: isProduction ? ['dist/migrations/*.js'] : ['lib/migrations/*.ts'],
  subscribers: [],
});

// Add entities conditionally to avoid build-time validation
if (dbConfig.type) {
  AppDataSource.setOptions({
    ...AppDataSource.options,
    entities: [AuthorSchema, AnalysisSchema],
  });
}

// For production, ensure database is initialized synchronously
if (isProduction) {
  // This will be handled by the application startup
  console.log('Database will be initialized by application startup');
}