async function requireDatabaseReady({ dataSource, isConfigured }) {
  if (!isConfigured() || !dataSource) {
    throw new Error("Database configuration is required at application startup");
  }

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  await dataSource.query("SELECT 1");
}

module.exports = { requireDatabaseReady };
