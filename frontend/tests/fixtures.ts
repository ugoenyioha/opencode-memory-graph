// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test as base, Page } from '@playwright/test';
import { startServer, stopServer, ServerHandle, useExternalServer } from './utils/server';
import {
  createContext,
  appendTurn,
  getLastTurns,
  forkContext,
  CreateContextResult,
  AppendTurnResult,
} from './utils/writer';
import { putBundle, defaultBundle, RegistryBundle } from './utils/registry';

/**
 * GoWriter helper interface for fixtures.
 */
export interface GoWriterHelper {
  createContext(baseTurnId?: number): CreateContextResult;
  appendTurn(
    contextId: number,
    role: string,
    text: string,
    options?: { parentId?: number; typeId?: string; typeVersion?: number }
  ): AppendTurnResult;
  getLastTurns(contextId: number, limit?: number): string;
  forkContext(baseTurnId: number): CreateContextResult;
}

/**
 * Registry helper interface for fixtures.
 */
export interface RegistryHelper {
  putBundle(bundleId: string, bundle?: RegistryBundle): Promise<Response>;
  defaultBundle(): RegistryBundle;
}

/**
 * Extended test fixtures.
 */
type TestFixtures = {
  cxdbServer: ServerHandle;
  goWriter: GoWriterHelper;
  registry: RegistryHelper;
  serverHttpUrl: string;
  apiPage: Page;
};

/**
 * Create the extended test with CXDB fixtures.
 */
export const test = base.extend<TestFixtures>({
  /**
   * CXDB Server fixture.
   * Spawns a fresh server instance for each test with temp data directory.
   */
  cxdbServer: async ({}, use) => {
    const handle = await startServer();
    await use(handle);
    stopServer(handle);
  },

  /**
   * Server HTTP URL derived from the cxdbServer fixture.
   */
  serverHttpUrl: async ({ cxdbServer }, use) => {
    await use(`http://127.0.0.1:${cxdbServer.httpPort}`);
  },

  /**
   * Go Writer helper fixture.
   * Provides methods to interact with CXDB via the Go CLI.
   */
  goWriter: async ({ cxdbServer }, use) => {
    const binaryAddr = `127.0.0.1:${cxdbServer.binaryPort}`;

    const helper: GoWriterHelper = {
      createContext(baseTurnId = 0) {
        return createContext(binaryAddr, baseTurnId);
      },
      appendTurn(contextId, role, text, options = {}) {
        return appendTurn(binaryAddr, contextId, role, text, options);
      },
      getLastTurns(contextId, limit = 10) {
        return getLastTurns(binaryAddr, contextId, limit);
      },
      forkContext(baseTurnId) {
        return forkContext(binaryAddr, baseTurnId);
      },
    };

    await use(helper);
  },

  /**
   * Registry helper fixture.
   * Provides methods to manage type registry bundles.
   */
  registry: async ({ cxdbServer }, use) => {
    const baseUrl = `http://127.0.0.1:${cxdbServer.httpPort}`;

    const helper: RegistryHelper = {
      async putBundle(bundleId, bundle = defaultBundle()) {
        return putBundle(baseUrl, bundleId, bundle);
      },
      defaultBundle() {
        return defaultBundle();
      },
    };

    await use(helper);
  },

  /**
   * Page fixture with API routes intercepted and redirected to the test server.
   * Use this instead of the built-in `page` fixture for tests that need API access.
   *
   * When using external servers (CI mode with Docker Compose), route interception
   * is skipped because:
   * 1. Next.js proxy already routes to port 9010 (same as external server)
   * 2. Route interception breaks SSE connections (/v1/events) because fetch
   *    cannot properly forward streaming responses
   */
  apiPage: async ({ page, cxdbServer }, use) => {
    // Skip route interception when using external servers (CI mode)
    // The Next.js dev server proxy already routes to the correct port
    if (useExternalServer()) {
      await use(page);
      return;
    }

    // In local development, we need to intercept routes because the Next.js proxy
    // goes to hardcoded port 9010, but our test server is on a random port.
    //
    // Skip intercepting /v1/events (SSE endpoint) because fetch can't handle
    // streaming responses properly. This means SSE won't work in local tests,
    // but context creation/viewing still works via REST API polling.
    await page.route('**/v1/**', async (route) => {
      const url = route.request().url();

      // Don't intercept SSE event streams - they need true streaming support
      if (url.includes('/v1/events')) {
        await route.continue();
        return;
      }

      // Replace the origin with the test server
      const testUrl = url.replace(/http:\/\/[^\/]+\/v1/, `http://127.0.0.1:${cxdbServer.httpPort}/v1`);

      try {
        // Fetch from the test server
        const response = await fetch(testUrl, {
          method: route.request().method(),
          headers: route.request().headers(),
          body: route.request().postData() || undefined,
        });

        // Return the response to the page
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch {
        // Server may have closed the connection; return 502
        await route.fulfill({
          status: 502,
          body: 'Bad Gateway',
        });
      }
    });

    // Intercept /healthz requests and redirect them to the test server
    // This is critical - without it, health checks go to the hardcoded port 9010
    // instead of the test server's dynamic port, causing fetchContextsData() to never run
    await page.route('**/healthz', async (route) => {
      try {
        const response = await fetch(`http://127.0.0.1:${cxdbServer.httpPort}/healthz`);
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch {
        // If health check fails, return 503
        await route.fulfill({
          status: 503,
          body: 'Service Unavailable',
        });
      }
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
