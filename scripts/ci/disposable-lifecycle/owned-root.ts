import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename as pathBasename, join } from 'node:path';

import type { ProcessIdentity } from './types';

export type OwnedRoot = Readonly<{
  path: string;
  basename: string;
  fd: number;
  parentFd: number;
  parentDevice: bigint;
  parentInode: bigint;
  device: bigint;
  inode: bigint;
  uid: bigint;
  mode: bigint;
}>;

export type EvidenceProcessIdentity = Readonly<{
  pid: number;
  startTime: string;
  parentPid: number;
  processGroupId: number;
  sessionId: number;
}>;

export type LifecycleEvidence = Readonly<{
  schemaVersion: 1;
  invocationId: string;
  outcome: 'pass' | 'fail';
  ownedProcesses: readonly EvidenceProcessIdentity[];
  diagnostics: readonly string[];
}>;

export type LifecycleEvidenceInput = Readonly<{
  invocationId: string;
  outcome: 'pass' | 'fail';
  ownedProcesses: readonly ProcessIdentity[];
  diagnostics: readonly string[];
}>;

export type OwnedFile = Readonly<{
  path: string;
  basename: string;
  fd: number;
  device: bigint;
  inode: bigint;
  mode: bigint;
}>;

export type OwnedRootFailureReason =
  | 'unrecognized-root'
  | 'root-closed'
  | 'parent-replaced'
  | 'root-replaced'
  | 'root-permissions-changed'
  | 'invalid-basename'
  | 'invalid-mode'
  | 'destination-exists'
  | 'child-replaced'
  | 'unknown-entry'
  | 'link-failed'
  | 'filesystem-error';

export type OwnedRootVerification =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{ kind: 'failed'; reason: OwnedRootFailureReason }>;

export type OwnedRootRemoval =
  | Readonly<{ kind: 'removed' }>
  | Readonly<{ kind: 'failed'; reason: OwnedRootFailureReason }>;

export type OwnedFileCreation =
  | Readonly<{ kind: 'created'; file: OwnedFile }>
  | Readonly<{ kind: 'failed'; reason: OwnedRootFailureReason }>;

export type EvidencePublication =
  | Readonly<{ kind: 'published'; path: string; evidence: LifecycleEvidence }>
  | Readonly<{ kind: 'failed'; reason: OwnedRootFailureReason }>;

export type OwnedRootBoundary =
  | 'before-evidence-link'
  | 'after-evidence-link'
  | 'before-child-unlink'
  | 'after-child-link'
  | 'after-child-unlink'
  | 'before-final-child-unlink'
  | 'before-helper-unlink'
  | 'before-child-fchmod'
  | 'before-child-final-fstat'
  | 'before-child-registration'
  | 'before-root-rename'
  | 'before-final-root-rename'
  | 'after-root-rename'
  | 'before-root-restore'
  | 'before-final-root-rmdir';

export type OwnedRootBoundaryEvent =
  | Readonly<{
      kind:
        | 'before-evidence-link'
        | 'after-evidence-link'
        | 'before-child-unlink'
        | 'after-child-link'
        | 'after-child-unlink'
        | 'before-final-child-unlink'
        | 'before-helper-unlink'
        | 'before-child-fchmod'
        | 'before-child-final-fstat'
        | 'before-child-registration';
      basename: string;
    }>
  | Readonly<{ kind: 'before-root-rename' }>
  | Readonly<{
      kind:
        | 'before-final-root-rename'
        | 'after-root-rename'
        | 'before-root-restore'
        | 'before-final-root-rmdir';
      tombstonePath: string;
    }>;

export type OwnedRootHooks = Readonly<{
  onBoundary?: (event: OwnedRootBoundaryEvent) => void;
}>;

type ChildIdentity = Readonly<{
  device: bigint;
  inode: bigint;
  type: bigint;
  authorityFd: number;
}>;

type RootState = {
  readonly children: Map<string, ChildIdentity>;
  readonly pendingChildren: Map<string, number>;
  closed: boolean;
};

