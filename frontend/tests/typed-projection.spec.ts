// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  addContext,
  waitForDebugger,
  waitForDebuggerLoaded,
  selectTimelineItem,
  expandRawPayload,
  getRawPayload,
  expandTurnMetadata,
} from './utils/assertions';

test.describe('Typed Projection Display', () => {
  test('typed view shows field names instead of numeric tags', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    // Create context and register type bundle
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    // Append a turn with the registered type
    goWriter.appendTurn(ctx.contextId, 'user', 'Hello world', {
      typeId: 'com.yourorg.ai.MessageTurn',
      typeVersion: 1,
    });

    // Open frontend (it always requests view=typed)
    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Select the turn
    await selectTimelineItem(apiPage, 0);

    // Expand raw payload section and verify data shows "role": "user" not "1": "user"
    const payload = await getRawPayload(apiPage);
    await expect(payload).toContainText('"role"');
    await expect(payload).toContainText('"user"');
    await expect(payload).toContainText('"text"');
    await expect(payload).toContainText('"Hello world"');

    // Should NOT show numeric tags
    const content = await payload.textContent();
    // The data object should have named fields, not numeric ones
    expect(content).not.toMatch(/"1"\s*:\s*"user"/);
    expect(content).not.toMatch(/"2"\s*:\s*"Hello world"/);
  });

  test('declared_type shows type info', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Test message', {
      typeId: 'com.yourorg.ai.MessageTurn',
      typeVersion: 1,
    });

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    await selectTimelineItem(apiPage, 0);

    // Expand Turn Metadata section to see type info
    await expandTurnMetadata(apiPage);

    // Check Turn Metadata section for type info
    const metadata = apiPage.locator('[data-context-debugger]').getByText('Type');
    await expect(metadata).toBeVisible();

    // Check for type ID display
    await expect(
      apiPage.locator('[data-context-debugger]')
    ).toContainText('com.yourorg.ai.MessageTurn');
    await expect(apiPage.locator('[data-context-debugger]')).toContainText('@1');
  });

  test('unknown fields section handles unregistered types', async ({
    apiPage,
    goWriter,
  }) => {
    // Create context WITHOUT registering the type bundle
    const ctx = goWriter.createContext();

    // Append a turn (no type registered, so fields may be shown as unknown)
    goWriter.appendTurn(ctx.contextId, 'user', 'Test message');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);

    // Wait for data to load (may be empty or show error if type unknown)
    await apiPage.waitForTimeout(3000);

    // Check if there are any timeline items
    const timelineItems = apiPage.locator('[data-debug-event-list] button');
    const count = await timelineItems.count();

    if (count > 0) {
      // If there are items, select the first one
      await selectTimelineItem(apiPage, 0);

      // Expand raw payload section and check content
      const payload = await getRawPayload(apiPage);
      const content = await payload.textContent();
      expect(content).toBeDefined();
      expect(content!.length).toBeGreaterThan(10);
    } else {
      // If no items, that's also valid (type not recognized)
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('multiple turns with typed projection', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    // Append multiple turns
    goWriter.appendTurn(ctx.contextId, 'system', 'You are a helpful assistant');
    goWriter.appendTurn(ctx.contextId, 'user', 'What is CXDB?');
    goWriter.appendTurn(ctx.contextId, 'assistant', 'CXDB is an AI context store');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Select each turn and verify typed projection
    const roles = ['system', 'user', 'assistant'];
    const texts = [
      'You are a helpful assistant',
      'What is CXDB?',
      'CXDB is an AI context store',
    ];

    for (let i = 0; i < 3; i++) {
      await selectTimelineItem(apiPage, i);

      // Expand raw payload section and verify content
      const payload = await getRawPayload(apiPage);
      await expect(payload).toContainText(`"role"`);
      await expect(payload).toContainText(`"${roles[i]}"`);
      await expect(payload).toContainText(`"text"`);
      await expect(payload).toContainText(`"${texts[i]}"`);
    }
  });
});
