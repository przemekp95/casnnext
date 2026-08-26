/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

type Port = { host_ip?: string; published?: string; target?: number };
type Volume = { source?: string; target?: string; read_only?: boolean };
type Service = {
  image?: string;
  command?: string[];
  container_name?: string;
  environment?: Record<string, string>;
  ports?: Port[];
  volumes?: Volume[];
  networks?: Record<string, unknown>;
};

describe("snapshot local Compose boundary", () => {
  it("renders a loopback-only, migration-free and internally isolated stack", () => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--project-name",
        "casn_snapshot_test",
        "--env-file",
        join(process.cwd(), "test/fixtures/snapshot/local.env"),
        "--file",
        join(process.cwd(), "docker-compose.snapshot-local.yml"),
        "config",
        "--format",
        "json",
      ],
      { encoding: "utf8" },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const config = JSON.parse(result.stdout) as {
      services: Record<string, Service>;
      networks: Record<string, { internal?: boolean }>;
    };

    expect(Object.keys(config.services).sort()).toEqual(["app", "directus", "mysql", "nginx"]);
    expect(config.services.mysql.image).toBe(
      "mysql@sha256:a3dff78d876222746a0bacc36dd7e4bf9e673c85fb7ee0d12ed25bd32c43c19b",
    );
    expect(config.services.directus.image).toBe(
      "directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869",
    );
    expect(config.services.mysql.environment?.MYSQL_DATABASE).toBe("casn_local");
    expect(config.services.app.environment?.DB_NAME).toBe("casn_local");
    expect(config.services.app.environment?.RUN_DB_MIGRATIONS).toBeUndefined();
    expect(config.services.app.environment?.DB_MIGRATION_CONFIRM).toBeUndefined();
    expect(config.services.directus.command).toEqual(["npx", "directus", "start"]);

    expect(config.services.mysql.ports).toEqual([
      expect.objectContaining({ host_ip: "127.0.0.1", published: "13307", target: 3306 }),
    ]);
    expect(config.services.nginx.ports).toEqual([
      expect.objectContaining({ host_ip: "127.0.0.1", published: "13010", target: 8080 }),
    ]);
    expect(config.services.app.ports).toBeUndefined();
    expect(config.services.directus.ports).toBeUndefined();

    expect(config.networks.casn_snapshot_internal.internal).toBe(true);
    for (const service of Object.values(config.services)) {
      expect(service.container_name).toBeUndefined();
      expect(Object.keys(service.networks ?? {})).toEqual(["casn_snapshot_internal"]);
    }

    const directusVolumes = config.services.directus.volumes ?? [];
    const directusUploads = directusVolumes.find(
      (volume) => volume.source === "directus_uploads" && volume.target === "/directus/uploads",
    );
    expect(directusUploads).toBeDefined();
    expect(directusUploads?.read_only).not.toBe(true);
    expect(directusVolumes.some((volume) => volume.target?.includes("bootstrap"))).toBe(false);
    expect(directusVolumes.some((volume) => volume.target?.endsWith("/start.sh"))).toBe(false);
    expect(config.services.nginx.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "strapi_uploads", target: "/legacy-strapi-uploads", read_only: true }),
      ]),
    );

    expect(JSON.stringify(config)).not.toContain("casn.pl");
    expect(JSON.stringify(config)).not.toContain("RUN_CASN_MIGRATIONS");
  });
});
