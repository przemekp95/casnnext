/** @jest-environment node */

import { NextResponse } from 'next/server';

interface DataSourceBoundary {
  isInitialized: boolean;
  initialize: () => Promise<void>;
  query: (sql: string) => Promise<unknown>;
}

interface RouteModule {
  GET: () => Promise<NextResponse>;
}

async function loadRoute({
  configured,
  dataSource,
}: {
  configured: boolean;
  dataSource: DataSourceBoundary | null;
}): Promise<RouteModule> {
  jest.resetModules();
  jest.doMock('@/lib/db.server', () => ({
    AppDataSource: dataSource,
    isDatabaseConfigured: () => configured,
  }));

  return import('@/app/api/health/route');
}

function createDataSource({
  initialized = false,
  initialize,
  query,
}: Partial<DataSourceBoundary> = {}): DataSourceBoundary {
  return {
    isInitialized: initialized,
    initialize: initialize ?? (async () => undefined),
    query: query ?? (async () => [{ ok: 1 }]),
  };
}

describe('API /api/health readiness', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_REVISION;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('reports an unconfigured database without exposing configuration details', async () => {
    const route = await loadRoute({ configured: false, dataSource: null });

    const response = await route.GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      database: 'not_configured',
    });
  });

  it('reports ready after connecting and probing an available database', async () => {
    const dataSource = createDataSource({
      initialize: async () => {
        dataSource.isInitialized = true;
      },
      query: async (sql) => {
        if (sql !== 'SELECT 1') {
          throw new Error('readiness must use a minimal database probe');
        }
      },
    });
    const route = await loadRoute({ configured: true, dataSource });

    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
    });
  });

  it('uses an already initialized database without reconnecting', async () => {
    const route = await loadRoute({
      configured: true,
      dataSource: createDataSource({
        initialized: true,
        initialize: async () => {
          throw new Error('the initialized database must not reconnect');
        },
        query: async (sql) => {
          if (sql !== 'SELECT 1') {
            throw new Error('readiness must use a minimal database probe');
          }
        },
      }),
    });

    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
    });
  });

  it('reports unavailable when connecting to the database fails', async () => {
    const route = await loadRoute({
      configured: true,
      dataSource: createDataSource({
        initialize: async () => {
          throw new Error('database password leaked here');
        },
      }),
    });

    const response = await route.GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      database: 'unavailable',
    });
  });

  it('reports unavailable when the database probe fails', async () => {
    const route = await loadRoute({
      configured: true,
      dataSource: createDataSource({
        initialized: true,
        query: async () => {
          throw new Error('connection target must remain private');
        },
      }),
    });

    const response = await route.GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      database: 'unavailable',
    });
  });

  it('includes an explicit non-empty revision only', async () => {
    process.env.APP_REVISION = 'build-2026-08-25';
    const route = await loadRoute({
      configured: true,
      dataSource: createDataSource({ initialized: true }),
    });

    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
      revision: 'build-2026-08-25',
    });
  });
});