const rootParent = '/tmp';
const rootPrefix = `${rootParent}/casn-quality-regression-`;
const validBasename = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const fileTypeMask = BigInt(constants.S_IFMT);
const rootStates = new WeakMap<OwnedRoot, RootState>();

function isErrnoWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function descriptorPath(fd: number, basename?: string): string {
  const path = `/proc/self/fd/${fd}`;
  return basename === undefined ? path : `${path}/${basename}`;
}

function isValidBasename(basename: string): boolean {
  return validBasename.test(basename) && basename !== '.' && basename !== '..';
}

function sameObjectIdentity(
  actual: Readonly<{ dev: bigint; ino: bigint }>,
  expected: Readonly<{ device: bigint; inode: bigint }>,
): boolean {
  return actual.dev === expected.device && actual.ino === expected.inode;
}

function childIdentityFromDescriptor(fd: number): ChildIdentity | undefined {
  const stat = fstatSync(fd, { bigint: true });
  if (!stat.isFile()) {
    return undefined;
  }

  return {
    device: stat.dev,
    inode: stat.ino,
    type: stat.mode & fileTypeMask,
    authorityFd: fd,
  };
}

function sameChildIdentity(
  actual: Readonly<{ dev: bigint; ino: bigint; mode: bigint }>,
  expected: ChildIdentity,
): boolean {
  return (
    actual.dev === expected.device &&
    actual.ino === expected.inode &&
    (actual.mode & fileTypeMask) === expected.type
  );
}

function getState(root: OwnedRoot): RootState | undefined {
  return rootStates.get(root);
}

function verifyParent(root: OwnedRoot): OwnedRootVerification {
  try {
    const descriptor = fstatSync(root.parentFd, { bigint: true });
    const path = lstatSync(rootParent, { bigint: true });
    if (
      !descriptor.isDirectory() ||
      !path.isDirectory() ||
      path.isSymbolicLink() ||
      descriptor.dev !== root.parentDevice ||
      descriptor.ino !== root.parentInode ||
      path.dev !== root.parentDevice ||
      path.ino !== root.parentInode
    ) {
      return { kind: 'failed', reason: 'parent-replaced' };
    }
  } catch {
    return { kind: 'failed', reason: 'parent-replaced' };
  }

  return { kind: 'valid' };
}

function verifyRootDescriptor(root: OwnedRoot): OwnedRootVerification {
  try {
    const descriptor = fstatSync(root.fd, { bigint: true });
    if (
      !descriptor.isDirectory() ||
      descriptor.dev !== root.device ||
      descriptor.ino !== root.inode ||
      descriptor.uid !== root.uid
    ) {
      return { kind: 'failed', reason: 'root-replaced' };
    }
    if (descriptor.mode !== root.mode) {
      return { kind: 'failed', reason: 'root-permissions-changed' };
    }
  } catch {
    return { kind: 'failed', reason: 'root-replaced' };
  }

  return { kind: 'valid' };
}

function verifyRootPath(root: OwnedRoot): OwnedRootVerification {
  const parentVerification = verifyParent(root);
  if (parentVerification.kind === 'failed') {
    return parentVerification;
  }

  const descriptorVerification = verifyRootDescriptor(root);
  if (descriptorVerification.kind === 'failed') {
    return descriptorVerification;
  }

  try {
    const path = lstatSync(root.path, { bigint: true });
    if (
      !path.isDirectory() ||
      path.isSymbolicLink() ||
      path.dev !== root.device ||
      path.ino !== root.inode ||
      path.uid !== root.uid
    ) {
      return { kind: 'failed', reason: 'root-replaced' };
    }
    if (path.mode !== root.mode) {
      return { kind: 'failed', reason: 'root-permissions-changed' };
    }
  } catch {
    return { kind: 'failed', reason: 'root-replaced' };
  }

  return { kind: 'valid' };
}

