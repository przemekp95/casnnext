import { spawn } from 'node:child_process';

import type { ChildOutcome } from './types';

type GateParentMessage = Readonly<{
  type: 'release';
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
}> | Readonly<{ type: 'finish' }>;

type GateChildMessage =
  | Readonly<{ type: 'waiting' }>
  | Readonly<{ type: 'started'; pid: number }>
  | Readonly<{ type: 'outcome'; outcome: ChildOutcome }>;

const preReleaseExpiryMs = 2_000;
const testInvocationToken = '--casn-disposable-lifecycle-test-gate';
const testInvocationEnabled = process.argv[2] === testInvocationToken;
let released = false;
let outcomePublished = false;

function testDelay(name: string): number {
  if (!testInvocationEnabled || process.env.CASN_LIFECYCLE_TEST_GATE_MODE !== '1') {
    return 0;
  }
  const value = process.env[name];
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return 0;
  }
  const delay = Number(value);
  return Number.isSafeInteger(delay) ? delay : 0;
}

function send(message: GateChildMessage): void {
  process.send?.(message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function isGateParentMessage(value: unknown): value is GateParentMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (value.type === 'finish') {
    return true;
  }
  return (
    value.type === 'release' &&
    typeof value.command === 'string' &&
    Array.isArray(value.args) &&
    value.args.every((argument) => typeof argument === 'string') &&
    isStringRecord(value.env)
  );
}

function publishOutcome(outcome: ChildOutcome): void {
  if (outcomePublished) {
    return;
  }
  outcomePublished = true;
  send({ type: 'outcome', outcome });
}

const preReleaseExpiry = setTimeout(() => {
  const hangAfterExpiryMs = testDelay('CASN_LIFECYCLE_TEST_GATE_HANG_AFTER_EXPIRY_MS');
  if (hangAfterExpiryMs > 0) {
    setTimeout(() => process.exit(124), hangAfterExpiryMs);
    return;
  }
  process.exit(124);
}, preReleaseExpiryMs);

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => undefined);
}

process.on('message', (message: unknown) => {
  if (!isGateParentMessage(message)) {
    return;
  }

  if (message.type === 'finish') {
    if (outcomePublished) {
      process.exit(0);
    }
    return;
  }

  if (released) {
    return;
  }
  released = true;
  clearTimeout(preReleaseExpiry);

  const target = spawn(message.command, [...message.args], {
    env: { ...message.env } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (target.pid !== undefined) {
    send({ type: 'started', pid: target.pid });
  }
  target.once('error', (error: Error) => {
    publishOutcome({ kind: 'spawn-error', message: error.message });
  });
  target.once('close', (code, signal) => {
    if (signal !== null) {
      publishOutcome({ kind: 'signal', signal });
      return;
    }
    if (code !== null) {
      publishOutcome({ kind: 'exit', code });
      return;
    }
    publishOutcome({ kind: 'spawn-error', message: 'target closed without exit status' });
  });
});

const waitingDelayMs = testDelay('CASN_LIFECYCLE_TEST_GATE_WAITING_DELAY_MS');
if (waitingDelayMs > 0) {
  setTimeout(() => send({ type: 'waiting' }), waitingDelayMs);
} else {
  send({ type: 'waiting' });
}
