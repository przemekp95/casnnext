import { initializeDatabase, AppDataSource } from '@/lib/init-db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const startTime = Date.now();

    // Check if database is initialized, if not, initialize it
    let dbInitialized = false;
    if (AppDataSource && AppDataSource.isInitialized) {
      dbInitialized = true;
    } else {
      console.log('Health check: Database not initialized, triggering initialization...');
      const result = await initializeDatabase();
      dbInitialized = !!result;
    }

    const responseTime = Date.now() - startTime;

    // Basic health check
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
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
    };

    return NextResponse.json(healthData);

  } catch (error) {
    console.error('Health check failed:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      database: {
        initialized: false,
        connected: false
      }
    }, { status: 503 });
  }
}