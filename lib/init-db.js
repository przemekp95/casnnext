// JavaScript wrapper for TypeScript database initialization
// This file exists as a bridge between server.js (JS) and TypeScript modules

/* eslint-disable @typescript-eslint/no-require-imports */
const { AppDataSource } = require('./db.node');

let initialized = false;
const DOMANSKA_NAME = 'dr Agnieszka Domańska';

async function enforceDomanskaName() {
  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET name = ?, displayName = ?
       WHERE slug = ?
         AND (name <> ? OR displayName <> ?)`,
      [DOMANSKA_NAME, DOMANSKA_NAME, 'domanska', DOMANSKA_NAME, DOMANSKA_NAME]
    );

    const affectedRows = result && typeof result.affectedRows === 'number'
      ? result.affectedRows
      : 0;

    if (affectedRows > 0) {
      console.log(`[BOOT] Corrected author domanska -> ${DOMANSKA_NAME}`);
    }
  } catch (error) {
    console.warn('[BOOT] Could not enforce domanska overwrite:', error.message);
  }
}

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

    await enforceDomanskaName();

    initialized = true;
    console.log('[BOOT] Database initialization completed');
    return AppDataSource;

  } catch (error) {
    console.error('[BOOT] Database initialization failed:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase, AppDataSource };
