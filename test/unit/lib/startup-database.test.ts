/** @jest-environment node */

type StartupDataSource = {
  isInitialized: boolean;
  initialize: jest.Mock<Promise<void>, []>;
  query: jest.Mock<Promise<unknown>, [string]>;
};

const { requireDatabaseReady } = jest.requireActual(
  "@/lib/server/startup-database",
) as {
  requireDatabaseReady(input: {
    dataSource: StartupDataSource | null;
    isConfigured: () => boolean;
  }): Promise<void>;
};

function dataSource(isInitialized = false): StartupDataSource {
  return {
    isInitialized,
    initialize: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([{ result: 1 }]),
  };
}

describe("requireDatabaseReady", () => {
  it.each([
    ["missing configuration", false, dataSource()],
    ["missing datasource", true, null],
  ])("rejects %s before server preparation", async (_label, configured, source) => {
    await expect(
      requireDatabaseReady({ dataSource: source, isConfigured: () => configured }),
    ).rejects.toThrow("Database configuration is required at application startup");
  });

  it("propagates datasource initialization failure", async () => {
    const source = dataSource();
    source.initialize.mockRejectedValue(new Error("database unavailable"));

    await expect(
      requireDatabaseReady({ dataSource: source, isConfigured: () => true }),
    ).rejects.toThrow("database unavailable");
    expect(source.query).not.toHaveBeenCalled();
  });

  it("propagates the readiness query failure", async () => {
    const source = dataSource(true);
    source.query.mockRejectedValue(new Error("connection lost"));

    await expect(
      requireDatabaseReady({ dataSource: source, isConfigured: () => true }),
    ).rejects.toThrow("connection lost");
  });

  it("initializes once and verifies the connection before returning", async () => {
    const source = dataSource();

    await requireDatabaseReady({ dataSource: source, isConfigured: () => true });

    expect(source.initialize).toHaveBeenCalledTimes(1);
    expect(source.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("does not initialize an already initialized datasource again", async () => {
    const source = dataSource(true);

    await requireDatabaseReady({ dataSource: source, isConfigured: () => true });

    expect(source.initialize).not.toHaveBeenCalled();
    expect(source.query).toHaveBeenCalledWith("SELECT 1");
  });
});
