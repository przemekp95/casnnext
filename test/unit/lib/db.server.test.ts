export {};

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

async function loadModule(dataSourceShape: Record<string, unknown> = {}) {
  jest.resetModules();

  const DataSourceMock = jest.fn().mockImplementation((config) => ({
    config,
    isInitialized: false,
    ...dataSourceShape,
  }));

  const EntitySchemaMock = jest.fn().mockImplementation((value) => value);
  jest.doMock('typeorm', () => ({
    DataSource: DataSourceMock,
    EntitySchema: EntitySchemaMock,
  }));

  const mod = await import('@/lib/db.server');
  return { mod, DataSourceMock };
}

describe('lib/db.server', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('reports no DB configuration and returns null datasource', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;

    const { mod, DataSourceMock } = await loadModule();

    expect(mod.isDatabaseConfigured()).toBe(false);
    expect(mod.AppDataSource).toBeNull();
    expect(DataSourceMock).not.toHaveBeenCalled();

    await expect(mod.query('SELECT 1')).rejects.toThrow('Database not initialized');
  });

  it('parses DATABASE_URL and creates datasource with migrations enabled', async () => {
    process.env.DATABASE_URL = 'mysql://casn_user:casn_pass@db.internal:3308/casn_prod';
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;

    const { mod, DataSourceMock } = await loadModule();
    const [config] = DataSourceMock.mock.calls[0];

    expect(mod.isDatabaseConfigured()).toBe(true);
    expect(config.type).toBe('mysql');
    expect(config.host).toBe('db.internal');
    expect(config.port).toBe(3308);
    expect(config.username).toBe('casn_user');
    expect(config.password).toBe('casn_pass');
    expect(config.database).toBe('casn_prod');
    expect(config.migrationsRun).toBe(true);
    expect(config.synchronize).toBe(false);

    await expect(mod.query('SELECT 1')).rejects.toThrow('Database not initialized');
  });

  it('executes query and always releases query runner', async () => {
    process.env.DATABASE_URL = 'mysql://casn_user:casn_pass@localhost:3306/casn_test';

    const query = jest.fn().mockResolvedValue([{ id: 1 }]);
    const release = jest.fn().mockResolvedValue(undefined);
    const createQueryRunner = jest.fn().mockReturnValue({ query, release });

    const { mod } = await loadModule({
      isInitialized: true,
      createQueryRunner,
    });

    const result = await mod.query('SELECT * FROM Author WHERE id = ?', [1]);

    expect(result).toEqual([{ id: 1 }]);
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT * FROM Author WHERE id = ?', [1]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases query runner even when SQL execution fails', async () => {
    process.env.DATABASE_URL = 'mysql://casn_user:casn_pass@localhost:3306/casn_test';

    const query = jest.fn().mockRejectedValue(new Error('SQL failure'));
    const release = jest.fn().mockResolvedValue(undefined);
    const createQueryRunner = jest.fn().mockReturnValue({ query, release });

    const { mod } = await loadModule({
      isInitialized: true,
      createQueryRunner,
    });

    await expect(mod.query('SELECT broken')).rejects.toThrow('SQL failure');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