function closeState(root: OwnedRoot, state: RootState): void {
  if (state.closed) {
    return;
  }

  const childDescriptors = new Set([
    ...[...state.children.values()].map((child) => child.authorityFd),
    ...state.pendingChildren.values(),
  ]);
  for (const fd of childDescriptors) {
    try {
      closeSync(fd);
    } catch {
      // A caller cannot gain deletion authority by closing a diagnostic descriptor.
    }
  }

  for (const fd of [root.fd, root.parentFd]) {
    try {
      closeSync(fd);
    } catch {
      // Descriptor loss is already represented by the typed failure.
    }
  }
  state.closed = true;
}

function removalFailure(
  root: OwnedRoot,
  state: RootState,
  reason: OwnedRootFailureReason,
): OwnedRootRemoval {
  closeState(root, state);
  return { kind: 'failed', reason };
}

function invokeBoundary(hooks: OwnedRootHooks | undefined, event: OwnedRootBoundaryEvent): boolean {
  try {
    hooks?.onBoundary?.(event);
    return true;
  } catch {
    return false;
  }
}

function verifyChild(root: OwnedRoot, basename: string, child: ChildIdentity): OwnedRootVerification {
  try {
    const path = lstatSync(descriptorPath(root.fd, basename), { bigint: true });
    const descriptor = fstatSync(child.authorityFd, { bigint: true });
    if (!sameChildIdentity(path, child) || !sameChildIdentity(descriptor, child)) {
      return { kind: 'failed', reason: 'child-replaced' };
    }
  } catch {
    return { kind: 'failed', reason: 'child-replaced' };
  }

  return { kind: 'valid' };
}

