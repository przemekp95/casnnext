// Mock for @/lib/db module
export const query = jest.fn().mockImplementation((sql: string) => {
  if (sql.includes('SELECT 1 AS ok')) {
    return Promise.resolve([{ ok: 1 }]);
  }
  return Promise.resolve([]);
});

// Mock TypeORM Repository
const mockRepository = {
  findOne: jest.fn().mockImplementation((options) => {
    // Mock data based on the query
    if (options.where?.slug === 'test-author') {
      return Promise.resolve({
        id: 1,
        name: 'Test Author',
        slug: 'test-author',
        bio: 'Test biography',
        img: '/images/test-author.jpg',
        analyses: [
          { id: 1, title: 'Test Analysis', slug: 'test-analysis' },
          { id: 2, title: 'Another Analysis', slug: 'another-analysis' },
        ],
      });
    }
    if (options.where?.slug === 'test-author-no-analyses') {
      return Promise.resolve({
        id: 2,
        name: 'Test Author No Analyses',
        slug: 'test-author-no-analyses',
        bio: 'Test biography',
        img: '/images/test-author.jpg',
        analyses: [],
      });
    }
    if (options.where?.slug === 'non-existent-author') {
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  }),
  find: jest.fn().mockImplementation((options) => {
    // Mock authors list
    if (options?.order?.name === 'ASC') {
      return Promise.resolve([
        {
          id: 1,
          name: 'Jan Kowalski',
          slug: 'jan-kowalski',
          bio: 'Ekspert polityczny',
          img: '/images/author1.jpg',
        },
        {
          id: 2,
          name: 'Anna Nowak',
          slug: 'anna-nowak',
          bio: 'Analityk ekonomiczny',
          img: '/images/author2.jpg',
        },
      ]);
    }
    // Mock analyses list
    return Promise.resolve([
      {
        id: 1,
        title: 'Test Analysis 1',
        slug: 'test-analysis-1',
        author: {
          name: 'Test Author',
          slug: 'test-author',
          img: '/images/test-author.jpg',
        },
      },
      {
        id: 2,
        title: 'Test Analysis 2',
        slug: 'test-analysis-2',
        author: {
          name: 'Test Author 2',
          slug: 'test-author-2',
          img: '/images/test-author-2.jpg',
        },
      },
    ]);
  }),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

// Mock DataSource
export const AppDataSource = {
  getRepository: jest.fn().mockImplementation((_entityName: string) => {
    // Return the same mock repository for all entities
    return mockRepository;
  }),
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

  // Handle DATABASE_URL parsing
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'invalid-url') {
    try {
      const url = new URL(process.env.DATABASE_URL);
      config.user = url.username;
      config.password = url.password;
      config.database = url.pathname.slice(1);
      config.host = url.hostname;
      config.port = parseInt(url.port) || 3306;

      // Handle socket path from query params
      const socketPath = url.searchParams.get('socket');
      if (socketPath) {
        config.socketPath = socketPath;
        delete config.host;
        delete config.port;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // Invalid URL, fall back to individual env vars
    }
  }

  // Always check individual env vars (this will override DATABASE_URL if both are set)
  if (process.env.DB_USER) config.user = process.env.DB_USER;
  if (process.env.DB_PASS) config.password = process.env.DB_PASS;
  if (process.env.DB_NAME) config.database = process.env.DB_NAME;
  if (process.env.DB_HOST) config.host = process.env.DB_HOST;
  if (process.env.DB_PORT) config.port = parseInt(process.env.DB_PORT);

  // Handle socket path override
  if (process.env.DB_SOCKET) {
    config.socketPath = process.env.DB_SOCKET;
    delete config.host;
    delete config.port;
  }

  // Connection limit
  config.connectionLimit = process.env.DB_CONN_LIMIT ? parseInt(process.env.DB_CONN_LIMIT) : 2;

  return config;
});
export const getPool = jest.fn();