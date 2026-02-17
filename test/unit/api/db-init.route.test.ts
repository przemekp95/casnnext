/** @jest-environment node */

import { GET, POST } from "@/app/api/db-init/route";
import { initDatabase } from "@/lib/server/db";
import { AppDataSource } from "@/lib/db.server";

jest.mock("@/lib/server/db", () => ({
  initDatabase: jest.fn(),
}));

jest.mock("@/lib/db.server", () => ({
  AppDataSource: { isInitialized: false },
}));

describe("/api/db-init route", () => {
  const initDatabaseMock = initDatabase as jest.MockedFunction<typeof initDatabase>;
  const appDataSourceMock = AppDataSource as { isInitialized: boolean };

  beforeEach(() => {
    jest.clearAllMocks();
    appDataSourceMock.isInitialized = false;
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns success response when initialization completes and datasource is initialized", async () => {
    appDataSourceMock.isInitialized = true;
    initDatabaseMock.mockResolvedValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe("Database initialization completed successfully");
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 500 when init finishes but datasource remains uninitialized", async () => {
    appDataSourceMock.isInitialized = false;
    initDatabaseMock.mockResolvedValue(undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Database initialization failed - check logs");
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 500 with error details when initialization throws", async () => {
    initDatabaseMock.mockRejectedValue(new Error("boom"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Database initialization failed with error");
    expect(body.error).toBe("boom");
    expect(typeof body.timestamp).toBe("string");
  });

  it("POST delegates to GET for convenience", async () => {
    appDataSourceMock.isInitialized = true;
    initDatabaseMock.mockResolvedValue(undefined);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(initDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
