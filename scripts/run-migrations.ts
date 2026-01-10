#!/usr/bin/env tsx

import { AppDataSource } from '../lib/db';

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

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();