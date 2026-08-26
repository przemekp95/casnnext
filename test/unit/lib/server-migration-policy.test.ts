import { shouldRunDatabaseMigrations } from '@/lib/server/migration-policy';

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
