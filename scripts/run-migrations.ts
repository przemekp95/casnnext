#!/usr/bin/env tsx

import { DataSource } from 'typeorm';
import { AuthorSchema } from '../lib/entities/Author';
import { AnalysisSchema } from '../lib/entities/Analysis';
import { IssueCollectionSchema } from '../lib/entities/IssueCollection';
import {
  MIGRATION_CONFIRMATION,
  assessMigrationSafety,
} from '../lib/server/migration-policy';
import { InitialSetup1736424470000 } from '../migrations/1736424470000-InitialSetup';
import { AddCmsReadModel1736424470002 } from '../migrations/1736424470002-AddCmsReadModel';

const INITIAL_MIGRATION_NAME = 'InitialSetup1736424470000';

function requiredDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql');
    if (!url.hostname || !url.username || !url.pathname.slice(1)) {
      throw new Error('DATABASE_URL is incomplete');
    }
    const port = Number(url.port || '3306');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('DATABASE_URL port is invalid');
    }
    return {
      type: 'mysql' as const,
      host: url.hostname,
      port,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    };
  }

  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  }

  const port = Number(process.env.DB_PORT || '3306');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT is invalid');
  }

  return {
    type: 'mysql' as const,
    host: process.env.DB_HOST as string,
    port,
    username: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_NAME as string,
  };
}

async function inspectSchema(dataSource: DataSource) {
  const contentTables = (await dataSource.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('Author', 'Analysis')`,
  )) as Array<{ TABLE_NAME: string }>;
  const migrationTables = (await dataSource.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'migrations'`,
  )) as Array<{ TABLE_NAME: string }>;

  let initialMigrationRecorded = false;
  if (migrationTables.length > 0) {
    const rows = (await dataSource.query(
      'SELECT name FROM migrations WHERE name = ? LIMIT 1',
      [INITIAL_MIGRATION_NAME],
    )) as Array<{ name: string }>;
    initialMigrationRecorded = rows.length === 1;
  }

  return {
    hasContentTables: contentTables.length > 0,
    initialMigrationRecorded,
  };
}

async function runMigrations() {
  const initialGate = assessMigrationSafety({
    runFlag: process.env.RUN_DB_MIGRATIONS,
    confirmation: process.env.DB_MIGRATION_CONFIRM,
  });
  if (initialGate.allowed === false) {
    throw new Error(
      `${initialGate.reason}; set RUN_DB_MIGRATIONS=1 and DB_MIGRATION_CONFIRM=${MIGRATION_CONFIRMATION}`,
    );
  }

  const dataSource = new DataSource({
    ...requiredDatabaseConfig(),
    synchronize: false,
    migrationsRun: false,
    logging: false,
    entities: [AuthorSchema, AnalysisSchema, IssueCollectionSchema],
    migrations: [InitialSetup1736424470000, AddCmsReadModel1736424470002],
  });

  try {
    await dataSource.initialize();
    const schemaGate = assessMigrationSafety({
      runFlag: process.env.RUN_DB_MIGRATIONS,
      confirmation: process.env.DB_MIGRATION_CONFIRM,
      ...(await inspectSchema(dataSource)),
    });
    if (schemaGate.allowed === false) throw new Error(schemaGate.reason);

    const completed = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`Migration run completed (${completed.length} applied)`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration run refused or failed: ${message}`);
  process.exitCode = 1;
});
