/** @jest-environment node */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Directus smoke HTTP response isolation", () => {
  it("clears a seeded token response and never emits it after transport failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "casn-directus-http-test-"));
    const responseFile = join(directory, "response.json");
    const sentinel = "SENTINEL_ACCESS_TOKEN_MUST_NOT_LEAK";
    writeFileSync(responseFile, JSON.stringify({ data: { access_token: sentinel } }), {
      mode: 0o600,
    });

    try {
      const helper = join(process.cwd(), "scripts/ci/directus-smoke-http.sh");
      const program = `
        set +e
        source "$1"
        readonly response_file="$2"
        curl() {
          printf '000'
          return 7
        }
        perform_http_request "$response_file" --silent --show-error http://127.0.0.1:1
        status=$?
        if [[ -s "$response_file" ]]; then
          echo "current response diagnostics:" >&2
          cat "$response_file" >&2
        fi
        exit "$status"
      `;
      const result = spawnSync("bash", ["-c", program, "bash", helper, responseFile], {
        encoding: "utf8",
      });

      expect(result.stderr).not.toContain(sentinel);
      expect(result.stderr).not.toContain("readonly variable");
      expect(result.stdout).not.toContain(sentinel);
      expect(readFileSync(responseFile, "utf8")).toBe("");
      expect(result.status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
