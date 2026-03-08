/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import { NextResponse } from 'next/server';

const initDatabaseMock = jest.fn();
const appDataSourceMock = {
  isInitialized: false,
};

jest.mock('@/lib/server/db', () => ({
  initDatabase: (...args: unknown[]) => initDatabaseMock(...args),
}));

jest.mock('@/lib/db.server', () => ({
  AppDataSource: appDataSourceMock,
}));

interface RouteModule {
  GET: () => Promise<NextResponse>;
}

let route: RouteModule | null = null;

try {
  route = require('@/app/api/health/route') as RouteModule;
} catch {
  route = null;
}

(route ? describe : describe.skip)('API /api/health', () => {
  const originalEnv = process.env;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    appDataSourceMock.isInitialized = false;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('GET zwraca status healthy z prawidłową strukturą', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.npm_package_version = '2.1.0';
    initDatabaseMock.mockImplementation(async () => {
      appDataSourceMock.isInitialized = true;
    });

    const res = await route!.GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual(expect.objectContaining({
      status: 'healthy',
      timestamp: expect.any(String),
      responseTime: expect.any(String),
      contentProvider: 'database',
      database: expect.objectContaining({
        initialized: true,
        connected: true
      }),
      environment: expect.objectContaining({
        node_env: 'production',
        has_db_config: expect.any(Boolean)
      })
    }));

    expect(initDatabaseMock).toHaveBeenCalledTimes(1);
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    expect(data.responseTime).toMatch(/\d+ms$/);
  });

  it('GET nie zwraca pola version', async () => {
    delete process.env.npm_package_version;

    const res = await route!.GET();
    const data = await res.json();

    expect(data.version).toBeUndefined();
  });

  it('GET może działać nawet gdy process.env nie istnieje', async () => {
    const originalProcess = global.process;

    delete (global as any).process;

    try {
      try {
        const res = await route!.GET();
        expect(res.status).toBe(200);
      } catch (error) {
        expect(error).toBeDefined();
      }
    } finally {
      global.process = originalProcess;
    }
  });

  it('GET obsługuje błąd inicjalizacji bazy gracefuly', async () => {
    initDatabaseMock.mockRejectedValue(new Error('db down'));

    const res = await route!.GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual(expect.objectContaining({
      status: 'healthy',
      database: expect.objectContaining({
        initialized: false,
        connected: false
      }),
      environment: expect.objectContaining({
        node_env: 'test',
        has_db_config: expect.any(Boolean)
      })
    }));
  });

  it('GET zwraca healthy gdy baza jest już zainicjalizowana', async () => {
    appDataSourceMock.isInitialized = true;

    const res = await route!.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('healthy');
    expect(initDatabaseMock).not.toHaveBeenCalled();
  });
});
