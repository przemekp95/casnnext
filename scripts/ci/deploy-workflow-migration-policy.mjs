import fs from 'node:fs';
import process from 'node:process';
import { parse } from 'yaml';

const EXPECTED_DATABASE_URL = 'mysql://root:rootpassword@localhost:3306/casn_test';

export function validateDeployMigrationGate(workflow) {
  const steps = workflow?.jobs?.['directus-smoke']?.steps;
  if (!Array.isArray(steps)) {
    return 'Deployment workflow must define directus-smoke steps.';
  }

  const migrationSteps = steps.filter((step) => step?.run === 'npm run migration:run');
  if (migrationSteps.length !== 1) {
    return `Deployment directus-smoke must contain exactly one migration step; found ${migrationSteps.length}.`;
  }

  const env = migrationSteps[0]?.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return 'Deployment Directus migration step must define a step-level env mapping.';
  }
  if (env.DATABASE_URL !== EXPECTED_DATABASE_URL) {
    return 'Deployment Directus migration step must target the disposable localhost test database.';
  }
  if (String(env.RUN_DB_MIGRATIONS) !== '1') {
    return 'Deployment Directus migration step is missing RUN_DB_MIGRATIONS=1.';
  }
  if (env.DB_MIGRATION_CONFIRM !== 'RUN_CASN_MIGRATIONS') {
    return 'Deployment Directus migration step is missing the exact migration confirmation.';
  }

  return null;
}

export function validateDeployMigrationYaml(source) {
  let workflow;
  try {
    workflow = parse(source);
  } catch (error) {
    return `Deployment workflow YAML is invalid: ${error.message}`;
  }
  return validateDeployMigrationGate(workflow);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const workflowPath = process.argv[2];
  if (!workflowPath) {
    console.error('Usage: deploy-workflow-migration-policy.mjs <workflow.yml>');
    process.exit(2);
  }
  const diagnostic = validateDeployMigrationYaml(fs.readFileSync(workflowPath, 'utf8'));
  if (diagnostic) {
    console.error(diagnostic);
    process.exit(1);
  }
  console.log('Deployment Directus migration gate policy passed.');
}
