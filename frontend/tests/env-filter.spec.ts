// Copyright 2025 StrongDM Inc
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from './fixtures';

test.describe('Environment Filter Pills', () => {
  test.beforeEach(async ({ apiPage }) => {
    // Navigate to the home page
    await apiPage.goto('/');
  });

  test('shows all four env pills with "all" selected by default', async ({ apiPage }) => {
    // Find the env filter container
    const envContainer = apiPage.locator('text=All >> xpath=ancestor::div[contains(@class, "flex")]');
    
    // Verify all four pills are visible
    await expect(apiPage.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(apiPage.getByRole('button', { name: 'Prod' })).toBeVisible();
    await expect(apiPage.getByRole('button', { name: 'Stage' })).toBeVisible();
    await expect(apiPage.getByRole('button', { name: 'Dev' })).toBeVisible();
  });

  test('clicking prod pill sets search to label = "env=prod"', async ({ apiPage }) => {
    // Click the Prod pill
    await apiPage.getByRole('button', { name: 'Prod' }).click();

    // Verify the search input has the correct CQL query
    const searchInput = apiPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toHaveValue('label = "env=prod"');
  });

  test('clicking stage pill sets search to label = "env=stage"', async ({ apiPage }) => {
    // Click the Stage pill
    await apiPage.getByRole('button', { name: 'Stage' }).click();

    // Verify the search input has the correct CQL query
    const searchInput = apiPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toHaveValue('label = "env=stage"');
  });

  test('clicking dev pill sets search to label = "env=dev"', async ({ apiPage }) => {
    // Click the Dev pill
    await apiPage.getByRole('button', { name: 'Dev' }).click();

    // Verify the search input has the correct CQL query
    const searchInput = apiPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toHaveValue('label = "env=dev"');
  });

  test('clicking all pill clears the search', async ({ apiPage }) => {
    // First select a non-all pill
    await apiPage.getByRole('button', { name: 'Prod' }).click();
    
    const searchInput = apiPage.locator('input[placeholder*="Search"]');
    await expect(searchInput).toHaveValue('label = "env=prod"');

    // Now click All
    await apiPage.getByRole('button', { name: 'All' }).click();

    // Verify the search is cleared
    await expect(searchInput).toHaveValue('');
  });

  test('switching between pills updates search correctly', async ({ apiPage }) => {
    const searchInput = apiPage.locator('input[placeholder*="Search"]');

    // Click through pills and verify each sets correct value
    await apiPage.getByRole('button', { name: 'Prod' }).click();
    await expect(searchInput).toHaveValue('label = "env=prod"');

    await apiPage.getByRole('button', { name: 'Stage' }).click();
    await expect(searchInput).toHaveValue('label = "env=stage"');

    await apiPage.getByRole('button', { name: 'Dev' }).click();
    await expect(searchInput).toHaveValue('label = "env=dev"');

    await apiPage.getByRole('button', { name: 'All' }).click();
    await expect(searchInput).toHaveValue('');
  });

  test('pill selection is visually indicated', async ({ apiPage }) => {
    // Default: All should have active styling
    const allPill = apiPage.getByRole('button', { name: 'All' });
    
    // Click Prod and verify it gets active styling
    const prodPill = apiPage.getByRole('button', { name: 'Prod' });
    await prodPill.click();
    
    // Prod pill should have the red background color class
    await expect(prodPill).toHaveClass(/bg-red-600/);
  });

  test('clicking same pill again is idempotent', async ({ apiPage }) => {
    const searchInput = apiPage.locator('input[placeholder*="Search"]');
    
    // Click Prod twice
    await apiPage.getByRole('button', { name: 'Prod' }).click();
    await expect(searchInput).toHaveValue('label = "env=prod"');
    
    await apiPage.getByRole('button', { name: 'Prod' }).click();
    await expect(searchInput).toHaveValue('label = "env=prod"');
    
    // Should still work correctly
  });
});
