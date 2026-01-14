#!/usr/bin/env tsx

import { DataSource } from 'typeorm';
import { AuthorSchema } from '../lib/entities/Author';
import { AnalysisSchema } from '../lib/entities/Analysis';
import { InitialSetup1736424470000 } from '../migrations/1736424470000-InitialSetup';

const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'casn',
  synchronize: false, // Never synchronize in migrations
  logging: true,
  entities: [AuthorSchema, AnalysisSchema],
  migrations: [InitialSetup1736424470000],
});

async function runMigrations() {
  try {
    console.log('🔄 === RUNNING TYPEORM MIGRATIONS ===');

    await AppDataSource.initialize();
    console.log('✅ Database connected');

    // Check if we're in production (production uses migrations)
    // In development/CI, synchronize handles schema creation
    if (process.env.NODE_ENV === 'production') {
      await AppDataSource.runMigrations();
      console.log('✅ Migrations completed');
    } else {
      console.log('ℹ️  Skipping migrations in development/CI (using synchronize)');
    }

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

runMigrations();