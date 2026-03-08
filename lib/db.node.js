const { DataSource } = require('typeorm');

// Import schemas directly (no server-only)
const { AuthorSchema } = require('./entities/Author');
const { AnalysisSchema } = require('./entities/Analysis');
const { IssueCollectionSchema } = require('./entities/IssueCollection');

// Static import of migration class (required for Node.js bundling)
const { InitialSetup1736424470000 } = require('../migrations/1736424470000-InitialSetup');
const { AddCmsReadModel1736424470002 } = require('../migrations/1736424470002-AddCmsReadModel');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Production-ready configuration with automatic migrations
const databaseUrl = process.env.DATABASE_URL;
let dbConfig;

if (databaseUrl) {
  // Parse DATABASE_URL for connection details
  const url = new URL(databaseUrl);
  dbConfig = {
    type: 'mysql',
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
    type: 'mysql',
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
    type: 'mysql',
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
let _appDataSource = null;

const getDataSource = () => {
  if (!hasDatabaseConfig) return null;

  if (!_appDataSource) {
    _appDataSource = new DataSource({
      ...dbConfig,
      entities: [AuthorSchema, AnalysisSchema, IssueCollectionSchema],
      migrations: [
        InitialSetup1736424470000,
        AddCmsReadModel1736424470002,
      ], // Static migration imports keep the Node bootstrap deterministic.
      migrationsRun: true, // Automatically run migrations on startup
      subscribers: [],
    });
  }
  return _appDataSource;
};

// Export AppDataSource
const AppDataSource = getDataSource();

// Helper function to check if database is configured
const isDatabaseConfigured = () => hasDatabaseConfig;

// Query helper for tests (only available in test environment)
const query = async (sql, params) => {
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

module.exports = { AppDataSource, isDatabaseConfigured, query };
