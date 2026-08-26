"use strict";

const MIGRATION_CONFIRMATION = "RUN_CASN_MIGRATIONS";

function shouldRunDatabaseMigrations(env) {
  return env.RUN_DB_MIGRATIONS === "1"
    && env.DB_MIGRATION_CONFIRM === MIGRATION_CONFIRMATION;
}

function assessMigrationSafety({
  runFlag,
  confirmation,
  hasContentTables = false,
  initialMigrationRecorded = false,
}) {
  if (runFlag !== "1") {
    return { allowed: false, reason: "migration gate is disabled" };
  }
  if (confirmation !== MIGRATION_CONFIRMATION) {
    return { allowed: false, reason: "migration confirmation is invalid" };
  }
  if (hasContentTables && !initialMigrationRecorded) {
    return {
      allowed: false,
      reason: "existing content tables are not covered by migration history",
    };
  }
  return { allowed: true };
}

module.exports = {
  MIGRATION_CONFIRMATION,
  shouldRunDatabaseMigrations,
  assessMigrationSafety,
};