function verifyDirectoryEntries(root: OwnedRoot, state: RootState): OwnedRootVerification {
  try {
    for (const [basename, fd] of state.pendingChildren) {
      const child = childIdentityFromDescriptor(fd);
      if (child === undefined) {
        return { kind: 'failed', reason: 'filesystem-error' };
      }
      const path = lstatSync(descriptorPath(root.fd, basename), { bigint: true });
      if (!sameChildIdentity(path, child)) {
        return { kind: 'failed', reason: 'child-replaced' };
      }
      state.children.set(basename, child);
      state.pendingChildren.delete(basename);
    }

    const entries = readdirSync(descriptorPath(root.fd));
    if (entries.some((entry) => !state.children.has(entry))) {
      return { kind: 'failed', reason: 'unknown-entry' };
    }
    for (const [basename, child] of state.children) {
      if (!entries.includes(basename)) {
        return { kind: 'failed', reason: 'child-replaced' };
      }
      const verification = verifyChild(root, basename, child);
      if (verification.kind === 'failed') {
        return verification;
      }
    }
  } catch {
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  return { kind: 'valid' };
}

function closeUnreferencedChildDescriptor(state: RootState, child: ChildIdentity): void {
  const stillReferenced = [...state.children.values()].some(
    (candidate) => candidate.authorityFd === child.authorityFd,
  ) || [...state.pendingChildren.values()].some((fd) => fd === child.authorityFd);
  if (!stillReferenced) {
    try {
      closeSync(child.authorityFd);
    } catch {
      // The child name has already been removed without widening authority.
    }
  }
}

function unlinkCapturedName(
  root: OwnedRoot,
  basename: string,
  child: ChildIdentity,
  hooks: OwnedRootHooks | undefined,
): boolean {
  if (!invokeBoundary(hooks, { kind: 'before-helper-unlink', basename })) {
    return false;
  }

  if (
    verifyRootPath(root).kind === 'failed' ||
    verifyChild(root, basename, child).kind === 'failed'
  ) {
    return false;
  }

  try {
    unlinkSync(descriptorPath(root.fd, basename));
    return true;
  } catch {
    return false;
  }
}

function unlinkRegisteredName(
  root: OwnedRoot,
  state: RootState,
  basename: string,
  hooks: OwnedRootHooks | undefined,
): boolean {
  const child = state.children.get(basename);
  if (child === undefined || !unlinkCapturedName(root, basename, child, hooks)) {
    return false;
  }

  try {
    state.children.delete(basename);
    closeUnreferencedChildDescriptor(state, child);
    return true;
  } catch {
    return false;
  }
}

function closeCreatedDescriptor(fd: number | undefined): void {
  if (fd === undefined) {
    return;
  }
  try {
    closeSync(fd);
  } catch {
    // The descriptor is never retained in state after this close attempt.
  }
}

function createRegisteredFile(
  root: OwnedRoot,
  basename: string,
  mode: number,
  hooks: OwnedRootHooks | undefined,
): OwnedFileCreation {
  const state = getState(root);
  if (state === undefined) {
    return { kind: 'failed', reason: 'unrecognized-root' };
  }
  if (state.closed) {
    return { kind: 'failed', reason: 'root-closed' };
  }
  if (!isValidBasename(basename)) {
    return { kind: 'failed', reason: 'invalid-basename' };
  }
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    return { kind: 'failed', reason: 'invalid-mode' };
  }

  const verification = verifyRootPath(root);
  if (verification.kind === 'failed') {
    return verification;
  }
  if (state.children.has(basename)) {
    return { kind: 'failed', reason: 'destination-exists' };
  }

  const path = descriptorPath(root.fd, basename);
  let writerFd: number;
  try {
    writerFd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      mode,
    );
  } catch (error: unknown) {
    return {
      kind: 'failed',
      reason: isErrnoWithCode(error, 'EEXIST') ? 'destination-exists' : 'filesystem-error',
    };
  }

  state.pendingChildren.set(basename, writerFd);

  let authorityFd: number | undefined;
  let writerIdentity: ChildIdentity | undefined;
  let child: ChildIdentity | undefined;
  try {
    const createdStat = fstatSync(writerFd, { bigint: true });
    if (!createdStat.isFile()) {
      throw new Error('The created child is not a regular file');
    }
    writerIdentity = {
      device: createdStat.dev,
      inode: createdStat.ino,
      type: createdStat.mode & fileTypeMask,
      authorityFd: writerFd,
    };

    authorityFd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    child = childIdentityFromDescriptor(authorityFd);
    if (
      child === undefined ||
      createdStat.dev !== child.device ||
      createdStat.ino !== child.inode ||
      (createdStat.mode & fileTypeMask) !== child.type
    ) {
      throw new Error('The created child identity changed before capture');
    }

    if (!invokeBoundary(hooks, { kind: 'before-child-fchmod', basename })) {
      throw new Error('Injected child mode failure');
    }
    fchmodSync(writerFd, mode);
    if (!invokeBoundary(hooks, { kind: 'before-child-final-fstat', basename })) {
      throw new Error('Injected child stat failure');
    }
    const writerStat = fstatSync(writerFd, { bigint: true });
    if (!sameChildIdentity(writerStat, child) || (writerStat.mode & 0o777n) !== BigInt(mode)) {
      throw new Error('The created child changed before registration');
    }
    if (!invokeBoundary(hooks, { kind: 'before-child-registration', basename })) {
      throw new Error('Injected child registration failure');
    }

    state.children.set(basename, child);
    state.pendingChildren.delete(basename);
    return {
      kind: 'created',
      file: {
        path: join(root.path, basename),
        basename,
        fd: writerFd,
        device: child.device,
        inode: child.inode,
        mode: writerStat.mode,
      },
    };
  } catch {
    const rollbackIdentity = child ?? writerIdentity;
    if (rollbackIdentity !== undefined && unlinkCapturedName(root, basename, rollbackIdentity, hooks)) {
      state.pendingChildren.delete(basename);
      closeCreatedDescriptor(authorityFd);
      if (authorityFd !== writerFd) {
        closeCreatedDescriptor(writerFd);
      }
    } else if (rollbackIdentity !== undefined) {
      state.children.set(basename, rollbackIdentity);
      state.pendingChildren.delete(basename);
      if (authorityFd !== undefined && authorityFd !== rollbackIdentity.authorityFd) {
        closeCreatedDescriptor(authorityFd);
      }
      if (writerFd !== rollbackIdentity.authorityFd) {
        closeCreatedDescriptor(writerFd);
      }
    }
    return { kind: 'failed', reason: 'filesystem-error' };
  }
}

