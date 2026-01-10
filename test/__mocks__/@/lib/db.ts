// Mock for @/lib/db module
export const query = jest.fn().mockImplementation((sql: string) => {
  if (sql.includes('SELECT 1 AS ok')) {
    return Promise.resolve([{ ok: 1 }]);
  }
  return Promise.resolve([]);
});

const mockRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
};

export const AppDataSource = {
  getRepository: jest.fn().mockReturnValue(mockRepository),
  initialize: jest.fn().mockResolvedValue(undefined),
  isInitialized: true,
};

export const buildConfig = jest.fn().mockImplementation(() => {
  const config: any = {
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
    } catch (e) {
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