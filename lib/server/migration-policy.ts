export const MIGRATION_CONFIRMATION = 'RUN_CASN_MIGRATIONS';

export type MigrationEnvironment = Record<string, string | undefined>;

type MigrationSafetyInput = {
  runFlag: string | undefined;
  confirmation: string | undefined;
  hasContentTables?: boolean;
  initialMigrationRecorded?: boolean;
};

export type MigrationSafetyAssessment =
  | { allowed: true }
  | { allowed: false; reason: string };

export function shouldRunDatabaseMigrations(env: MigrationEnvironment): boolean {
  return env.RUN_DB_MIGRATIONS === '1'
    && env.DB_MIGRATION_CONFIRM === MIGRATION_CONFIRMATION;
}

export function assessMigrationSafety({
  runFlag,
  confirmation,
  hasContentTables = false,
  initialMigrationRecorded = false,
}: MigrationSafetyInput): MigrationSafetyAssessment {
  if (runFlag !== '1') {
    return { allowed: false, reason: 'migration gate is disabled' };
  }
  if (confirmation !== MIGRATION_CONFIRMATION) {
    return { allowed: false, reason: 'migration confirmation is invalid' };
  }
  if (hasContentTables && !initialMigrationRecorded) {
    return {
      allowed: false,
      reason: 'existing content tables are not covered by migration history',
    };
  }
  return { allowed: true };
}
