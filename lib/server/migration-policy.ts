export type MigrationEnvironment = Record<string, string | undefined>;

export function shouldRunDatabaseMigrations(env: MigrationEnvironment): boolean {
  return env.RUN_DB_MIGRATIONS === '1'
    && env.DB_MIGRATION_CONFIRM === 'RUN_CASN_MIGRATIONS';
}
