import { initDatabase } from '@/lib/server/db';
import { AppDataSource } from '@/lib/db.server';
import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();
  let dbInitialized = false;

  if (AppDataSource && AppDataSource.isInitialized) {
    dbInitialized = true;
  } else {
    try {
      console.log('Health check: Database not initialized, triggering initialization...');
      await initDatabase();
      dbInitialized = AppDataSource?.isInitialized || false;
    } catch (error) {
      console.warn('Health check: database initialization failed, continuing with degraded DB status:', error);
      dbInitialized = AppDataSource?.isInitialized || false;
    }
  }

  const responseTime = Date.now() - startTime;

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    responseTime: `${responseTime}ms`,
    contentProvider: 'database',
    database: {
      initialized: dbInitialized,
      connected: AppDataSource?.isInitialized || false
    },
    cmsSync: {
      configured: !!(
        process.env.STRAPI_INTERNAL_URL ||
        process.env.CMS_URL ||
        process.env.NEXT_PUBLIC_STRAPI_URL
      ),
      webhookSecretConfigured: !!(
        process.env.CMS_SYNC_SECRET ||
        process.env.STRAPI_WEBHOOK_SECRET ||
        process.env.REVALIDATE_SECRET
      ),
    },
    environment: {
      node_env: process.env.NODE_ENV,
      has_db_config: !!(
        process.env.DATABASE_URL ||
        (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
      )
    }
  });
}
