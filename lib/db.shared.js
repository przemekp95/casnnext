"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.isDatabaseConfigured = exports.AppDataSource = void 0;
const typeorm_1 = require("typeorm");
const Author_1 = require("./entities/Author");
const Analysis_1 = require("./entities/Analysis");
const IssueCollection_1 = require("./entities/IssueCollection");
const _1736424470000_InitialSetup_1 = require("../migrations/1736424470000-InitialSetup");
const _1736424470002_AddCmsReadModel_1 = require("../migrations/1736424470002-AddCmsReadModel");
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const databaseUrl = process.env.DATABASE_URL;
let dbConfig;
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
}
else if (isTest) {
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
}
else {
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
let appDataSource = null;
function getDataSource() {
    if (!hasDatabaseConfig)
        return null;
    if (!appDataSource) {
        appDataSource = new typeorm_1.DataSource({
            ...dbConfig,
            entities: [Author_1.AuthorSchema, Analysis_1.AnalysisSchema, IssueCollection_1.IssueCollectionSchema],
            migrations: [_1736424470000_InitialSetup_1.InitialSetup1736424470000, _1736424470002_AddCmsReadModel_1.AddCmsReadModel1736424470002],
            migrationsRun: false,
            subscribers: [],
        });
    }
    return appDataSource;
}
exports.AppDataSource = getDataSource();
const isDatabaseConfigured = () => hasDatabaseConfig;
exports.isDatabaseConfigured = isDatabaseConfigured;
const query = async (sql, params) => {
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
    }
    finally {
        await queryRunner.release();
    }
};
exports.query = query;
