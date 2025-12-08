import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: {
    schema: "./schema.prisma",
  },
  datasource: {
    databaseUrl: process.env.DATABASE_URL,
  },
});
