/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const extensionDirectory = join(
  process.cwd(),
  "directus/extensions/directus-extension-casn-field-guard",
);
const extensionEntrypoint = join(extensionDirectory, "dist/index.js");

function invokeHook(
  event: string,
  collection: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
) {
  const program = `
    import register from ${JSON.stringify(pathToFileURL(extensionEntrypoint).href)};
    const handlers = {};
    register({ filter(name, handler) { handlers[name] = handler; } });
    try {
      const result = await handlers[${JSON.stringify(event)}](
        ${JSON.stringify(payload)},
        { collection: ${JSON.stringify(collection)} },
      );
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        name: error.name,
        code: error.code,
        status: error.status,
        message: error.message,
        extensions: error.extensions,
      }));
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("CASN Directus technical-field guard", () => {
  it("is packaged as an exact Directus 12.3.1 hook extension", () => {
    const manifest = JSON.parse(readFileSync(join(extensionDirectory, "package.json"), "utf8"));
    expect(manifest.name).toBe("directus-extension-casn-field-guard");
    expect(manifest.type).toBe("module");
    expect(manifest["directus:extension"]).toEqual({
      type: "hook",
      path: "dist/index.js",
      source: "",
      host: "12.3.1",
    });
  });

  it.each(["Author", "Analysis", "IssueCollection"])(
    "rejects technical fields on %s create with a clear 403",
    (collection) => {
      const outcome = invokeHook("items.create", collection, {
        title: "Allowed",
        strapiId: 41,
      });
      expect(outcome).toMatchObject({
        ok: false,
        name: "DirectusError",
        code: "FORBIDDEN",
        status: 403,
      });
      expect(outcome.message).toContain("strapiId");
      expect(outcome.message).toContain(collection);
    },
  );

  it.each(["Author", "Analysis", "IssueCollection"])(
    "rejects technical fields on %s update with a clear 403",
    (collection) => {
      const outcome = invokeHook("items.update", collection, {
        sourceHash: "forbidden",
      });
      expect(outcome).toMatchObject({
        ok: false,
        name: "DirectusError",
        code: "FORBIDDEN",
        status: 403,
      });
      expect(outcome.message).toContain("sourceHash");
      expect(outcome.message).toContain(collection);
    },
  );

  it("passes ordinary fields through unchanged", () => {
    const payload = { title: "Allowed", publishedAt: null };
    expect(invokeHook("items.update", "Analysis", payload)).toEqual({
      ok: true,
      result: payload,
    });
  });

  it("rejects a technical field anywhere in a bulk payload", () => {
    const outcome = invokeHook("items.create", "Analysis", [
      { title: "Allowed" },
      { title: "Rejected", sourceHash: "forbidden" },
    ]);
    expect(outcome).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      status: 403,
    });
    expect(outcome.message).toContain("sourceHash");
  });

  it("passes an ordinary bulk payload through unchanged", () => {
    const payload = [{ title: "One" }, { title: "Two", publishedAt: null }];
    expect(invokeHook("items.update", "Analysis", payload)).toEqual({
      ok: true,
      result: payload,
    });
  });

  it("does not change unrelated collections", () => {
    const payload = { sourceHash: "outside-managed-scope" };
    expect(invokeHook("items.create", "OtherCollection", payload)).toEqual({
      ok: true,
      result: payload,
    });
  });
});
