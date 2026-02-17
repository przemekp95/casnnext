const ENV_KEYS = ['DATABASE_URL', 'DB_HOST', 'DB_USER', 'DB_NAME'] as const;

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

async function loadInitDbModule(appDataSource: unknown) {
  jest.resetModules();
  jest.doMock('@/lib/db.server', () => ({ AppDataSource: appDataSource }));
  return import('@/lib/server/init-db');
}

function createDataSource({
  isInitialized = false,
  tables = [{ Tables_in_casn: 'Author' }, { Tables_in_casn: 'Analysis' }],
  authorCount = 34,
  analysisCount = 39,
  knownAuthor = { slug: 'balcerowski' },
  queryError,
  initializeError,
}: {
  isInitialized?: boolean;
  tables?: Array<Record<string, string>>;
  authorCount?: number;
  analysisCount?: number;
  knownAuthor?: unknown;
  queryError?: Error;
  initializeError?: Error;
} = {}) {
  const query = queryError
    ? jest.fn().mockRejectedValue(queryError)
    : jest.fn().mockResolvedValue(tables);
  const release = jest.fn().mockResolvedValue(undefined);
  const queryRunner = { query, release };

  const authorRepo = {
    count: jest.fn().mockResolvedValue(authorCount),
    findOne: jest.fn().mockResolvedValue(knownAuthor),
  };
  const analysisRepo = {
    count: jest.fn().mockResolvedValue(analysisCount),
  };

  const getRepository = jest.fn().mockImplementation((entity: string) => {
    if (entity === 'Author') return authorRepo;
    return analysisRepo;
  });

  const initialize = initializeError
    ? jest.fn().mockRejectedValue(initializeError)
    : jest.fn().mockResolvedValue(undefined);

  return {
    dataSource: {
      isInitialized,
      initialize,
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      getRepository,
    },
    queryRunner,
    authorRepo,
    analysisRepo,
  };
}

describe('lib/server/init-db', () => {
  const originalEnv = snapshotEnv();
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    restoreEnv(originalEnv);
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns datasource when DB configuration is missing', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_USER;
    delete process.env.DB_NAME;

    const { dataSource } = createDataSource();
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(dataSource.initialize).not.toHaveBeenCalled();
  });

  it('skips initialization in test mode without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'root';
    process.env.DB_NAME = 'casn_test';

    const { dataSource } = createDataSource();
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(dataSource.initialize).not.toHaveBeenCalled();
  });

  it('returns null when datasource could not be created', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { initializeDatabase } = await loadInitDbModule(null);
    const result = await initializeDatabase();

    expect(result).toBeNull();
  });

  it('returns datasource immediately when already initialized', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { dataSource } = createDataSource({ isInitialized: true });
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(dataSource.initialize).not.toHaveBeenCalled();
  });

  it('initializes datasource and verifies migration data', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { dataSource, queryRunner, authorRepo, analysisRepo } = createDataSource();
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith('SHOW TABLES');
    expect(authorRepo.count).toHaveBeenCalledTimes(1);
    expect(analysisRepo.count).toHaveBeenCalledTimes(1);
    expect(authorRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'balcerowski' } });
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('returns early when required tables are missing', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { dataSource, queryRunner } = createDataSource({
      tables: [{ Tables_in_casn: 'Author' }],
    });
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(dataSource.getRepository).not.toHaveBeenCalled();
    expect(queryRunner.release).not.toHaveBeenCalled();
  });

  it('continues when verification query fails', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { dataSource } = createDataSource({
      queryError: new Error('Cannot inspect tables'),
    });
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(warnSpy).toHaveBeenCalledWith('Migrations may have completed but verification failed');
  });

  it('handles initialization errors and returns datasource', async () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/casn';

    const { dataSource } = createDataSource({
      initializeError: new Error('Encoding not recognized: cesu8'),
    });
    const { initializeDatabase } = await loadInitDbModule(dataSource);
    const result = await initializeDatabase();

    expect(result).toBe(dataSource);
    expect(errorSpy).toHaveBeenCalled();
  });
});
