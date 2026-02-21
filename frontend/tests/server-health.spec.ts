// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';

test.describe('Server Health', () => {
  test('server starts and accepts connections', async ({ cxdbServer, serverHttpUrl }) => {
    // Make a request to the HTTP gateway
    const response = await fetch(`${serverHttpUrl}/v1/contexts/0/turns?limit=1`);

    // Any response < 500 means the server is up and running
    expect(response.status).toBeLessThan(500);
  });

  test('frontend shows server online status', async ({ apiPage }) => {
    await apiPage.goto('/');

    // Wait for the server status check to complete
    await expect(apiPage.getByText('Server online')).toBeVisible({ timeout: 15000 });
  });

  test('health check endpoint returns valid response', async ({ cxdbServer, serverHttpUrl }) => {
    // Test that the health check mechanism works
    const response = await fetch(`${serverHttpUrl}/v1/contexts/0/turns?limit=1`);

    // The frontend uses this to determine online/offline status
    // A 404 is expected for context 0 (which doesn't exist), but it's still < 500
    expect(response.status).toBeLessThan(500);

    // Verify we get valid JSON back
    const data = await response.json();
    expect(data).toBeDefined();
  });
});
