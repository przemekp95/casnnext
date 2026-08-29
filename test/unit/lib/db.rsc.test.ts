export {};

const ENV_KEYS = ['DATABASE_URL', 'RUN_DB_MIGRATIONS', 'DB_MIGRATION_CONFIRM'] as const;

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

async function loadRscDataSource() {
  jest.resetModules();
  const initialize = jest.fn().mockResolvedValue(undefined);
  const DataSourceMock = jest.fn().mockImplementation((config) => ({
    config,
    isInitialized: false,
    initialize,
  }));

  jest.doMock('server-only', () => ({}));
  const EntitySchemaMock = jest.fn().mockImplementation((value) => value);
  jest.doMock('typeorm', () => ({
    DataSource: DataSourceMock,
    EntitySchema: EntitySchemaMock,
  }));

  const mod = await import('@/lib/db.rsc');
  return { mod, DataSourceMock, initialize };
}

describe('lib/db.rsc explicit migration policy', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
    jest.resetModules();
    jest.clearAllMocks();
  });

  it.each([
    {},
    { RUN_DB_MIGRATIONS: '1' },
    { DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' },
    { RUN_DB_MIGRATIONS: 'true', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' },
    { RUN_DB_MIGRATIONS: '1', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' },
  ] as const)('keeps migrationsRun disabled for %o', async (migrationEnv) => {
    process.env.DATABASE_URL = 'mysql://casn_user:casn_pass@db.internal:3308/casn_prod';
    delete process.env.RUN_DB_MIGRATIONS;
    delete process.env.DB_MIGRATION_CONFIRM;
    Object.assign(process.env, migrationEnv);

    const { mod, DataSourceMock, initialize } = await loadRscDataSource();
    await mod.createRscDataSource();

    const [config] = DataSourceMock.mock.calls[0];
    expect(config.migrationsRun).toBe(false);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
