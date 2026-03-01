import 'reflect-metadata';
import { AppDataSource } from '../db.server';
import {
  BALCEROWSKI_CANONICAL_IMAGE,
  DOMANSKA_CANONICAL_IMAGE,
  DOMANSKA_CANONICAL_NAME,
  MASIOR_CANONICAL_NAME,
} from './author-overrides';

let initialized = false;

async function enforceAuthorCanonicalOverrides() {
  if (!AppDataSource?.isInitialized) return;

  try {
    const domanskaResult = await AppDataSource.query(
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
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_IMAGE,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_NAME,
        DOMANSKA_CANONICAL_IMAGE,
      ]
    ) as { affectedRows?: number };

    if ((domanskaResult?.affectedRows ?? 0) > 0) {
      console.log(
        `[DB] Canonical override applied for Domańska (${domanskaResult.affectedRows} row(s))`
      );
    }
  } catch (error) {
    console.warn('[DB] Failed to enforce Domańska canonical override:', error);
  }

  try {
    const balcerowskiResult = await AppDataSource.query(
      `UPDATE Author
       SET img = ?
       WHERE (
         LOWER(slug) LIKE '%balcerowski%'
         OR LOWER(name) LIKE '%balcerowski%'
         OR LOWER(displayName) LIKE '%balcerowski%'
       )
       AND COALESCE(img, '') <> ?`,
      [BALCEROWSKI_CANONICAL_IMAGE, BALCEROWSKI_CANONICAL_IMAGE]
    ) as { affectedRows?: number };

    if ((balcerowskiResult?.affectedRows ?? 0) > 0) {
      console.log(
        `[DB] Canonical override applied for Balcerowski image (${balcerowskiResult.affectedRows} row(s))`
      );
    }
  } catch (error) {
    console.warn('[DB] Failed to enforce Balcerowski canonical image:', error);
  }

  try {
    const masiorResult = await AppDataSource.query(
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
      [
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
        MASIOR_CANONICAL_NAME,
      ]
    ) as { affectedRows?: number };

    if ((masiorResult?.affectedRows ?? 0) > 0) {
      console.log(
        `[DB] Canonical override applied for Masior (${masiorResult.affectedRows} row(s))`
      );
    }
  } catch (error) {
    console.warn('[DB] Failed to enforce Masior canonical name:', error);
  }
}

export async function initDatabase() {
  if (initialized) return;

  console.log('[DB] Initializing database…');

  await AppDataSource.initialize();
  await enforceAuthorCanonicalOverrides();

  console.log('[DB] Database initialized');
  initialized = true;
}
