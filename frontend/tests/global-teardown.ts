// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { rmSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Global teardown: Clean up any resources created during tests.
 */
async function globalTeardown() {
  console.log('Global teardown complete.');
  // The Go writer binary could optionally be removed here,
  // but we'll keep it for faster subsequent test runs.
}

export default globalTeardown;
