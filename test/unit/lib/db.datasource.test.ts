const ENV_KEYS = ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function snapshotEnv(): EnvSnapshot {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadModule() {
  jest.resetModules();
  const DataSourceMock = jest.fn().mockImplementation((config) => ({ config }));
  const EntitySchemaMock = jest.fn().mockImplementation((value) => value);
  jest.doMock('typeorm', () => ({
    DataSource: DataSourceMock,
    EntitySchema: EntitySchemaMock,
  }));

  const mod = await import('@/lib/db.datasource');
  return { mod, DataSourceMock };
}

describe('lib/db.datasource', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('builds MySQL config from DATABASE_URL when provided', async () => {
    process.env.DATABASE_URL = 'mysql://db_user:db_pass@example.local:3309/casn_ci';
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;

    const { mod, DataSourceMock } = await loadModule();

    expect(DataSourceMock).toHaveBeenCalledTimes(1);
    const [config] = DataSourceMock.mock.calls[0];

    expect(config.type).toBe('mysql');
    expect(config.host).toBe('example.local');
    expect(config.port).toBe(3309);
    expect(config.username).toBe('db_user');
    expect(config.password).toBe('db_pass');
    expect(config.database).toBe('casn_ci');
    expect(config.synchronize).toBe(false);
    expect(config.entities).toHaveLength(2);
    expect(config.migrations).toEqual(['migrations/*.ts']);
    expect(mod.default).toBeDefined();
  });

  it('falls back to test DB_* variables when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '3310';
    process.env.DB_USER = 'root';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_NAME = 'casn_test_custom';

    const { DataSourceMock } = await loadModule();
    const [config] = DataSourceMock.mock.calls[0];

    expect(config.type).toBe('mysql');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3310);
    expect(config.username).toBe('root');
    expect(config.password).toBe('secret');
    expect(config.database).toBe('casn_test_custom');
    expect(config.synchronize).toBe(false);
    expect(config.logging).toBe(false);
  });
});
