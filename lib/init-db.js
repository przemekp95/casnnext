// JavaScript wrapper for TypeScript database initialization
// This file exists as a bridge between server.cjs and TypeScript modules

const { AppDataSource } = require('./db.node');

let initialized = false;
const DOMANSKA_NAME = 'prof. Agnieszka Domańska';
const DOMANSKA_IMAGE = '/images/Domanska.png';
const BALCEROWSKI_IMAGE = '/images/placeholder.png';
const MASIOR_NAME = 'adw. dr Michał Masior';

async function enforceDomanskaName() {
  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET name = ?, displayName = ?, img = ?
       WHERE (
         LOWER(slug) LIKE '%domanska%'
         OR LOWER(name) LIKE '%domanska%'
         OR LOWER(displayName) LIKE '%domanska%'
         OR LOWER(name) LIKE '%domańska%'
         OR LOWER(displayName) LIKE '%domańska%'
       )
       AND (
         name <> ?
         OR displayName <> ?
         OR COALESCE(img, '') <> ?
       )`,
      [
        DOMANSKA_NAME,
        DOMANSKA_NAME,
        DOMANSKA_IMAGE,
        DOMANSKA_NAME,
        DOMANSKA_NAME,
        DOMANSKA_IMAGE,
      ]
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

async function enforceBalcerowskiImage() {
  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET img = ?
       WHERE (
         LOWER(slug) LIKE '%balcerowski%'
         OR LOWER(name) LIKE '%balcerowski%'
         OR LOWER(displayName) LIKE '%balcerowski%'
       )
       AND COALESCE(img, '') <> ?`,
      [BALCEROWSKI_IMAGE, BALCEROWSKI_IMAGE]
    );

    const affectedRows = result && typeof result.affectedRows === 'number'
      ? result.affectedRows
      : 0;

    if (affectedRows > 0) {
      console.log('[BOOT] Corrected Balcerowski image -> /images/placeholder.png');
    }
  } catch (error) {
    console.warn('[BOOT] Could not enforce balcerowski image overwrite:', error.message);
  }
}

async function enforceMasiorName() {
  try {
    const result = await AppDataSource.query(
      `UPDATE Author
       SET name = ?, displayName = ?
       WHERE (
         LOWER(slug) LIKE '%masior%'
         OR LOWER(name) LIKE '%masior%'
         OR LOWER(displayName) LIKE '%masior%'
       )
       AND (
         name <> ?
         OR displayName <> ?
       )`,
      [MASIOR_NAME, MASIOR_NAME, MASIOR_NAME, MASIOR_NAME]
    );

    const affectedRows = result && typeof result.affectedRows === 'number'
      ? result.affectedRows
      : 0;

    if (affectedRows > 0) {
      console.log(`[BOOT] Corrected author masior -> ${MASIOR_NAME}`);
    }
  } catch (error) {
    console.warn('[BOOT] Could not enforce masior name overwrite:', error.message);
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
    await enforceBalcerowskiImage();
    await enforceMasiorName();

    initialized = true;
    console.log('[BOOT] Database initialization completed');
    return AppDataSource;

  } catch (error) {
    console.error('[BOOT] Database initialization failed:', error.message);
    throw error;
  }
}

module.exports = { initializeDatabase, AppDataSource };
