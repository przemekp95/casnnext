import {
  assessMigrationSafety,
  shouldRunDatabaseMigrations,
} from '@/lib/server/migration-policy';

describe('shouldRunDatabaseMigrations', () => {
  it.each([
    [{}, false],
    [{ RUN_DB_MIGRATIONS: '1' }, false],
    [{ DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, false],
    [{ RUN_DB_MIGRATIONS: 'true', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, false],
    [{ RUN_DB_MIGRATIONS: '1', DB_MIGRATION_CONFIRM: 'RUN_CASN_MIGRATIONS' }, true],
  ] as const)('returns %s for %o', (env, expected) => {
    expect(shouldRunDatabaseMigrations(env)).toBe(expected);
  });
});

describe('assessMigrationSafety', () => {
  it.each([
    [undefined, undefined, 'migration gate is disabled'],
    ['0', 'RUN_CASN_MIGRATIONS', 'migration gate is disabled'],
    ['1', undefined, 'migration confirmation is invalid'],
    ['1', 'wrong', 'migration confirmation is invalid'],
  ] as const)(
    'refuses runFlag=%s confirmation=%s',
    (runFlag, confirmation, reason) => {
      expect(assessMigrationSafety({ runFlag, confirmation })).toEqual({
        allowed: false,
        reason,
      });
    },
  );

  it('allows an empty schema with both exact confirmations', () => {
    expect(
      assessMigrationSafety({
        runFlag: '1',
        confirmation: 'RUN_CASN_MIGRATIONS',
        hasContentTables: false,
        initialMigrationRecorded: false,
      }),
    ).toEqual({ allowed: true });
  });

  it('refuses existing content tables without the initial migration record', () => {
    expect(
      assessMigrationSafety({
        runFlag: '1',
        confirmation: 'RUN_CASN_MIGRATIONS',
        hasContentTables: true,
        initialMigrationRecorded: false,
      }),
    ).toEqual({
      allowed: false,
      reason: 'existing content tables are not covered by migration history',
    });
  });

  it('allows existing content when the initial migration is recorded', () => {
    expect(
      assessMigrationSafety({
        runFlag: '1',
        confirmation: 'RUN_CASN_MIGRATIONS',
        hasContentTables: true,
        initialMigrationRecorded: true,
      }),
    ).toEqual({ allowed: true });
  });
});
