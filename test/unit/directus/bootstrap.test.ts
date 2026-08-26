/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUIRED_ENV: Record<string, string> = {
  DIRECTUS_INTERNAL_URL: "http://directus.test",
  ADMIN_EMAIL: "admin@example.invalid",
  ADMIN_PASSWORD: "test-password",
  DIRECTUS_REVALIDATE_URL: "http://app:3000/api/revalidate",
  REVALIDATE_SECRET: "preferred-revalidate-secret",
  DIRECTUS_WEBHOOK_SECRET: "different-directus-secret",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createDirectusFake(requests, { duplicatePath = "" } = {}) {
  const stores = new Map([
    ["/roles", []],
    ["/policies", []],
    ["/access", []],
    ["/permissions", []],
    ["/flows", []],
    ["/operations", []],
  ]);
  let nextId = 0;

  const fetchImpl = jest.fn(async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ method, pathname: parsed.pathname, searchParams: parsed.searchParams, body });

    if (parsed.pathname === "/server/ping") return jsonResponse({ data: "pong" });
    if (parsed.pathname === "/auth/login") {
      return jsonResponse({ data: { access_token: "admin-token" } });
    }
    if (parsed.pathname.startsWith("/collections/") || parsed.pathname.startsWith("/fields/")) {
      return jsonResponse({ data: {} });
    }

    const basePath = [...stores.keys()].find(
      (candidate) => parsed.pathname === candidate || parsed.pathname.startsWith(`${candidate}/`),
    );
    if (!basePath) throw new Error(`Unexpected request: ${method} ${parsed.pathname}`);
    const store = stores.get(basePath);

    if (method === "GET") {
      if (duplicatePath === basePath) {
        return jsonResponse({ data: [{ id: "duplicate-1" }, { id: "duplicate-2" }] });
      }
      const filtered = store.filter((record) =>
        [...parsed.searchParams.entries()]
          .filter(([key]) => key.startsWith("filter["))
          .every(([key, value]) => {
            const field = key.slice("filter[".length, key.indexOf("]"));
            return String(record[field]) === value;
          }),
      );
      return jsonResponse({ data: filtered });
    }

    if (method === "POST") {
      const record = { ...body, id: `${basePath.slice(1)}-${++nextId}` };
      store.push(record);
      return jsonResponse({ data: record });
    }

    if (method === "PATCH") {
      const id = parsed.pathname.slice(basePath.length + 1);
      const record = store.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`Missing fake record: ${parsed.pathname}`);
      Object.assign(record, body);
      return jsonResponse({ data: record });
    }

    throw new Error(`Unexpected request: ${method} ${parsed.pathname}`);
  });

  return { fetchImpl, stores };
}

describe("Directus metadata bootstrap", () => {
  it.each(["ADMIN_EMAIL", "ADMIN_PASSWORD", "DIRECTUS_REVALIDATE_URL"])(
    "fails before making requests when %s is missing",
    async (missingName) => {
      const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
      const env = { ...REQUIRED_ENV };
      delete env[missingName];
      const fetchImpl = jest.fn();

      await expect(runBootstrap({ env, fetchImpl, sleep: async () => {} })).rejects.toThrow(
        `${missingName} is required`,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("requires a revalidation secret before making requests", async () => {
    const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
    const env = { ...REQUIRED_ENV };
    delete env.REVALIDATE_SECRET;
    delete env.DIRECTUS_WEBHOOK_SECRET;
    const fetchImpl = jest.fn();

    await expect(runBootstrap({ env, fetchImpl, sleep: async () => {} })).rejects.toThrow(
      "REVALIDATE_SECRET is required",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates Core-compatible permissions and uses app-aligned secret precedence", async () => {
    const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
    const requests = [];
    const { fetchImpl, stores } = createDirectusFake(requests);

    await runBootstrap({ env: REQUIRED_ENV, fetchImpl, sleep: async () => {} });

    expect(stores.get("/roles")).toHaveLength(1);
    expect(stores.get("/policies")).toHaveLength(1);
    expect(stores.get("/access")).toHaveLength(1);
    expect(stores.get("/permissions")).toHaveLength(12);
    expect(stores.get("/flows")).toHaveLength(1);
    expect(stores.get("/operations")).toHaveLength(1);

    for (const permission of stores.get("/permissions")) {
      expect(permission.fields).toEqual(["*"]);
      expect(permission.permissions).toBeNull();
      expect(permission.validation).toBeNull();
      expect(permission.presets).toBeNull();
    }

    const operation = stores.get("/operations")[0];
    expect(operation.options.headers).toEqual([
      { header: "Content-Type", value: "application/json" },
      { header: "x-directus-secret", value: REQUIRED_ENV.REVALIDATE_SECRET },
    ]);
    expect(operation.options.body).toEqual({
      model: "{{$trigger.collection}}",
      event: "{{$trigger.event}}",
      key: "{{$trigger.key}}",
      keys: "{{$trigger.keys}}",
    });
  });

  it("is idempotent across two complete runs", async () => {
    const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
    const requests = [];
    const { fetchImpl, stores } = createDirectusFake(requests);

    await runBootstrap({ env: REQUIRED_ENV, fetchImpl, sleep: async () => {} });
    const createsAfterFirstRun = requests.filter(
      ({ method, pathname }) => method === "POST" && pathname !== "/auth/login",
    ).length;
    await runBootstrap({ env: REQUIRED_ENV, fetchImpl, sleep: async () => {} });

    expect(
      requests.filter(({ method, pathname }) => method === "POST" && pathname !== "/auth/login"),
    ).toHaveLength(createsAfterFirstRun);
    expect(stores.get("/roles")).toHaveLength(1);
    expect(stores.get("/policies")).toHaveLength(1);
    expect(stores.get("/access")).toHaveLength(1);
    expect(stores.get("/permissions")).toHaveLength(12);
    expect(stores.get("/flows")).toHaveLength(1);
    expect(stores.get("/operations")).toHaveLength(1);
  });

  it("rejects duplicate stable metadata instead of selecting an arbitrary record", async () => {
    const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
    const requests = [];
    const { fetchImpl } = createDirectusFake(requests, { duplicatePath: "/roles" });

    await expect(
      runBootstrap({ env: REQUIRED_ENV, fetchImpl, sleep: async () => {} }),
    ).rejects.toThrow("Multiple Directus records match stable key for /roles");
    expect(requests).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "POST", pathname: "/roles" })]),
    );
  });

  it("never writes content items or issues delete requests", async () => {
    const { runBootstrap } = await import("../../../directus/bootstrap.cjs");
    const requests = [];
    const { fetchImpl } = createDirectusFake(requests);

    await runBootstrap({ env: REQUIRED_ENV, fetchImpl, sleep: async () => {} });

    const writes = requests.filter(({ method }) => ["POST", "PATCH", "DELETE"].includes(method));
    expect(writes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pathname: expect.stringMatching(/^\/items(?:\/|$)/) }),
      ]),
    );
    expect(writes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "DELETE" })]),
    );
  });
});

