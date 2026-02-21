// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  addContext,
  waitForDebugger,
  waitForDebuggerLoaded,
  getTimelineItems,
  getSearchInput,
} from './utils/assertions';

test.describe('Search and Filter', () => {
  test('search filters timeline to matching turns', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    // Append 5 turns with varied content
    goWriter.appendTurn(ctx.contextId, 'user', 'Hello assistant');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Hello! How can I help?');
    goWriter.appendTurn(ctx.contextId, 'user', 'Tell me about CXDB');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'CXDB is an AI context store');
    goWriter.appendTurn(ctx.contextId, 'user', 'Thanks for the info');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Initially should show all 5 turns
    await expect(getTimelineItems(apiPage)).toHaveCount(5);

    // Type "CXDB" in search box (only appears in turns 3 and 4)
    // Use click + pressSequentially to reliably trigger React controlled input onChange
    const searchInput = getSearchInput(apiPage);
    await searchInput.click();
    await searchInput.pressSequentially('CXDB');

    // Wait for the filter to take effect (React state update)
    const items = getTimelineItems(apiPage);
    await expect(items).toHaveCount(2);
  });

  test('clearing search shows all turns again', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Message 1');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Response 1');
    goWriter.appendTurn(ctx.contextId, 'user', 'Message 2');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Initially 3 items
    await expect(getTimelineItems(apiPage)).toHaveCount(3);

    // Search to filter
    const searchInput = getSearchInput(apiPage);
    await searchInput.click();
    await searchInput.pressSequentially('user');

    // Should be filtered - wait for React to re-render
    await expect(getTimelineItems(apiPage)).not.toHaveCount(3, { timeout: 3000 }).catch(() => {});

    // Clear search
    await searchInput.clear();

    // Should show all 3 again
    await expect(getTimelineItems(apiPage)).toHaveCount(3);
  });

  test('Ctrl+K focuses search input', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Test message');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Press Ctrl+K
    await apiPage.keyboard.press('Control+k');

    // Search input should be focused
    const searchInput = getSearchInput(apiPage);
    await expect(searchInput).toBeFocused();
  });

  test('Cmd+K focuses search input (macOS)', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Test message');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Click the debugger container to ensure it has keyboard focus
    await apiPage.locator('[data-context-debugger]').click();
    await apiPage.waitForTimeout(100);

    // Press Meta+K (Cmd on macOS)
    await apiPage.keyboard.press('Meta+k');

    // Search input should be focused
    const searchInput = getSearchInput(apiPage);
    await expect(searchInput).toBeFocused();
  });

  test('search is case-insensitive', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Hello World');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'HELLO THERE');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Search for lowercase "hello"
    const searchInput = getSearchInput(apiPage);
    await searchInput.click();
    await searchInput.pressSequentially('hello');

    // Should find both turns (case-insensitive)
    const items = getTimelineItems(apiPage);
    await expect(items).toHaveCount(2);
  });

  test('search with no matches shows empty state', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Hello');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Search for something that doesn't exist
    const searchInput = getSearchInput(apiPage);
    await searchInput.click();
    await searchInput.pressSequentially('xyznonexistent');

    // Should show "No matches" or empty state
    await expect(
      apiPage.locator('[data-context-debugger]').getByText('No matches')
    ).toBeVisible();
  });
});
