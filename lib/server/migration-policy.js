"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRunDatabaseMigrations = shouldRunDatabaseMigrations;
function shouldRunDatabaseMigrations(env) {
    return env.RUN_DB_MIGRATIONS === '1'
        && env.DB_MIGRATION_CONFIRM === 'RUN_CASN_MIGRATIONS';
}
