import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('Jest setup datasource teardown', () => {
  it('makes a rejecting canonical datasource destroy observable', () => {
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules/jest/bin/jest.js'),
        '--runInBand',
        '--runTestsByPath',
        'test/fixtures/setup/rejecting-datasource-teardown.fixture.ts',
        '--testMatch=**/*.fixture.ts',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('canonical datasource destroy failed');
  });
});
