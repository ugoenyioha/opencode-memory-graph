// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import { addContext, waitForDebugger, waitForDebuggerLoaded } from './utils/assertions';

test.describe('Context Creation Flow', () => {
  test('Go writer creates a context and frontend can view it', async ({
    apiPage,
    goWriter,
  }) => {
    // Create a context via Go writer
    const result = goWriter.createContext();

    // Verify Go CLI output
    expect(result.contextId).toBeGreaterThan(0);
    expect(result.headTurnId).toBe(0); // New context starts with turn 0
    expect(result.headDepth).toBe(0);

    // Open the frontend
    await apiPage.goto('/');

    // Enter the context ID
    await addContext(apiPage, result.contextId);

    // Wait for the debugger to open
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Verify the header shows 0 turns
    await expect(apiPage.locator('[data-context-debugger]')).toContainText('0 turns');
    await expect(apiPage.locator('[data-context-debugger]')).toContainText('0 tool calls');
  });

  test('creating multiple contexts generates unique IDs', async ({ goWriter }) => {
    const context1 = goWriter.createContext();
    const context2 = goWriter.createContext();
    const context3 = goWriter.createContext();

    // Each context should have a unique ID
    expect(context1.contextId).not.toBe(context2.contextId);
    expect(context2.contextId).not.toBe(context3.contextId);
    expect(context1.contextId).not.toBe(context3.contextId);

    // IDs should be positive integers
    expect(context1.contextId).toBeGreaterThan(0);
    expect(context2.contextId).toBeGreaterThan(0);
    expect(context3.contextId).toBeGreaterThan(0);
  });

  test('frontend shows empty state for new context', async ({ apiPage, goWriter }) => {
    const result = goWriter.createContext();

    await apiPage.goto('/');
    await addContext(apiPage, result.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Check for empty state message
    await expect(
      apiPage.locator('[data-context-debugger]').getByText('No turns.')
    ).toBeVisible();
  });
});
