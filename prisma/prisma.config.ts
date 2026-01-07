import { defineConfig } from "prisma/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: {
    schema: "./schema.prisma",
  },
  client: {
    adapter: new PrismaMariaDb({
      host: process.env.DB_HOST ?? "mysql",
      port: Number(process.env.DB_PORT ?? "3306"),
      user: process.env.DB_USER ?? "casn_user",
      password: process.env.DB_PASSWORD ?? "casn_password123",
      database: process.env.DB_NAME ?? "casn",
    }),
  },
});
