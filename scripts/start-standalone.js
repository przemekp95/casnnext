/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { initializeDatabase } = require('../lib/init-db');
const standaloneServerPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');

function ensureStandaloneBuildExists() {
  if (fs.existsSync(standaloneServerPath)) {
    return;
  }

  console.error(
    '[BOOT] Missing .next/standalone/server.js. Run `npm run build` before `npm start`.'
  );
  process.exit(1);
}

async function bootstrapDatabase() {
  try {
    console.log('[BOOT] Starting database bootstrap...');
    await initializeDatabase();
    console.log('[BOOT] Database bootstrap completed successfully');
  } catch (error) {
    console.error('[BOOT] Database bootstrap failed:', error);

    if (process.env.NODE_ENV === 'production') {
      console.warn('[BOOT] Continuing without database connection');
      return;
    }

    throw error;
  }
}

async function main() {
  ensureStandaloneBuildExists();

  process.env.HOSTNAME = process.env.HOSTNAME || process.env.HOST || '0.0.0.0';

  await bootstrapDatabase();

  console.log('[BOOT] Starting Next.js standalone server...');
  require(standaloneServerPath);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
