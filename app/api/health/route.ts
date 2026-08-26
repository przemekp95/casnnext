import { AppDataSource, isDatabaseConfigured } from '@/lib/db.server';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!isDatabaseConfigured() || !AppDataSource) {
    return NextResponse.json(
      { status: 'not_ready', database: 'not_configured' },
      { status: 503 },
    );
  }

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    await AppDataSource.query('SELECT 1');

    const revision = process.env.APP_REVISION?.trim();

    return NextResponse.json({
      status: 'ready',
      database: 'connected',
      ...(revision ? { revision } : {}),
    });
  } catch {
    return NextResponse.json(
      { status: 'not_ready', database: 'unavailable' },
      { status: 503 },
    );
  }
}
