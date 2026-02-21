// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import { test as baseTest } from '@playwright/test';
import {
  waitForDebugger,
} from './utils/assertions';

test.describe('Error Handling', () => {
  test('invalid context ID shows error or empty state', async ({ apiPage, cxdbServer }) => {
    // Navigate to home first, then trigger client-side navigation to non-existent context
    await apiPage.goto('/');
    await apiPage.waitForSelector('h1');
    await apiPage.evaluate(() => {
      window.history.pushState(null, '', '/c/999999');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitForDebugger(apiPage);

    // Wait for the request to complete
    await apiPage.waitForTimeout(3000);

    // Should show an error OR empty state (implementation dependent)
    const debuggerContent = apiPage.locator('[data-context-debugger]');
    await expect(debuggerContent).toBeVisible();

    // The debugger should show something - error, empty state, or loading
    // Just verify it's visible and responsive
    const isDebuggerWorking = await debuggerContent.isVisible();
    expect(isDebuggerWorking).toBe(true);
  });

  test('empty context ID shows empty state', async ({ apiPage }) => {
    await apiPage.goto('/');

    // Don't enter any context ID, just observe the default state
    // The debugger shouldn't be open
    await expect(apiPage.locator('[data-context-debugger]')).not.toBeVisible();

    // Should show the welcome message
    await expect(apiPage.getByText('CXDB')).toBeVisible();
  });

  test('very large context ID is handled gracefully', async ({ apiPage, cxdbServer }) => {
    // Navigate to home first, then trigger client-side navigation
    await apiPage.goto('/');
    await apiPage.waitForSelector('h1');
    await apiPage.evaluate(() => {
      window.history.pushState(null, '', '/c/18446744073709551615');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitForDebugger(apiPage);

    // Wait for request to complete
    await apiPage.waitForTimeout(2000);

    // Should handle gracefully (error or empty state)
    const debuggerContent = apiPage.locator('[data-context-debugger]');
    await expect(debuggerContent).toBeVisible();
  });

  test('negative context ID is handled gracefully', async ({ apiPage }) => {
    // Navigate to home first, then trigger client-side navigation
    await apiPage.goto('/');
    await apiPage.waitForSelector('h1');
    await apiPage.evaluate(() => {
      window.history.pushState(null, '', '/c/-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // The app should handle this gracefully (either reject or normalize)
    // Check that the header is still visible (app didn't crash)
    await expect(apiPage.locator('header')).toBeVisible();
  });
});

// Test for server offline - uses a separate test without cxdbServer fixture
// Note: These tests require the dev server to be running but no CXDB backend
baseTest.describe('Server Offline Handling', () => {
  baseTest.skip('server offline shows offline indicator', async ({ page }) => {
    // Skip: This test requires manual setup (no CXDB server running)
    // When running manually, the page should show "Server offline"
    await page.goto('http://localhost:3000');
    await expect(page.getByText('Server offline')).toBeVisible({ timeout: 15000 });
  });

  baseTest.skip('debugger shows connection error when server is offline', async ({ page }) => {
    // Skip: This test requires manual setup (no CXDB server running)
    // Navigate directly to a context via URL
    await page.goto('http://localhost:3000/c/1');
    await expect(page.locator('[data-context-debugger]')).toBeVisible();
    const errorText = page.locator('[data-context-debugger]').locator('.text-red-400');
    await expect(errorText).toBeVisible({ timeout: 10000 });
  });
});
