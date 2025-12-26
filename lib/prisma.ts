// Mock Prisma types for build time
type PrismaClient = any;

// Create a mock Prisma client that works during build
const createMockPrismaClient = () => ({
  analysis: {
    findMany: async () => [],
    findUnique: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({})
  },
  author: {
    findMany: async () => [],
    findUnique: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({})
  },
  $connect: async () => {},
  $disconnect: async () => {}
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prisma: PrismaClient | undefined

// During build time, return mock client
if (process.env.NEXT_PHASE === 'phase-production-build') {
  prisma = createMockPrismaClient();
} else {
  try {
    // Only import real Prisma client when not building
    const { PrismaClient: RealPrismaClient } = await import('@prisma/client');
    prisma = globalForPrisma.prisma ?? new RealPrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
  } catch (error) {
    // If import fails, use mock client
    prisma = createMockPrismaClient();
  }
}

export { prisma }