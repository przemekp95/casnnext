export type StartupDataSource = {
  isInitialized: boolean;
  initialize(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
};

export type StartupDatabaseInput = {
  dataSource: StartupDataSource | null;
  isConfigured(): boolean;
};

export async function requireDatabaseReady({
  dataSource,
  isConfigured,
}: StartupDatabaseInput): Promise<void> {
  if (!isConfigured() || !dataSource) {
    throw new Error("Database configuration is required at application startup");
  }

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  await dataSource.query("SELECT 1");
}
