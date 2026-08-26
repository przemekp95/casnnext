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

async function loadNodeDataSource() {
  jest.resetModules();
  const DataSourceMock = jest.fn().mockImplementation((config) => ({ config }));
  const EntitySchemaMock = jest.fn().mockImplementation((value) => value);
  jest.doMock('typeorm', () => ({
    DataSource: DataSourceMock,
    EntitySchema: EntitySchemaMock,
  }));

  await import('@/lib/db.node');
  return DataSourceMock;
}

describe('lib/db.node automatic migration policy', () => {
  const originalEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(originalEnv);
    jest.resetModules();
    jest.clearAllMocks();
  });

  it.each([
    [{}, false],
    [{ RUN_DB_MIGRATIONS: '1' }, false],
    [{ DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, false],
    [{ RUN_DB_MIGRATIONS: 'true', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, false],
    [{ RUN_DB_MIGRATIONS: '1', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, true],
  ] as const)('sets migrationsRun to %s for %o', async (migrationEnv, expected) => {
    process.env.DATABASE_URL = 'mysql://casn_user:casn_pass@db.internal:3308/casn_prod';
    delete process.env.RUN_DB_MIGRATIONS;
    delete process.env.DB_MIGRATION_CONFIRM;
    Object.assign(process.env, migrationEnv);

    const DataSourceMock = await loadNodeDataSource();
    const [config] = DataSourceMock.mock.calls[0];

    expect(config.migrationsRun).toBe(expected);
  });
});
