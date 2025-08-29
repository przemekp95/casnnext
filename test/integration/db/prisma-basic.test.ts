/** @jest-environment node */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Prisma – podstawowa łączność', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('połączenie z DB działa (zapytanie raw SELECT 1)', async () => {
    // Działa dla MySQL/MariaDB
    const res = await prisma.$queryRawUnsafe('SELECT 1 AS ok');
    // wynik bywa tablicą obiektów, np. [{ ok: 1 }]
    const row = Array.isArray(res) ? res[0] : res;
    expect(row).toBeTruthy();
  });
});
