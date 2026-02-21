// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { spawn, ChildProcess, execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import net from 'net';

export interface ServerHandle {
  process: ChildProcess | null;
  binaryPort: number;
  httpPort: number;
  dataDir: string;
  external: boolean;
}

/**
 * Check if we should use an external server (set via CXDB_TEST_ADDR env var).
 */
export function useExternalServer(): boolean {
  return !!globalThis.process.env.CXDB_TEST_ADDR;
}

/**
 * Get external server configuration from environment variables.
 * Returns null if external server is not configured.
 */
export function getExternalServerConfig(): { binaryPort: number; httpPort: number } | null {
  const addr = globalThis.process.env.CXDB_TEST_ADDR;
  const httpAddr = globalThis.process.env.CXDB_TEST_HTTP_ADDR;

  if (!addr) {
    return null;
  }

  // Parse binary port from CXDB_TEST_ADDR (e.g., "localhost:9009")
  const binaryPort = parseInt(addr.split(':')[1], 10);

  // Parse HTTP port from CXDB_TEST_HTTP_ADDR (e.g., "http://localhost:9010")
  let httpPort = 9010; // default
  if (httpAddr) {
    const match = httpAddr.match(/:(\d+)$/);
    if (match) {
      httpPort = parseInt(match[1], 10);
    }
  }

  return { binaryPort, httpPort };
}

/**
 * Find an available port.
 */
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not get port'));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Wait for a TCP port to accept connections.
 */
async function waitForPort(port: number, timeout: number = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
        socket.once('error', reject);
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

/**
 * Wait for HTTP endpoint to be ready.
 */
export async function waitForServer(port: number, timeout: number = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/contexts/0/turns?limit=1`);
      // Any response < 500 means server is up
      if (response.status < 500) {
        return;
      }
    } catch {
      // Connection refused, keep trying
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for HTTP server on port ${port}`);
}

/**
 * Start the Rust CXDB server, or return a handle to an external server if configured.
 */
export async function startServer(): Promise<ServerHandle> {
  // Check for external server configuration
  const externalConfig = getExternalServerConfig();
  if (externalConfig) {
    console.log(`Using external server at localhost:${externalConfig.binaryPort} (HTTP: ${externalConfig.httpPort})`);
    // Wait for external server to be ready
    await waitForPort(externalConfig.binaryPort);
    await waitForServer(externalConfig.httpPort);
    return {
      process: null,
      binaryPort: externalConfig.binaryPort,
      httpPort: externalConfig.httpPort,
      dataDir: '',
      external: true,
    };
  }

  const projectRoot = join(__dirname, '..', '..', '..');
  const serverBinary = join(projectRoot, 'target', 'release', 'cxdb-server');

  // Create temp data directory
  const dataDir = mkdtempSync(join(tmpdir(), 'cxdb-test-'));

  // Find available ports
  const binaryPort = await findAvailablePort();
  const httpPort = await findAvailablePort();

  // Spawn server
  const serverProcess = spawn(serverBinary, [], {
    cwd: projectRoot,
    env: {
      ...globalThis.process.env,
      CXDB_DATA_DIR: dataDir,
      CXDB_BIND: `127.0.0.1:${binaryPort}`,
      CXDB_HTTP_BIND: `127.0.0.1:${httpPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log server output for debugging
  serverProcess.stdout?.on('data', (data) => {
    if (globalThis.process.env.DEBUG) {
      console.log(`[server stdout] ${data}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    if (globalThis.process.env.DEBUG) {
      console.error(`[server stderr] ${data}`);
    }
  });

  // Wait for both ports
  await waitForPort(binaryPort);
  await waitForServer(httpPort);

  return {
    process: serverProcess,
    binaryPort,
    httpPort,
    dataDir,
    external: false,
  };
}

/**
 * Stop the server and clean up.
 */
export function stopServer(handle: ServerHandle): void {
  // Don't stop external servers
  if (handle.external) {
    return;
  }

  // Kill the process
  if (handle.process) {
    handle.process.kill('SIGTERM');
  }

  // Clean up data directory
  if (handle.dataDir) {
    try {
      rmSync(handle.dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Build the Rust server (release mode).
 */
export function buildServer(): void {
  const projectRoot = join(__dirname, '..', '..', '..');
  execSync('cargo build --release', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

/**
 * Check if the server binary exists.
 */
export function serverBinaryExists(): boolean {
  const projectRoot = join(__dirname, '..', '..', '..');
  const serverBinary = join(projectRoot, 'target', 'release', 'cxdb-server');
  try {
    execSync(`test -f "${serverBinary}"`);
    return true;
  } catch {
    return false;
  }
}
