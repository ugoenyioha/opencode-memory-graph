// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  addContext,
  waitForDebugger,
  waitForDebuggerLoaded,
  expectTurnCount,
  getTimelineItems,
  selectTimelineItem,
  getRawPayload,
} from './utils/assertions';

test.describe('Turn Append + Display', () => {
  test('append 3 turns and verify display', async ({ apiPage, goWriter, registry }) => {
    // Create context and register type bundle
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    // Append 3 turns via Go writer
    const turn1 = goWriter.appendTurn(ctx.contextId, 'user', 'Hello, assistant');
    expect(turn1.turnId).toBeGreaterThan(0);
    expect(turn1.depth).toBeGreaterThanOrEqual(0);

    const turn2 = goWriter.appendTurn(ctx.contextId, 'assistant', 'Hello! How can I help?');
    expect(turn2.turnId).toBeGreaterThan(turn1.turnId);
    expect(turn2.depth).toBe(turn1.depth + 1);

    const turn3 = goWriter.appendTurn(ctx.contextId, 'user', 'Tell me about CXDB');
    expect(turn3.turnId).toBeGreaterThan(turn2.turnId);
    expect(turn3.depth).toBe(turn2.depth + 1);

    // Open frontend and navigate to context
    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Verify header shows correct counts
    await expectTurnCount(apiPage, 3);
    await expect(apiPage.locator('[data-context-debugger]')).toContainText('0 tool calls');

    // Verify timeline shows 3 turn entries
    const timelineItems = getTimelineItems(apiPage);
    await expect(timelineItems).toHaveCount(3);

    // Verify turn labels show correct roles
    await expect(timelineItems.nth(0)).toContainText('User');
    await expect(timelineItems.nth(1)).toContainText('Assistant');
    await expect(timelineItems.nth(2)).toContainText('User');
  });

  test('selecting a turn shows payload JSON', async ({ apiPage, goWriter, registry }) => {
    const ctx = goWriter.createContext();
    await registry.putBundle('test-bundle-v1');

    goWriter.appendTurn(ctx.contextId, 'user', 'Test message');

    await apiPage.goto('/');
    await addContext(apiPage, ctx.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Select the turn (first item is auto-selected)
    await selectTimelineItem(apiPage, 0);

    // Expand raw payload section and verify content
    const payload = await getRawPayload(apiPage);
    await expect(payload).toContainText('"role"');
    await expect(payload).toContainText('"user"');
    await expect(payload).toContainText('"text"');
    await expect(payload).toContainText('"Test message"');
  });

  test('turn IDs increment properly', async ({ goWriter }) => {
    const ctx = goWriter.createContext();

    const turns = [];
    for (let i = 0; i < 5; i++) {
      const turn = goWriter.appendTurn(ctx.contextId, 'user', `Message ${i}`);
      turns.push(turn);
    }

    // Verify turn IDs are incrementing
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].turnId).toBeGreaterThan(turns[i - 1].turnId);
    }

    // Verify depths increment (relative to first turn)
    const baseDepth = turns[0].depth;
    for (let i = 0; i < turns.length; i++) {
      expect(turns[i].depth).toBe(baseDepth + i);
    }
  });
});
