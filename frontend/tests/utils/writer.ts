// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { join } from 'path';

const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const GO_SOURCE_DIR = join(PROJECT_ROOT, 'tools', 'cxdb-writer');
const GO_BINARY = join(PROJECT_ROOT, 'cxdb-writer');

export interface CreateContextResult {
  contextId: number;
  headTurnId: number;
  headDepth: number;
}

export interface AppendTurnResult {
  turnId: number;
  depth: number;
}

/**
 * Build the Go writer binary.
 */
export function buildGoWriter(): void {
  execSync(`go build -o "${GO_BINARY}" .`, {
    cwd: GO_SOURCE_DIR,
    stdio: 'inherit',
  });
}

/**
 * Check if the Go writer binary exists.
 */
export function goWriterExists(): boolean {
  try {
    execSync(`test -f "${GO_BINARY}"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the Go writer CLI with given arguments.
 */
function runGoWriter(command: string, args: string[]): string {
  const opts: ExecSyncOptionsWithStringEncoding = {
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
  };

  const fullArgs = [command, ...args];
  const result = execSync(`"${GO_BINARY}" ${fullArgs.join(' ')}`, opts);
  return result.trim();
}

/**
 * Parse key=value output from Go writer.
 */
function parseOutput(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = output.split(/\s+/);
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Create a new context.
 */
export function createContext(binaryAddr: string, baseTurnId: number = 0): CreateContextResult {
  const output = runGoWriter('create-context', [
    `-addr`, binaryAddr,
    `-base`, baseTurnId.toString(),
  ]);

  const parsed = parseOutput(output);
  return {
    contextId: parseInt(parsed.context_id, 10),
    headTurnId: parseInt(parsed.head_turn_id, 10),
    headDepth: parseInt(parsed.head_depth, 10),
  };
}

/**
 * Append a turn to a context.
 */
export function appendTurn(
  binaryAddr: string,
  contextId: number,
  role: string,
  text: string,
  options: {
    parentId?: number;
    typeId?: string;
    typeVersion?: number;
  } = {}
): AppendTurnResult {
  const args = [
    `-addr`, binaryAddr,
    `-context`, contextId.toString(),
    `-role`, role,
    `-text`, `"${text.replace(/"/g, '\\"')}"`,
  ];

  if (options.parentId !== undefined && options.parentId > 0) {
    args.push(`-parent`, options.parentId.toString());
  }
  if (options.typeId) {
    args.push(`-type-id`, options.typeId);
  }
  if (options.typeVersion !== undefined) {
    args.push(`-type-version`, options.typeVersion.toString());
  }

  const output = runGoWriter('append', args);
  const parsed = parseOutput(output);

  return {
    turnId: parseInt(parsed.turn_id, 10),
    depth: parseInt(parsed.depth, 10),
  };
}

/**
 * Get last N turns for a context.
 */
export function getLastTurns(
  binaryAddr: string,
  contextId: number,
  limit: number = 10
): string {
  return runGoWriter('get-last', [
    `-addr`, binaryAddr,
    `-context`, contextId.toString(),
    `-limit`, limit.toString(),
  ]);
}

/**
 * Fork a context from a given turn.
 * Creates a new context with head pointing to the specified base turn.
 */
export function forkContext(binaryAddr: string, baseTurnId: number): CreateContextResult {
  const output = runGoWriter('create-context', [
    `-addr`, binaryAddr,
    `-base`, baseTurnId.toString(),
  ]);

  const parsed = parseOutput(output);
  return {
    contextId: parseInt(parsed.context_id, 10),
    headTurnId: parseInt(parsed.head_turn_id, 10),
    headDepth: parseInt(parsed.head_depth, 10),
  };
}

/**
 * Get typed turns via HTTP gateway.
 */
export function getTypedTurns(
  httpAddr: string,
  contextId: number,
  limit: number = 10
): string {
  return runGoWriter('get-typed', [
    `-http`, `http://${httpAddr}`,
    `-context`, contextId.toString(),
    `-limit`, limit.toString(),
  ]);
}

/**
 * Publish a registry bundle via HTTP gateway.
 */
export function publishRegistry(
  httpAddr: string,
  bundleId: string,
  filePath: string
): string {
  return runGoWriter('publish-registry', [
    `-http`, `http://${httpAddr}`,
    `-bundle-id`, bundleId,
    `-file`, filePath,
  ]);
}
