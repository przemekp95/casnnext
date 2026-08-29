import { DataSource } from "typeorm";
import { AuthorSchema } from "./entities/Author";
import { AnalysisSchema } from "./entities/Analysis";
import { IssueCollectionSchema } from "./entities/IssueCollection";
import { InitialSetup1736424470000 } from "../migrations/1736424470000-InitialSetup";
import { AddCmsReadModel1736424470002 } from "../migrations/1736424470002-AddCmsReadModel";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

interface DatabaseConfig {
  type: "mysql" | "sqlite";
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  dropSchema?: boolean;
  charset?: string;
  collation?: string;
}

const databaseUrl = process.env.DATABASE_URL;
let dbConfig: DatabaseConfig;

if (databaseUrl) {
  const url = new URL(databaseUrl);
  dbConfig = {
    type: "mysql",
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    username: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    synchronize: false,
    logging: !isProduction && !isTest,
  };
} else if (isTest) {
  dbConfig = {
    type: "mysql",
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306"),
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "casn_test",
    synchronize: false,
    logging: false,
    dropSchema: false,
  };
} else {
  dbConfig = {
    type: "mysql",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "casn",
    synchronize: false,
    logging: !isProduction,
  };
}

const hasDatabaseConfig = !!(databaseUrl || process.env.DB_HOST || process.env.DB_USER || process.env.DB_NAME);

let appDataSource: DataSource | null = null;

function getDataSource(): DataSource | null {
  if (!hasDatabaseConfig) return null;

  if (!appDataSource) {
    appDataSource = new DataSource({
      ...dbConfig,
      entities: [AuthorSchema, AnalysisSchema, IssueCollectionSchema],
      migrations: [InitialSetup1736424470000, AddCmsReadModel1736424470002],
      migrationsRun: false,
      subscribers: [],
    });
  }

  return appDataSource;
}

export const AppDataSource = getDataSource();

export const isDatabaseConfigured = () => hasDatabaseConfig;

export const query = async (sql: string, params?: unknown[]): Promise<unknown[]> => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("query() is only available in test environment");
  }

  const dataSource = getDataSource();
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error("Database not initialized");
  }

  const queryRunner = dataSource.createQueryRunner();
  try {
    return await queryRunner.query(sql, params);
  } finally {
    await queryRunner.release();
  }
};
