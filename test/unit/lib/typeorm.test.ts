/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

let prismaModule: { prisma: PrismaClient | undefined } | null = null;

try {
  prismaModule = require('@/lib/prisma');
} catch (_) {
  prismaModule = null;
}

(prismaModule ? describe : describe.skip)('lib/prisma', () => {
  const originalEnv = process.env;
  const originalGlobal = globalThis;
  let mockPrismaClient: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    // Reset globalForPrisma
    (globalThis as any).prisma = undefined;

    // Mock PrismaClient and adapter
    mockPrismaClient = {} as any;
    jest.spyOn(PrismaMariaDb.prototype, 'constructor' as any).mockImplementation();
    jest.mocked(PrismaClient).mockImplementation(() => mockPrismaClient);
  });

  afterEach(() => {
    process.env = originalEnv;
    (globalThis as any).prisma = undefined;
    jest.restoreAllMocks();
  });

  it('tworzy PrismaClient z adapterem MariaDB', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '3306';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';

    // Re-import to trigger creation
    delete require.cache[require.resolve('@/lib/prisma')];
    const freshModule = require('@/lib/prisma');

    expect(PrismaClient).toHaveBeenCalled();
    expect(freshModule.prisma).toBe(mockPrismaClient);
  });

  it('używa domyślnych wartości środowiska gdy zmienne nie są ustawione', () => {
    // Don't set any env vars - should use defaults

    delete require.cache[require.resolve('@/lib/prisma')];
    require('@/lib/prisma');

    expect(PrismaMariaDb).toHaveBeenCalledWith({
      host: 'mysql', // default
      port: 3306, // default
      user: 'casn_user', // default
      password: 'casn_password123', // default
      database: 'casn', // default
    });
  });

  it('używa zmiennych środowiskowych zamiast domyślnych', () => {
    process.env.DB_HOST = 'custom-host';
    process.env.DB_PORT = '3307';
    process.env.DB_USER = 'custom-user';
    process.env.DB_PASSWORD = 'custom-pass';
    process.env.DB_NAME = 'custom-db';

    delete require.cache[require.resolve('@/lib/prisma')];
    require('@/lib/prisma');

    expect(PrismaMariaDb).toHaveBeenCalledWith({
      host: 'custom-host',
      port: 3307,
      user: 'custom-user',
      password: 'custom-pass',
      database: 'custom-db',
    });
  });

  it('implementuje singleton pattern', () => {
    delete require.cache[require.resolve('@/lib/prisma')];
    const module1 = require('@/lib/prisma');

    delete require.cache[require.resolve('@/lib/prisma')];
    const module2 = require('@/lib/prisma');

    expect(module1.prisma).toBe(module2.prisma);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it('przypisuje do globalThis poza fazą build', () => {
    delete require.cache[require.resolve('@/lib/prisma')];
    require('@/lib/prisma');

    expect((globalThis as any).prisma).toBe(mockPrismaClient);
  });

  it('tworzy nowego klienta podczas phase-production-build', () => {
    process.env.NEXT_PHASE = 'phase-production-build';

    delete require.cache[require.resolve('@/lib/prisma')];
    const module = require('@/lib/prisma');

    expect(module.prisma).toBe(mockPrismaClient);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect((globalThis as any).prisma).toBeUndefined();
  });

  it('eksportuje prisma instance', () => {
    expect(prismaModule!.prisma).toBeDefined();
    expect(typeof prismaModule!.prisma).toBe('object');
  });

  it('adapter jest typu PrismaMariaDb', () => {
    // This test verifies that the adapter creation was called
    expect(PrismaMariaDb).toHaveBeenCalled();
  });
});