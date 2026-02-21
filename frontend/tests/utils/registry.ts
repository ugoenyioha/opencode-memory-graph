// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface RegistryBundle {
  registry_version: number;
  bundle_id: string;
  types: Record<string, TypeDefinition>;
  enums: Record<string, unknown>;
}

export interface TypeDefinition {
  versions: Record<string, TypeVersion>;
}

export interface TypeVersion {
  fields: Record<string, FieldDefinition>;
}

export interface FieldDefinition {
  name: string;
  type: string;
}

/**
 * Create the default test MessageTurn bundle.
 */
export function defaultBundle(): RegistryBundle {
  return {
    registry_version: 1,
    bundle_id: 'test-bundle-v1',
    types: {
      'com.yourorg.ai.MessageTurn': {
        versions: {
          '1': {
            fields: {
              '1': { name: 'role', type: 'string' },
              '2': { name: 'text', type: 'string' },
            },
          },
        },
      },
    },
    enums: {},
  };
}

/**
 * PUT a registry bundle to the HTTP gateway.
 */
export async function putBundle(
  baseUrl: string,
  bundleId: string,
  bundle: RegistryBundle
): Promise<Response> {
  const url = `${baseUrl}/v1/registry/bundles/${encodeURIComponent(bundleId)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bundle),
  });
  return response;
}

/**
 * Create a temporary JSON file for a bundle.
 * Returns the file path. Caller is responsible for cleanup.
 */
export function createBundleFile(bundle: RegistryBundle): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'cxdb-bundle-'));
  const filePath = join(tempDir, 'bundle.json');
  writeFileSync(filePath, JSON.stringify(bundle, null, 2));
  return filePath;
}

/**
 * Clean up a temporary bundle file and its directory.
 */
export function cleanupBundleFile(filePath: string): void {
  try {
    unlinkSync(filePath);
    // Remove the temp directory
    const dir = join(filePath, '..');
    unlinkSync(dir);
  } catch {
    // Ignore cleanup errors
  }
}