describe("Directus container entrypoint", () => {
  const temporaryDirectories = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function entrypointFixture({ bootstrapStatus = "0", startStatus = "0", staleMarker = false } = {}) {
    const directory = mkdtempSync(join(tmpdir(), "casn-directus-start-"));
    temporaryDirectories.push(directory);
    const cli = join(directory, "cli.js");
    const node = join(directory, "node");
    const marker = join(directory, "ready");
    const bootstrap = join(directory, "bootstrap.cjs");
    const log = join(directory, "node.log");

    writeFileSync(cli, "// fake image-bundled CLI\n");
    writeFileSync(bootstrap, "// fake repository bootstrap\n");
    writeFileSync(
      node,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$DIRECTUS_TEST_LOG"
if [ "$1" = "$DIRECTUS_CLI_JS" ] && [ "\${2:-}" = bootstrap ]; then exit 0; fi
if [ "$1" = "$DIRECTUS_CLI_JS" ] && [ "\${2:-}" = start ]; then exit "$DIRECTUS_START_STATUS"; fi
if [ "$1" = "$DIRECTUS_BOOTSTRAP_SCRIPT" ]; then exit "$DIRECTUS_BOOTSTRAP_STATUS"; fi
exit 9
`,
    );
    chmodSync(node, 0o755);
    if (staleMarker) writeFileSync(marker, "stale\n");

    const result = spawnSync("sh", ["directus/start.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        DIRECTUS_CLI_JS: cli,
        DIRECTUS_BOOTSTRAP_SCRIPT: bootstrap,
        DIRECTUS_READY_MARKER: marker,
        DIRECTUS_TEST_LOG: log,
        DIRECTUS_BOOTSTRAP_STATUS: bootstrapStatus,
        DIRECTUS_START_STATUS: startStatus,
      },
      encoding: "utf8",
      timeout: 3000,
    });

    return { result, marker, log };
  }

  it("removes a stale marker before failing CLI preflight", () => {
    const directory = mkdtempSync(join(tmpdir(), "casn-directus-preflight-"));
    temporaryDirectories.push(directory);
    const marker = join(directory, "ready");
    writeFileSync(marker, "stale\n");

    const result = spawnSync("sh", ["directus/start.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DIRECTUS_CLI_JS: join(directory, "missing-cli.js"),
        DIRECTUS_READY_MARKER: marker,
      },
      encoding: "utf8",
      timeout: 3000,
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it("uses node with cli.js and leaves marker absent when configuration fails", () => {
    const { result, marker, log } = entrypointFixture({ bootstrapStatus: "7", staleMarker: true });

    expect(result.status).toBe(7);
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(log, "utf8")).toContain("cli.js bootstrap");
    expect(readFileSync(log, "utf8")).toContain("cli.js start");
  });

  it("removes the marker when Directus exits after successful configuration", () => {
    const { result, marker } = entrypointFixture();

    expect(result.status).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });
});
