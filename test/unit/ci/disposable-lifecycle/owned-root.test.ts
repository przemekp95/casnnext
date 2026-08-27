/** @jest-environment node */
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  createOwnedFile,
  createOwnedRoot,
  publishEvidence,
  removeOwnedRoot,
  verifyOwnedRoot,
  type OwnedRoot,
  type OwnedRootBoundary,
} from '@/scripts/ci/disposable-lifecycle/owned-root';

class TestFixture {
  private readonly roots: OwnedRoot[] = [];
  private readonly paths = new Set<string>();

  ownRoot(root: OwnedRoot): OwnedRoot {
    this.roots.push(root);
    this.paths.add(root.path);
    return root;
  }

  ownPath(path: string): string {
    this.paths.add(path);
    return path;
  }

  directory(prefix = '/tmp/casn-owned-root-victim-'): string {
    return this.ownPath(mkdtempSync(prefix));
  }

  file(path: string, contents: string): string {
    writeFileSync(path, contents, { mode: 0o600 });
    return this.ownPath(path);
  }

  cleanup(): void {
    for (const root of this.roots) {
      try {
        const current = lstatSync(root.path);
        if (current.isDirectory() && !current.isSymbolicLink()) {
          chmodSync(root.path, Number(root.mode & 0o777n));
        }
      } catch {
        // The fixture removes captured paths explicitly below.
      }

      removeOwnedRoot(root);
    }

    const ordered = [...this.paths].sort((left, right) => right.length - left.length);
    for (const path of ordered) {
      try {
        const stat = lstatSync(path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          unlinkSync(path);
        }
      } catch {
        // An owned cleanup may already have removed the path.
      }
    }

    for (const path of ordered) {
      try {
        for (const child of readdirSync(path)) {
          unlinkSync(join(path, child));
        }
        rmdirSync(path);
      } catch {
        // A parent directory may already be absent or still be a symlink.
      }
    }
  }
}

function withFixture<T>(run: (fixture: TestFixture) => T): T {
  const fixture = new TestFixture();
  try {
    return run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function createVictim(fixture: TestFixture): Readonly<{ directory: string; sentinel: string }> {
  const directory = fixture.directory();
  const sentinel = fixture.file(join(directory, 'sentinel'), 'keep');
  return { directory, sentinel };
}

function replaceRootWithSymlink(
  fixture: TestFixture,
  root: OwnedRoot,
  target: string,
  suffix: string,
): string {
  const moved = fixture.ownPath(`${root.path}.${suffix}`);
  renameSync(root.path, moved);
  symlinkSync(target, root.path, 'dir');
  fixture.ownPath(root.path);
  return moved;
}

const evidenceInput = {
  invocationId: 'invocation-42',
  outcome: 'fail' as const,
  ownedProcesses: [
    {
      pid: 42,
      startTime: 12345678901234567890n,
      parentPid: 1,
      processGroupId: 42,
      sessionId: 42,
    },
  ],
  diagnostics: ['fixture failure'],
};

test('anchors root ownership and refuses a symlink replacement without deleting its sentinel', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const sentinel = fixture.file(join(root.path, 'sentinel'), 'keep');
    const moved = fixture.ownPath(`${root.path}.moved`);

    expect(root.path).toMatch(/^\/tmp\/casn-quality-regression-/);
    expect(verifyOwnedRoot(root)).toEqual({ kind: 'valid' });

    renameSync(root.path, moved);
    symlinkSync(moved, root.path, 'dir');
    fixture.ownPath(root.path);

    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
    expect(readFileSync(join(moved, 'sentinel'), 'utf8')).toBe('keep');
    expect(readFileSync(sentinel.replace(root.path, moved), 'utf8')).toBe('keep');
  }));

test('rejects a different directory at the captured root device and inode', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const moved = fixture.ownPath(`${root.path}.original`);
    renameSync(root.path, moved);
    mkdirSync(root.path, { mode: 0o700 });
    fixture.ownPath(root.path);

    expect(verifyOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
    expect(lstatSync(root.path).isDirectory()).toBe(true);
  }));

test('rejects a dangling symlink at the captured root path', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const moved = fixture.ownPath(`${root.path}.original`);
    const missing = `${root.path}.missing`;
    renameSync(root.path, moved);
    symlinkSync(missing, root.path, 'dir');
    fixture.ownPath(root.path);

    expect(verifyOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
    expect(lstatSync(root.path).isSymbolicLink()).toBe(true);
  }));

test('rejects permission mode changes before traversal or removal', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    chmodSync(root.path, 0o750);

    expect(verifyOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-permissions-changed' });
    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-permissions-changed' });
    expect(lstatSync(root.path).isDirectory()).toBe(true);
  }));

test('creates and registers one exact owned child without granting authority over unknown names', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const created = createOwnedFile(root, 'stdout.log');
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') {
      return;
    }

    writeSync(created.file.fd, 'captured');
    closeSync(created.file.fd);
    fixture.ownPath(created.file.path);
    const unknown = fixture.file(join(root.path, 'unknown'), 'outside registry');

    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'unknown-entry' });
    expect(readFileSync(created.file.path, 'utf8')).toBe('captured');
    expect(readFileSync(unknown, 'utf8')).toBe('outside registry');
  }));

