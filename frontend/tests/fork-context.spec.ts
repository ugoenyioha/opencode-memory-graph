// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';
import {
  addContext,
  waitForDebugger,
  waitForDebuggerLoaded,
  expectTurnCount,
} from './utils/assertions';

test.describe('Fork Context', () => {
  test('forked context has different context ID', async ({ goWriter }) => {
    // Create original context and add turns
    const original = goWriter.createContext();
    const turn1 = goWriter.appendTurn(original.contextId, 'user', 'Message 1');
    const turn2 = goWriter.appendTurn(original.contextId, 'assistant', 'Response 1');

    // Fork from turn 1
    const forked = goWriter.forkContext(turn1.turnId);

    // Forked context should have different ID
    expect(forked.contextId).not.toBe(original.contextId);
    expect(forked.contextId).toBeGreaterThan(0);
  });

  test('forked context head points to original turn', async ({
    goWriter,
    serverHttpUrl,
  }) => {
    // Create original context
    const original = goWriter.createContext();
    const turn1 = goWriter.appendTurn(original.contextId, 'user', 'Message 1');
    goWriter.appendTurn(original.contextId, 'assistant', 'Response 1');

    // Fork from turn 1
    const forked = goWriter.forkContext(turn1.turnId);

    // Verify forked context head points to turn 1
    expect(forked.headTurnId).toBe(turn1.turnId);
    expect(forked.headDepth).toBe(turn1.depth);
  });

  test('appending to forked context creates separate branch', async ({
    goWriter,
    serverHttpUrl,
    registry,
  }) => {
    // Register type bundle for typed projection
    await registry.putBundle('test-bundle-v1');

    // Create original context
    const original = goWriter.createContext();
    const turn1 = goWriter.appendTurn(original.contextId, 'user', 'Original message');

    // Fork from turn 1
    const forked = goWriter.forkContext(turn1.turnId);

    // Append to original
    const originalTurn2 = goWriter.appendTurn(
      original.contextId,
      'assistant',
      'Original response'
    );

    // Append to forked
    const forkedTurn2 = goWriter.appendTurn(
      forked.contextId,
      'assistant',
      'Forked response'
    );

    // Both turns should have different turn IDs
    expect(originalTurn2.turnId).not.toBe(forkedTurn2.turnId);

    // Both should have same depth (relative to their parent)
    expect(originalTurn2.depth).toBe(forkedTurn2.depth);

    // Verify via HTTP API that they have different content
    const originalResponse = await fetch(
      `${serverHttpUrl}/v1/contexts/${original.contextId}/turns?view=typed&limit=10`
    );
    const originalData = await originalResponse.json();

    const forkedResponse = await fetch(
      `${serverHttpUrl}/v1/contexts/${forked.contextId}/turns?view=typed&limit=10`
    );
    const forkedData = await forkedResponse.json();

    // Original should have 2 turns
    expect(originalData.turns.length).toBe(2);

    // Forked should also have 2 turns (turn1 + forkedTurn2)
    expect(forkedData.turns.length).toBe(2);

    // Find the second turns in each context
    const originalSecond = originalData.turns.find(
      (t: { turn_id: string }) => parseInt(t.turn_id) === originalTurn2.turnId
    );
    const forkedSecond = forkedData.turns.find(
      (t: { turn_id: string }) => parseInt(t.turn_id) === forkedTurn2.turnId
    );

    // Verify they exist and have different content
    expect(originalSecond).toBeDefined();
    expect(forkedSecond).toBeDefined();

    // Content should be different (either in data.text or as numeric keys)
    const originalText = originalSecond?.data?.text || originalSecond?.data?.['2'];
    const forkedText = forkedSecond?.data?.text || forkedSecond?.data?.['2'];
    expect(originalText).not.toBe(forkedText);
  });

  test('forked context shows correct turn count in frontend', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    await registry.putBundle('test-bundle-v1');

    // Create original context with 3 turns
    const original = goWriter.createContext();
    const turn1 = goWriter.appendTurn(original.contextId, 'user', 'Message 1');
    goWriter.appendTurn(original.contextId, 'assistant', 'Response 1');
    goWriter.appendTurn(original.contextId, 'user', 'Message 2');

    // Fork from turn 1 (should only include turn 1)
    const forked = goWriter.forkContext(turn1.turnId);

    // Add one turn to forked
    goWriter.appendTurn(forked.contextId, 'assistant', 'Forked response');

    // Open forked context in frontend
    await apiPage.goto('/');
    await addContext(apiPage, forked.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Forked context should show 2 turns (turn1 + forked response)
    await expectTurnCount(apiPage, 2);
  });

  test('original context is unchanged after fork', async ({
    apiPage,
    goWriter,
    registry,
  }) => {
    await registry.putBundle('test-bundle-v1');

    // Create original context
    const original = goWriter.createContext();
    goWriter.appendTurn(original.contextId, 'user', 'Message 1');
    goWriter.appendTurn(original.contextId, 'assistant', 'Response 1');
    const turn3 = goWriter.appendTurn(original.contextId, 'user', 'Message 2');

    // Fork from turn 2
    goWriter.forkContext(turn3.turnId);

    // Open original context in frontend
    await apiPage.goto('/');
    await addContext(apiPage, original.contextId);
    await waitForDebugger(apiPage);
    await waitForDebuggerLoaded(apiPage);

    // Original should still have 3 turns
    await expectTurnCount(apiPage, 3);
  });

  test('multiple forks from same turn create separate branches', async ({ goWriter }) => {
    // Create original context
    const original = goWriter.createContext();
    const turn1 = goWriter.appendTurn(original.contextId, 'user', 'Base message');

    // Create multiple forks from the same turn
    const fork1 = goWriter.forkContext(turn1.turnId);
    const fork2 = goWriter.forkContext(turn1.turnId);
    const fork3 = goWriter.forkContext(turn1.turnId);

    // All forks should have unique context IDs
    const ids = [fork1.contextId, fork2.contextId, fork3.contextId];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    // All forks should point to the same turn
    expect(fork1.headTurnId).toBe(turn1.turnId);
    expect(fork2.headTurnId).toBe(turn1.turnId);
    expect(fork3.headTurnId).toBe(turn1.turnId);
  });
});
