type AuthorFixture = {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  bio: string;
  img: string;
};

type AnalysisFixture = {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  contentMdx: string;
  author: Pick<AuthorFixture, 'id' | 'name' | 'slug' | 'img'>;
};

type RepositoryFixture = AuthorFixture | AnalysisFixture;

type RepositoryFindOptions = {
  where?: {
    slug?: string;
  };
  order?: {
    name?: 'ASC';
  };
};

type MockRepository = {
  findOne: jest.Mock<Promise<RepositoryFixture | null>, [RepositoryFindOptions]>;
  find: jest.Mock<Promise<RepositoryFixture[]>, [RepositoryFindOptions?]>;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

const authorFixture: AuthorFixture = {
  id: 'author-1',
  name: 'First Author',
  displayName: 'First Author',
  slug: 'first-author',
  bio: 'First author biography',
  img: '/images/first-author.jpg',
};

const analysisFixture: AnalysisFixture = {
  id: 'analysis-1',
  title: 'First analysis',
  slug: 'first-analysis',
  authorId: 'author-1',
  contentMdx: '# First',
  author: {
    id: authorFixture.id,
    name: authorFixture.name,
    slug: authorFixture.slug,
    img: authorFixture.img,
  },
};

const mockRepository: MockRepository = {
  findOne: jest.fn<Promise<RepositoryFixture | null>, [RepositoryFindOptions]>().mockImplementation((options) => {
    if (options.where?.slug === authorFixture.slug) {
      return Promise.resolve(authorFixture);
    }

    if (options.where?.slug === analysisFixture.slug) {
      return Promise.resolve(analysisFixture);
    }

    return Promise.resolve(null);
  }),
  find: jest.fn<Promise<RepositoryFixture[]>, [RepositoryFindOptions?]>().mockImplementation((options) => {
    if (options?.order?.name === 'ASC') {
      return Promise.resolve([authorFixture]);
    }

    return Promise.resolve([analysisFixture]);
  }),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

export const query = jest.fn<Promise<{ ok: number }[]>, [sql: string]>().mockImplementation((sql) => {
  if (sql.includes('SELECT 1 AS ok')) {
    return Promise.resolve([{ ok: 1 }]);
  }

  return Promise.resolve([]);
});

export const AppDataSource = {
  getRepository: jest.fn<typeof mockRepository, [entityName: string]>().mockImplementation(() => mockRepository),
  getMetadata: jest.fn().mockReturnValue({
    name: 'MockEntity',
    target: class MockEntity {},
  }),
  initialize: jest.fn().mockResolvedValue(undefined),
  isInitialized: true,
  destroy: jest.fn().mockResolvedValue(undefined),
};

export const buildConfig = jest.fn().mockImplementation(() => {
  const config: Record<string, unknown> = {
    waitForConnections: true,
    queueLimit: 0,
  };

  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'invalid-url') {
    try {
      const url = new URL(process.env.DATABASE_URL);
      config.user = url.username;
      config.password = url.password;
      config.database = url.pathname.slice(1);
      config.host = url.hostname;
      config.port = Number.parseInt(url.port, 10) || 3306;

      const socketPath = url.searchParams.get('socket');
      if (socketPath) {
        config.socketPath = socketPath;
        delete config.host;
        delete config.port;
      }
    } catch {
      // Fall back to individual environment variables for malformed URLs.
    }
  }

  if (process.env.DB_USER) config.user = process.env.DB_USER;
  if (process.env.DB_PASS) config.password = process.env.DB_PASS;
  if (process.env.DB_NAME) config.database = process.env.DB_NAME;
  if (process.env.DB_HOST) config.host = process.env.DB_HOST;
  if (process.env.DB_PORT) config.port = Number.parseInt(process.env.DB_PORT, 10);

  if (process.env.DB_SOCKET) {
    config.socketPath = process.env.DB_SOCKET;
    delete config.host;
    delete config.port;
  }

  config.connectionLimit = process.env.DB_CONN_LIMIT
    ? Number.parseInt(process.env.DB_CONN_LIMIT, 10)
    : 2;

  return config;
});

export const getPool = jest.fn();
