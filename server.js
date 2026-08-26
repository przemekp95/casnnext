/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require('http');
const next = require('next');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { AppDataSource, isDatabaseConfigured } = require('./lib/db.shared');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Bootstrap function - runs once before starting the server
async function bootstrap() {
  if (!isDatabaseConfigured() || !AppDataSource) {
    console.warn('[BOOT] Database is not configured; readiness remains 503');
    return;
  }

  try {
    console.log('[BOOT] Starting database bootstrap...');

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    await AppDataSource.query('SELECT 1');

    console.log('[BOOT] Database bootstrap completed successfully');
    console.log('[BOOT] Starting Next.js server...');

  } catch (error) {
    console.error('[BOOT] Database bootstrap failed:', error);
    console.warn('[BOOT] Continuing without database connection; readiness remains 503 until it is available');
  }
}

// Start the application
async function startServer() {
  try {
    await bootstrap();

    await app.prepare();

    const server = createServer((req, res) => {
      return handle(req, res);
    });

    server.listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://${hostname}:${port}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
