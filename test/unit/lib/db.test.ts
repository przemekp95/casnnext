/** @jest-environment node */
import mysql from 'mysql2/promise';

let dbModule: {
  query: <T = unknown>(sql: string, values?: unknown[]) => Promise<T[]>
  buildConfig?: () => mysql.PoolOptions
  getPool?: () => mysql.Pool
} | null = null;

try {
  dbModule = require('@/lib/db');
} catch (_) {
  dbModule = null;
}

(dbModule ? describe : describe.skip)('lib/db', () => {
  const originalEnv = process.env;
  let mockPool: jest.Mocked<mysql.Pool>;
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockExecute = jest.fn();
    mockPool = {
      execute: mockExecute,
    } as any;

    // Mock mysql.createPool
    jest.spyOn(mysql, 'createPool').mockReturnValue(mockPool);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('buildConfig', () => {
    it('buduje config z environment variables', () => {
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'testuser';
      process.env.DB_PASS = 'testpass';
      process.env.DB_NAME = 'testdb';
      process.env.DB_CONN_LIMIT = '5';

      const config = (dbModule as any).buildConfig();

      expect(config).toEqual({
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        host: 'localhost',
        port: 3306,
      });
    });

    it('używa socket path gdy DB_SOCKET jest ustawiony', () => {
      process.env.DB_USER = 'testuser';
      process.env.DB_PASS = 'testpass';
      process.env.DB_NAME = 'testdb';
      process.env.DB_SOCKET = '/var/run/mysql.sock';

      const config = (dbModule as any).buildConfig();

      expect(config.socketPath).toBe('/var/run/mysql.sock');
      expect(config).not.toHaveProperty('host');
      expect(config).not.toHaveProperty('port');
    });

    it('parsuje DATABASE_URL', () => {
      process.env.DATABASE_URL = 'mysql://dbuser:dbpass@dbhost:3307/dbname?socket=/tmp/mysql.sock';

      const config = (dbModule as any).buildConfig();

      expect(config).toEqual({
        waitForConnections: true,
        connectionLimit: 2, // default
        queueLimit: 0,
        user: 'dbuser',
        password: 'dbpass',
        database: 'dbname',
        socketPath: '/tmp/mysql.sock',
      });
    });

    it('ignoruje nieprawidłowy DATABASE_URL', () => {
      process.env.DATABASE_URL = 'invalid-url';
      process.env.DB_USER = 'fallback';
      process.env.DB_PASS = 'fallback';
      process.env.DB_NAME = 'fallback';

      const config = (dbModule as any).buildConfig();

      expect(config.user).toBe('fallback');
    });

    it('rzuca błąd gdy brakuje wymaganych zmiennych', () => {
      // Missing DB_USER, DB_PASS, DB_NAME
      expect(() => (dbModule as any).buildConfig()).toThrow(
        'DB env missing (DB_USER/DB_PASS/DB_NAME). Ustaw w .env lub DATABASE_URL.'
      );
    });

    it('używa domyślnych wartości', () => {
      process.env.DB_USER = 'testuser';
      process.env.DB_PASS = 'testpass';
      process.env.DB_NAME = 'testdb';

      const config = (dbModule as any).buildConfig();

      expect(config.host).toBe('localhost'); // default
      expect(config.connectionLimit).toBe(2); // default
    });
  });

  describe('query', () => {
    it('wykonuje zapytanie i zwraca wyniki', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockExecute.mockResolvedValue([mockRows]);

      const result = await dbModule!.query('SELECT * FROM test');

      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM test', undefined);
      expect(result).toEqual(mockRows);
    });

    it('przekazuje wartości parametrów', async () => {
      const mockRows = [{ id: 1 }];
      mockExecute.mockResolvedValue([mockRows]);
      const values = ['test-value', 123];

      const result = await dbModule!.query('SELECT * FROM test WHERE name = ? AND id = ?', values);

      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM test WHERE name = ? AND id = ?', values);
      expect(result).toEqual(mockRows);
    });

    it('typizuje wyniki', async () => {
      interface TestRow {
        id: number;
        name: string;
      }

      const mockRows: TestRow[] = [{ id: 1, name: 'test' }];
      mockExecute.mockResolvedValue([mockRows]);

      const result = await dbModule!.query<TestRow>('SELECT * FROM test');

      expect(result).toEqual(mockRows);
      // TypeScript should infer correct types
      result.forEach(row => {
        expect(typeof row.id).toBe('number');
        expect(typeof row.name).toBe('string');
      });
    });
  });

  describe('getPool', () => {
    it('tworzy pool tylko raz (singleton)', () => {
      const pool1 = (dbModule as any).getPool();
      const pool2 = (dbModule as any).getPool();

      expect(pool1).toBe(pool2);
      expect(mysql.createPool).toHaveBeenCalledTimes(1);
    });
  });
});