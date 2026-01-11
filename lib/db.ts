// lib/db.ts
import mysql from "mysql2/promise";
import "reflect-metadata";
import { DataSource } from "typeorm";

type QueryResult<T = unknown> = T[];

let pool: mysql.Pool | null = null;

function buildConfig(): mysql.PoolOptions {
  // domyślne zmienne środowiskowe
  const { DB_CONN_LIMIT = "2" } = process.env;
  let {
    DB_HOST = "localhost",
    DB_USER,
    DB_PASS,
    DB_NAME,
    DB_SOCKET,
  } = process.env;

  // opcjonalnie: parsuj DATABASE_URL (np. z socketem)
  const urlStr = process.env.DATABASE_URL;
  if (urlStr) {
    try {
      const u = new URL(urlStr);
      if (!DB_SOCKET && u.hostname) DB_HOST = u.hostname;
      if (!DB_USER && u.username) DB_USER = decodeURIComponent(u.username);
      if (!DB_PASS && u.password) DB_PASS = decodeURIComponent(u.password);
      if (!DB_NAME && u.pathname) DB_NAME = u.pathname.replace(/^\//, "");
      const s = u.searchParams.get("socket");
      if (s) DB_SOCKET = s;
    } catch {
      // ignoruj błąd parsowania URL w trakcie buildu
    }
  }

  if (!DB_USER || !DB_PASS || !DB_NAME) {
    throw new Error("DB env missing (DB_USER/DB_PASS/DB_NAME). Ustaw w .env lub DATABASE_URL.");
  }

  const cfg: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit: parseInt(DB_CONN_LIMIT, 10),
    queueLimit: 0,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  };

  if (DB_SOCKET) {
    cfg.socketPath = DB_SOCKET; // preferowane na hostingu (unikasz IPv6 ::1)
  } else {
    cfg.host = DB_HOST;
    cfg.port = 3306;
  }

  return cfg;
}

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(buildConfig());
  }
  return pool;
}

export async function query<T = unknown>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
  const p = getPool();
  const [rows] = await p.execute<mysql.RowDataPacket[]>(sql, values);
  return rows as QueryResult<T>;
}

// TypeORM DataSource configuration
export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST || "localhost",
  port: 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS || process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false, // Don't auto-sync in production
  logging: process.env.NODE_ENV === "development",
  entities: ["./lib/entities/*.ts"],
  migrations: ["./lib/migrations/*.ts"],
  subscribers: [],
  extra: {
    connectionLimit: parseInt(process.env.DB_CONN_LIMIT || "2", 10),
  },
});