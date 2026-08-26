/** @jest-environment node */

import { GET, POST } from "@/app/api/db-init/route";
import { initDatabase } from "@/lib/server/db";

jest.mock("@/lib/server/db", () => ({
  initDatabase: jest.fn(),
}));

describe("/api/db-init route", () => {
  const initDatabaseMock = initDatabase as jest.MockedFunction<typeof initDatabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
  ])("returns 404 without initializing the database for %s", async (_method, handler) => {
    const response = await handler();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(initDatabaseMock).not.toHaveBeenCalled();
  });
});