function randomChildBasename(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString('hex')}`;
}

export function createOwnedRoot(): OwnedRoot {
  const parentFd = openSync(rootParent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let rootFd: number | undefined;
  try {
    const parent = fstatSync(parentFd, { bigint: true });
    const parentPath = lstatSync(rootParent, { bigint: true });
    if (
      !parent.isDirectory() ||
      !parentPath.isDirectory() ||
      parentPath.isSymbolicLink() ||
      parent.dev !== parentPath.dev ||
      parent.ino !== parentPath.ino
    ) {
      throw new Error('The temporary parent identity changed during root creation');
    }

    const path = mkdtempSync(rootPrefix);
    rootFd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const rootStat = fstatSync(rootFd, { bigint: true });
    if (!rootStat.isDirectory()) {
      throw new Error('The created driver root is not a directory');
    }

    const root: OwnedRoot = Object.freeze({
      path,
      basename: pathBasename(path),
      fd: rootFd,
      parentFd,
      parentDevice: parent.dev,
      parentInode: parent.ino,
      device: rootStat.dev,
      inode: rootStat.ino,
      uid: rootStat.uid,
      mode: rootStat.mode,
    });
    rootStates.set(root, {
      children: new Map<string, ChildIdentity>(),
      pendingChildren: new Map<string, number>(),
      closed: false,
    });
    return root;
  } catch (error: unknown) {
    if (rootFd !== undefined) {
      try {
        closeSync(rootFd);
      } catch {
        // Preserve the original root-creation failure.
      }
    }
    try {
      closeSync(parentFd);
    } catch {
      // Preserve the original root-creation failure.
    }
    throw error;
  }
}

export function verifyOwnedRoot(root: OwnedRoot): OwnedRootVerification {
  const state = getState(root);
  if (state === undefined) {
    return { kind: 'failed', reason: 'unrecognized-root' };
  }
  if (state.closed) {
    return { kind: 'failed', reason: 'root-closed' };
  }
  return verifyRootPath(root);
}

export function createOwnedFile(
  root: OwnedRoot,
  basename: string,
  mode = 0o600,
  hooks?: OwnedRootHooks,
): OwnedFileCreation {
  return createRegisteredFile(root, basename, mode, hooks);
}

function toLifecycleEvidence(input: LifecycleEvidenceInput): LifecycleEvidence {
  return {
    schemaVersion: 1,
    invocationId: input.invocationId,
    outcome: input.outcome,
    ownedProcesses: input.ownedProcesses.map((identity) => ({
      pid: identity.pid,
      startTime: identity.startTime.toString(10),
      parentPid: identity.parentPid,
      processGroupId: identity.processGroupId,
      sessionId: identity.sessionId,
    })),
    diagnostics: [...input.diagnostics],
  };
}

export function publishEvidence(
  root: OwnedRoot,
  basename: string,
  input: LifecycleEvidenceInput,
  hooks?: OwnedRootHooks,
): EvidencePublication {
  const state = getState(root);
  if (state === undefined) {
    return { kind: 'failed', reason: 'unrecognized-root' };
  }
  if (state.closed) {
    return { kind: 'failed', reason: 'root-closed' };
  }
  if (!isValidBasename(basename)) {
    return { kind: 'failed', reason: 'invalid-basename' };
  }

  const verification = verifyRootPath(root);
  if (verification.kind === 'failed') {
    return verification;
  }

  try {
    lstatSync(descriptorPath(root.fd, basename), { bigint: true });
    return { kind: 'failed', reason: 'destination-exists' };
  } catch (error: unknown) {
    if (!isErrnoWithCode(error, 'ENOENT')) {
      return { kind: 'failed', reason: 'filesystem-error' };
    }
  }

  const temporaryBasename = randomChildBasename('evidence-tmp');
  const temporary = createRegisteredFile(root, temporaryBasename, 0o600, hooks);
  if (temporary.kind === 'failed') {
    return temporary;
  }

  const evidence = toLifecycleEvidence(input);
  try {
    writeFileSync(temporary.file.fd, `${JSON.stringify(evidence)}\n`, { encoding: 'utf8' });
    fsyncSync(temporary.file.fd);
  } catch {
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  const temporaryIdentityBeforeLink = state.children.get(temporaryBasename);
  if (temporaryIdentityBeforeLink === undefined) {
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'child-replaced' };
  }
  if (
    !invokeBoundary(hooks, { kind: 'before-evidence-link', basename }) ||
    verifyRootPath(root).kind === 'failed' ||
    verifyChild(root, temporaryBasename, temporaryIdentityBeforeLink).kind === 'failed'
  ) {
    unlinkRegisteredName(root, state, temporaryBasename, hooks);
    closeSync(temporary.file.fd);
    const rootVerification = verifyRootPath(root);
    return {
      kind: 'failed',
      reason: rootVerification.kind === 'failed' ? rootVerification.reason : 'filesystem-error',
    };
  }

  try {
    linkSync(descriptorPath(root.fd, temporaryBasename), descriptorPath(root.fd, basename));
  } catch (error: unknown) {
    unlinkRegisteredName(root, state, temporaryBasename, hooks);
    closeSync(temporary.file.fd);
    return {
      kind: 'failed',
      reason: isErrnoWithCode(error, 'EEXIST') ? 'destination-exists' : 'link-failed',
    };
  }

  const temporaryIdentity = state.children.get(temporaryBasename);
  if (temporaryIdentity === undefined) {
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'child-replaced' };
  }
  try {
    const finalIdentity = lstatSync(descriptorPath(root.fd, basename), { bigint: true });
    if (!sameChildIdentity(finalIdentity, temporaryIdentity)) {
      closeSync(temporary.file.fd);
      return { kind: 'failed', reason: 'child-replaced' };
    }
  } catch {
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'child-replaced' };
  }
  state.children.set(basename, temporaryIdentity);

  if (!invokeBoundary(hooks, { kind: 'after-evidence-link', basename })) {
    unlinkRegisteredName(root, state, temporaryBasename, hooks);
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  const rootAfterLink = verifyRootPath(root);
  const finalVerification = verifyChild(root, basename, temporaryIdentity);
  if (rootAfterLink.kind === 'failed') {
    unlinkRegisteredName(root, state, temporaryBasename, hooks);
    closeSync(temporary.file.fd);
    return rootAfterLink;
  }
  if (finalVerification.kind === 'failed') {
    unlinkRegisteredName(root, state, temporaryBasename, hooks);
    closeSync(temporary.file.fd);
    return finalVerification;
  }

  if (!unlinkRegisteredName(root, state, temporaryBasename, hooks)) {
    closeSync(temporary.file.fd);
    return { kind: 'failed', reason: 'child-replaced' };
  }
  closeSync(temporary.file.fd);

  return { kind: 'published', path: join(root.path, basename), evidence };
}

function removeRegisteredChild(
  root: OwnedRoot,
  state: RootState,
  basename: string,
  hooks: OwnedRootHooks | undefined,
): OwnedRootVerification {
  const child = state.children.get(basename);
  if (child === undefined) {
    return { kind: 'failed', reason: 'child-replaced' };
  }

  if (!invokeBoundary(hooks, { kind: 'before-child-unlink', basename })) {
    return { kind: 'failed', reason: 'filesystem-error' };
  }
  const rootVerification = verifyRootPath(root);
  if (rootVerification.kind === 'failed') {
    return rootVerification;
  }
  const childVerification = verifyChild(root, basename, child);
  if (childVerification.kind === 'failed') {
    return childVerification;
  }

  const tombstoneBasename = randomChildBasename('child-tombstone');
  try {
    linkSync(descriptorPath(root.fd, basename), descriptorPath(root.fd, tombstoneBasename));
    const tombstone = lstatSync(descriptorPath(root.fd, tombstoneBasename), { bigint: true });
    if (!sameChildIdentity(tombstone, child)) {
      return { kind: 'failed', reason: 'child-replaced' };
    }
    state.children.set(tombstoneBasename, child);
  } catch {
    return { kind: 'failed', reason: 'link-failed' };
  }

  if (!invokeBoundary(hooks, { kind: 'after-child-link', basename })) {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  const afterLinkRoot = verifyRootPath(root);
  const afterLinkChild = verifyChild(root, basename, child);
  const afterLinkTombstone = verifyChild(root, tombstoneBasename, child);
  if (
    afterLinkRoot.kind === 'failed' ||
    afterLinkChild.kind === 'failed' ||
    afterLinkTombstone.kind === 'failed'
  ) {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    if (afterLinkRoot.kind === 'failed') {
      return afterLinkRoot;
    }
    return { kind: 'failed', reason: 'child-replaced' };
  }

  if (!invokeBoundary(hooks, { kind: 'before-final-child-unlink', basename })) {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return { kind: 'failed', reason: 'filesystem-error' };
  }
  const finalRootVerification = verifyRootPath(root);
  const finalTombstoneVerification = verifyChild(root, tombstoneBasename, child);
  const finalChildVerification = verifyChild(root, basename, child);
  if (
    finalRootVerification.kind === 'failed' ||
    finalChildVerification.kind === 'failed' ||
    finalTombstoneVerification.kind === 'failed'
  ) {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    if (finalRootVerification.kind === 'failed') {
      return finalRootVerification;
    }
    return { kind: 'failed', reason: 'child-replaced' };
  }

  try {
    unlinkSync(descriptorPath(root.fd, basename));
    state.children.delete(basename);
  } catch {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  if (!invokeBoundary(hooks, { kind: 'after-child-unlink', basename })) {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return { kind: 'failed', reason: 'filesystem-error' };
  }

  const afterUnlinkRoot = verifyRootPath(root);
  if (afterUnlinkRoot.kind === 'failed') {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return afterUnlinkRoot;
  }
  const entries = verifyDirectoryEntries(root, state);
  if (entries.kind === 'failed') {
    unlinkRegisteredName(root, state, tombstoneBasename, hooks);
    return entries;
  }
  if (!unlinkRegisteredName(root, state, tombstoneBasename, hooks)) {
    return { kind: 'failed', reason: 'child-replaced' };
  }

  return { kind: 'valid' };
}

function verifyOwnedTombstone(root: OwnedRoot, tombstoneBasename: string): OwnedRootVerification {
  const parentVerification = verifyParent(root);
  if (parentVerification.kind === 'failed') {
    return parentVerification;
  }
  const descriptorVerification = verifyRootDescriptor(root);
  if (descriptorVerification.kind === 'failed') {
    return descriptorVerification;
  }

  try {
    const tombstone = lstatSync(descriptorPath(root.parentFd, tombstoneBasename), {
      bigint: true,
    });
    if (
      !tombstone.isDirectory() ||
      tombstone.isSymbolicLink() ||
      !sameObjectIdentity(tombstone, root) ||
      tombstone.uid !== root.uid ||
      tombstone.mode !== root.mode
    ) {
      return { kind: 'failed', reason: 'root-replaced' };
    }
  } catch {
    return { kind: 'failed', reason: 'root-replaced' };
  }

  return { kind: 'valid' };
}

function pathIsAbsent(path: string): boolean {
  try {
    lstatSync(path, { bigint: true });
    return false;
  } catch (error: unknown) {
    return isErrnoWithCode(error, 'ENOENT');
  }
}

function restoreOwnedTombstone(
  root: OwnedRoot,
  tombstoneBasename: string,
  hooks: OwnedRootHooks | undefined,
): boolean {
  const source = descriptorPath(root.parentFd, root.basename);
  const tombstone = descriptorPath(root.parentFd, tombstoneBasename);
  const tombstonePath = join(rootParent, tombstoneBasename);
  if (!invokeBoundary(hooks, { kind: 'before-root-restore', tombstonePath })) {
    return false;
  }
  if (!pathIsAbsent(source) || verifyOwnedTombstone(root, tombstoneBasename).kind === 'failed') {
    return false;
  }

  try {
    renameSync(tombstone, source);
    return true;
  } catch {
    return false;
  }
}

export function removeOwnedRoot(root: OwnedRoot, hooks?: OwnedRootHooks): OwnedRootRemoval {
  const state = getState(root);
  if (state === undefined) {
    return { kind: 'failed', reason: 'unrecognized-root' };
  }
  if (state.closed) {
    return { kind: 'failed', reason: 'root-closed' };
  }

  const verification = verifyRootPath(root);
  if (verification.kind === 'failed') {
    return removalFailure(root, state, verification.reason);
  }
  const entries = verifyDirectoryEntries(root, state);
  if (entries.kind === 'failed') {
    return removalFailure(root, state, entries.reason);
  }

  for (const basename of [...state.children.keys()]) {
    if (!state.children.has(basename)) {
      continue;
    }
    const removal = removeRegisteredChild(root, state, basename, hooks);
    if (removal.kind === 'failed') {
      return removalFailure(root, state, removal.reason);
    }
  }

  const emptyVerification = verifyDirectoryEntries(root, state);
  if (emptyVerification.kind === 'failed') {
    return removalFailure(root, state, emptyVerification.reason);
  }
  if (!invokeBoundary(hooks, { kind: 'before-root-rename' })) {
    return removalFailure(root, state, 'filesystem-error');
  }
  const beforeRename = verifyRootPath(root);
  if (beforeRename.kind === 'failed') {
    return removalFailure(root, state, beforeRename.reason);
  }

  let tombstonePath: string;
  let tombstoneBasename: string;
  try {
    tombstonePath = mkdtempSync(`${rootParent}/.casn-quality-regression-tombstone-`);
    tombstoneBasename = pathBasename(tombstonePath);
    const placeholder = lstatSync(descriptorPath(root.parentFd, tombstoneBasename), { bigint: true });
    if (!placeholder.isDirectory() || placeholder.isSymbolicLink()) {
      return removalFailure(root, state, 'filesystem-error');
    }
    rmdirSync(descriptorPath(root.parentFd, tombstoneBasename));

    if (!invokeBoundary(hooks, { kind: 'before-final-root-rename', tombstonePath })) {
      return removalFailure(root, state, 'filesystem-error');
    }
    const finalVerification = verifyRootPath(root);
    if (finalVerification.kind === 'failed') {
      return removalFailure(root, state, finalVerification.reason);
    }
    if (!pathIsAbsent(descriptorPath(root.parentFd, tombstoneBasename))) {
      return removalFailure(root, state, 'destination-exists');
    }
    renameSync(
      descriptorPath(root.parentFd, root.basename),
      descriptorPath(root.parentFd, tombstoneBasename),
    );
  } catch {
    return removalFailure(root, state, 'filesystem-error');
  }

  if (!invokeBoundary(hooks, { kind: 'after-root-rename', tombstonePath })) {
    restoreOwnedTombstone(root, tombstoneBasename, hooks);
    return removalFailure(root, state, 'filesystem-error');
  }

  const tombstoneVerification = verifyOwnedTombstone(root, tombstoneBasename);
  if (tombstoneVerification.kind === 'failed') {
    restoreOwnedTombstone(root, tombstoneBasename, hooks);
    return removalFailure(root, state, tombstoneVerification.reason);
  }
  if (!invokeBoundary(hooks, { kind: 'before-final-root-rmdir', tombstonePath })) {
    restoreOwnedTombstone(root, tombstoneBasename, hooks);
    return removalFailure(root, state, 'filesystem-error');
  }
  const finalTombstoneVerification = verifyOwnedTombstone(root, tombstoneBasename);
  if (finalTombstoneVerification.kind === 'failed') {
    restoreOwnedTombstone(root, tombstoneBasename, hooks);
    return removalFailure(root, state, finalTombstoneVerification.reason);
  }
  try {
    rmdirSync(descriptorPath(root.parentFd, tombstoneBasename));
  } catch {
    restoreOwnedTombstone(root, tombstoneBasename, hooks);
    return removalFailure(root, state, 'filesystem-error');
  }

  closeState(root, state);
  return { kind: 'removed' };
}
