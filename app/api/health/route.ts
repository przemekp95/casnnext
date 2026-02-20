import { initDatabase } from '@/lib/server/db';
import { AppDataSource } from '@/lib/db.server';
import { NextResponse } from 'next/server';
import { getContentProvider } from '@/lib/content-provider';

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
    contentProvider: getContentProvider(),
    database: {
      initialized: dbInitialized,
      connected: AppDataSource?.isInitialized || false
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
