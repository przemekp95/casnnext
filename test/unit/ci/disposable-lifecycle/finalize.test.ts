import { resolveExitStatus } from '@/scripts/ci/disposable-lifecycle/finalize';
import type { finalizeOwnedRun } from '@/scripts/ci/disposable-lifecycle/finalize';
import type { OwnedProcess } from '@/scripts/ci/disposable-lifecycle/owned-process';
import { LifecycleFailure, type ChildOutcome } from '@/scripts/ci/disposable-lifecycle/types';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

const productionParametersAreExact: Equal<
  Parameters<typeof finalizeOwnedRun>,
  [owned: OwnedProcess, timeoutMs: number]
> = true;

test('production finalization accepts only the owned process and timeout', () => {
  expect(productionParametersAreExact).toBe(true);
});

test.each([
  [{ kind: 'exit', code: 0 }, { kind: 'clean' }, 0],
  [{ kind: 'exit', code: 23 }, { kind: 'clean' }, 23],
  [{ kind: 'signal', signal: 'SIGTERM' }, { kind: 'clean' }, 143],
  [{ kind: 'spawn-error', message: 'fixture' }, { kind: 'clean' }, 71],
  [{ kind: 'timeout', phase: 'outcome' }, { kind: 'clean' }, 124],
  [{ kind: 'exit', code: 0 }, { kind: 'failed', code: 70, diagnostics: ['cleanup'] }, 70],
  [{ kind: 'exit', code: 23 }, { kind: 'failed', code: 70, diagnostics: ['cleanup'] }, 70],
  [
    { kind: 'signal', signal: 'SIGTERM' },
    { kind: 'failed', code: 70, diagnostics: ['cleanup'] },
    70,
  ],
  [
    { kind: 'spawn-error', message: 'fixture' },
    { kind: 'failed', code: 70, diagnostics: ['cleanup'] },
    70,
  ],
  [
    { kind: 'timeout', phase: 'outcome' },
    { kind: 'failed', code: 70, diagnostics: ['cleanup'] },
    70,
  ],
] as const)('resolves child and cleanup outcomes', (child, cleanup, expected) => {
  expect(resolveExitStatus(child, cleanup)).toBe(expected);
});

test('rejects an unknown child signal with a typed status failure', () => {
  const child: ChildOutcome = { kind: 'signal', signal: 'SIGUNKNOWN' as NodeJS.Signals };

  expect(() => resolveExitStatus(child, { kind: 'clean' })).toThrow(
    expect.objectContaining<Partial<LifecycleFailure>>({
      exitCode: 70,
      message: 'unknown child signal: SIGUNKNOWN',
    }),
  );
});
