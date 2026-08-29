import assert from 'node:assert/strict';
import { validateDeployMigrationYaml } from './deploy-workflow-migration-policy.mjs';

const migrationEnv = `
          DATABASE_URL: mysql://root:rootpassword@localhost:3306/casn_test
          RUN_DB_MIGRATIONS: "1"
          DB_MIGRATION_CONFIRM: RUN_CASN_MIGRATIONS`;

const workflow = (migrationEnvironment, smokeEnvironment = '') => `
jobs:
  directus-smoke:
    steps:
      - name: Run database migrations
        run: npm run migration:run
        env:${migrationEnvironment}
      - name: Run Directus smoke tests
        run: npm run directus:smoke${smokeEnvironment}
  deploy:
    needs: [directus-smoke]
`;

assert.equal(validateDeployMigrationYaml(workflow(migrationEnv)), null);

assert.match(
  validateDeployMigrationYaml(workflow('\n          DATABASE_URL: mysql://root:rootpassword@localhost:3306/casn_test')),
  /missing RUN_DB_MIGRATIONS/,
);

assert.match(
  validateDeployMigrationYaml(workflow(`
          DATABASE_URL: mysql://root:rootpassword@localhost:3306/casn_test
          # RUN_DB_MIGRATIONS: "1"
          # DB_MIGRATION_CONFIRM: RUN_CASN_MIGRATIONS`)),
  /missing RUN_DB_MIGRATIONS/,
);

assert.match(
  validateDeployMigrationYaml(workflow(
    '\n          DATABASE_URL: mysql://root:rootpassword@localhost:3306/casn_test',
    `
        env:
          RUN_DB_MIGRATIONS: "1"
          DB_MIGRATION_CONFIRM: RUN_CASN_MIGRATIONS`,
  )),
  /missing RUN_DB_MIGRATIONS/,
);

assert.match(
  validateDeployMigrationYaml(workflow(migrationEnv.replace('localhost:3306/casn_test', 'production-db:3306/casn'))),
  /disposable localhost test database/,
);

console.log('Deployment Directus migration gate policy behavior passed.');
