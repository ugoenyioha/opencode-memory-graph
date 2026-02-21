// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  addContext,
  waitForDebugger,
  waitForDebuggerLoaded,
  getTimelineItems,
} from './utils/assertions';

test.describe('Keyboard Navigation', () => {
  test('j key moves selection down', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 1');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Turn 2');
    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 3');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    const items = getTimelineItems(apiPage);

    // First item should be initially selected (has bg-slate-800/70 class)
    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press j to move down
    await apiPage.keyboard.press('j');

    // Second item should now be selected
    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);
  });

  test('k key moves selection up', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 1');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Turn 2');
    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 3');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    const items = getTimelineItems(apiPage);

    // Move to second item first
    await apiPage.keyboard.press('j');
    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press k to move back up
    await apiPage.keyboard.press('k');

    // First item should be selected again
    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);
  });

  test('ArrowDown moves selection down', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 1');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Turn 2');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    const items = getTimelineItems(apiPage);
    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press ArrowDown
    await apiPage.keyboard.press('ArrowDown');

    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);
  });

  test('ArrowUp moves selection up', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 1');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'Turn 2');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    const items = getTimelineItems(apiPage);

    // Move down first
    await apiPage.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press ArrowUp
    await apiPage.keyboard.press('ArrowUp');

    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);
  });

  test('Escape closes the debugger modal', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Test turn');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Verify debugger is open
    await expect(apiPage.locator('[data-context-debugger]')).toBeVisible();

    // Press Escape
    await apiPage.keyboard.press('Escape');

    // Debugger should be closed
    await expect(apiPage.locator('[data-context-debugger]')).not.toBeVisible();
  });

  test('navigation wraps at boundaries', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 1');
    goWriter.appendTurn(ctx.contextId, 'user', 'Turn 2');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    const items = getTimelineItems(apiPage);

    // First item selected
    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press k (up) at the top - should stay at first item
    await apiPage.keyboard.press('k');
    await expect(items.nth(0)).toHaveClass(/bg-theme-bg-tertiary/);

    // Go to last item
    await apiPage.keyboard.press('j');
    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);

    // Press j (down) at the bottom - should stay at last item
    await apiPage.keyboard.press('j');
    await expect(items.nth(1)).toHaveClass(/bg-theme-bg-tertiary/);
  });

  test('Ctrl+R refreshes data', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Initial turn');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Should have 1 turn
    await expect(getTimelineItems(apiPage)).toHaveCount(1);

    // Add another turn
    goWriter.appendTurn(ctx.contextId, 'assistant', 'New turn');

    // Press Ctrl+R to refresh
    await apiPage.keyboard.press('Control+r');

    // Wait for reload and new data
    await apiPage.waitForTimeout(1000);

    // Should now have 2 turns
    await expect(getTimelineItems(apiPage)).toHaveCount(2);
  });
});
