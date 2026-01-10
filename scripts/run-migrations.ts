#!/usr/bin/env tsx

import 'reflect-metadata';
import { AppDataSource } from '../lib/db';

async function runMigrations() {
  try {
    console.log('🔄 === RUNNING TYPEORM MIGRATIONS ===');

    await AppDataSource.initialize();
    console.log('✅ Database connected');

    await AppDataSource.runMigrations();
    console.log('✅ Migrations completed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();