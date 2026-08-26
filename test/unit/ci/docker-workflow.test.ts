/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/docker.yml"),
  "utf8",
);
const deploymentWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8",
);

describe("CI/CD workflow", () => {
  it("publishes main images for an explicit main workflow dispatch", () => {
    const mainPublishCondition =
      "if: (github.event_name == 'push' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/'))) || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')";

    expect(workflow.split(mainPublishCondition)).toHaveLength(5);
    expect(
      workflow.match(
        /type=raw,value=main,enable=\$\{\{ github\.ref == 'refs\/heads\/main' \}\}/g,
      ),
    ).toHaveLength(2);
  });

  it("installs age before snapshot tests in build and deployment workflows", () => {
    const dependencyStep = "sudo apt-get install --yes age";

    expect(workflow).toContain(dependencyStep);
    expect(deploymentWorkflow).toContain(dependencyStep);
  });
});
