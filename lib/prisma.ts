import { PrismaClient } from "@prisma/client";

declare global {
  // dla hot-reload w Next.js – zapobiega tworzeniu wielu instancji klienta
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
