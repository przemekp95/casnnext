import { initializeDatabase } from '@/lib/init-db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('🚀 Manual database initialization triggered via API');

    const result = await initializeDatabase();

    if (result) {
      return NextResponse.json({
        success: true,
        message: 'Database initialization completed successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Database initialization failed - check logs',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Database initialization API error:', error);
    return NextResponse.json({
      success: false,
      message: 'Database initialization failed with error',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST() {
  // Same as GET for convenience
  return GET();
}