test('serializes process start time as decimal JSON and removes only the published owned file', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const published = publishEvidence(root, 'evidence.json', evidenceInput);
    expect(published.kind).toBe('published');
    if (published.kind !== 'published') {
      return;
    }
    fixture.ownPath(published.path);

    expect(JSON.parse(readFileSync(published.path, 'utf8'))).toEqual({
      schemaVersion: 1,
      invocationId: 'invocation-42',
      outcome: 'fail',
      ownedProcesses: [
        {
          pid: 42,
          startTime: '12345678901234567890',
          parentPid: 1,
          processGroupId: 42,
          sessionId: 42,
        },
      ],
      diagnostics: ['fixture failure'],
    });
    expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
  }));

test('refuses an evidence destination symlink collision without reading or replacing it', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const victim = createVictim(fixture);
    const destination = join(root.path, 'evidence.json');
    symlinkSync(victim.sentinel, destination);
    fixture.ownPath(destination);

    expect(publishEvidence(root, 'evidence.json', evidenceInput)).toEqual({
      kind: 'failed',
      reason: 'destination-exists',
    });
    expect(readFileSync(victim.sentinel, 'utf8')).toBe('keep');
  }));

test('refuses duplicate no-clobber evidence publication', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const first = publishEvidence(root, 'evidence.json', evidenceInput);
    expect(first.kind).toBe('published');
    if (first.kind !== 'published') {
      return;
    }
    fixture.ownPath(first.path);

    expect(publishEvidence(root, 'evidence.json', evidenceInput)).toEqual({
      kind: 'failed',
      reason: 'destination-exists',
    });
    expect(readFileSync(first.path, 'utf8')).toContain('12345678901234567890');
  }));

test.each(['../evidence.json', 'nested/evidence.json', '.', '', 'evidence json'])(
  'rejects malformed evidence destination %j',
  (basename) =>
    withFixture((fixture) => {
      const root = fixture.ownRoot(createOwnedRoot());
      expect(publishEvidence(root, basename, evidenceInput)).toEqual({
        kind: 'failed',
        reason: 'invalid-basename',
      });
    }),
);

test('reports stale evidence as a collision and never turns its contents into cleanup authority', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const victim = createVictim(fixture);
    const stale = fixture.file(
      join(root.path, 'evidence.json'),
      JSON.stringify({ schemaVersion: 1, delete: victim.directory }),
    );

    expect(publishEvidence(root, 'evidence.json', evidenceInput)).toEqual({
      kind: 'failed',
      reason: 'destination-exists',
    });
    expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'unknown-entry' });
    expect(readFileSync(stale, 'utf8')).toContain(victim.directory);
    expect(readFileSync(victim.sentinel, 'utf8')).toBe('keep');
  }));

test.each<OwnedRootBoundary>(['before-evidence-link', 'after-evidence-link'])(
  'fails closed when the root path is replaced at %s',
  (boundary) =>
    withFixture((fixture) => {
      const root = fixture.ownRoot(createOwnedRoot());
      const victim = createVictim(fixture);
      let moved: string | undefined;

      const result = publishEvidence(root, 'evidence.json', evidenceInput, {
        onBoundary(event) {
          if (event.kind === boundary) {
            moved = replaceRootWithSymlink(fixture, root, victim.directory, boundary);
          }
        },
      });

      expect(result).toEqual({ kind: 'failed', reason: 'root-replaced' });
      expect(readFileSync(victim.sentinel, 'utf8')).toBe('keep');
      if (moved !== undefined && boundary === 'after-evidence-link') {
        fixture.ownPath(join(moved, 'evidence.json'));
      }
    }),
);

test.each<OwnedRootBoundary>([
  'before-child-unlink',
  'after-child-link',
  'after-child-unlink',
  'before-root-rename',
  'after-root-rename',
])('does not delete replacement content raced at %s', (boundary) =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const victim = createVictim(fixture);
    const created = createOwnedFile(root, 'owned.log');
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') {
      return;
    }
    writeSync(created.file.fd, 'owned');
    closeSync(created.file.fd);
    fixture.ownPath(created.file.path);

    const result = removeOwnedRoot(root, {
      onBoundary(event) {
        if (event.kind !== boundary) {
          return;
        }

        if (event.kind === 'before-child-unlink' || event.kind === 'after-child-link') {
          const backup = fixture.ownPath(`${created.file.path}.${boundary}`);
          renameSync(created.file.path, backup);
          symlinkSync(victim.sentinel, created.file.path);
          fixture.ownPath(created.file.path);
          return;
        }

        if (event.kind === 'after-child-unlink') {
          symlinkSync(victim.sentinel, created.file.path);
          fixture.ownPath(created.file.path);
          return;
        }

        if (event.kind === 'before-root-rename') {
          replaceRootWithSymlink(fixture, root, victim.directory, boundary);
          return;
        }

        if (event.kind !== 'after-root-rename') {
          throw new Error(`Unexpected boundary ${event.kind}`);
        }
        const tombstonePath = event.tombstonePath;
        const moved = fixture.ownPath(`${tombstonePath}.moved`);
        renameSync(tombstonePath, moved);
        symlinkSync(victim.directory, tombstonePath, 'dir');
        fixture.ownPath(tombstonePath);
      },
    });

    expect(result.kind).toBe('failed');
    expect(readFileSync(victim.sentinel, 'utf8')).toBe('keep');
  }));

test('keeps every created path beneath the captured root basename', () =>
  withFixture((fixture) => {
    const root = fixture.ownRoot(createOwnedRoot());
    const created = createOwnedFile(root, 'fixture.sh', 0o700);
    expect(created.kind).toBe('created');
    if (created.kind !== 'created') {
      return;
    }
    closeSync(created.file.fd);
    fixture.ownPath(created.file.path);

    expect(dirname(created.file.path)).toBe(root.path);
    expect(created.file.mode & 0o777n).toBe(0o700n);
    expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
  }));
