// JavaScript wrapper for TypeScript database initialization
// This file exists as a bridge between server.js (JS) and TypeScript modules

const { AppDataSource } = require('./db.server');

let initialized = false;

async function initializeDatabase() {
  if (initialized) {
    console.log('[BOOT] Database already initialized, skipping');
    return AppDataSource;
  }

  console.log('[BOOT] Initializing database...');

  try {
    if (!AppDataSource) {
      throw new Error('AppDataSource is null - database configuration failed');
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('[BOOT] Database connection established successfully');

      // Verify tables exist
      const queryRunner = AppDataSource.createQueryRunner();
      const tables = await queryRunner.query('SHOW TABLES');
      const tableNames = tables.map((row) => Object.values(row)[0]);

      if (!tableNames.includes('Author') || !tableNames.includes('Analysis')) {
        console.error('[BOOT] Migration verification failed: Required tables do not exist');
        await queryRunner.release();
        throw new Error('Required database tables not found');
      }

      await queryRunner.release();
      console.log('[BOOT] Migration verification successful');
    }

    initialized = true;
    console.log('[BOOT] Database initialization completed');
    return AppDataSource;

  } catch (error) {
    console.error('[BOOT] Database initialization failed:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase, AppDataSource };