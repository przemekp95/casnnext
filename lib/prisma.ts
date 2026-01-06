import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST ?? "mysql",
  port: Number(process.env.DB_PORT ?? "3306"),
  user: process.env.DB_USER ?? "casn_user",
  password: process.env.DB_PASSWORD ?? "casn_password123",
  database: process.env.DB_NAME ?? "casn",
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prisma: PrismaClient | undefined

// During build time, create a simple mock
if (process.env.NEXT_PHASE === 'phase-production-build') {
  prisma = new PrismaClient({ adapter });
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  prisma = globalForPrisma.prisma;
}

export { prisma }