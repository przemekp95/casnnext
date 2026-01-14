import 'reflect-metadata';
import { AppDataSource } from '../db.server';

let initialized = false;

export async function initDatabase() {
  if (initialized) return;

  console.log('[DB] Initializing database…');

  await AppDataSource.initialize();

  console.log('[DB] Database initialized');
  initialized = true;
}