import { expect, test } from '@playwright/test';

const compareUrl = 'http://127.0.0.1:8000/api/simulations/compare';

test('two strategies compare against one real baseline and allow manual evaluation', async ({ page, request }) => {
  const finance = await request.get('http://127.0.0.1:8000/api/finance/summary');
  expect(finance.ok()).toBeTruthy();
  const baseline = await finance.json();
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A/B Arena', exact: true }).click();
  const first = page.getByRole('group', { name: 'Scenario 1 editor', exact: true });
  const second = page.getByRole('group', { name: 'Scenario 2 editor', exact: true });
  await first.getByLabel('Scenario name', { exact: true }).fill('Keep current strategy');
  await second.getByLabel('Scenario name', { exact: true }).fill('Discount with extra overhead');
  await second.getByLabel('Additional discount (%)', { exact: true }).fill('10');
  await second.getByLabel('Expected conversion rate (%)', { exact: true }).fill('4');
  await second.getByLabel('Additional operating expense', { exact: true }).fill('50000');
  const responsePromise = page.waitForResponse(compareUrl);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.baseline).toEqual(baseline);
  expect(result.snapshot_id).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(result.scenarios).toHaveLength(2);
  expect(new Set(result.scenarios.map((scenario: { id: string }) => scenario.id)).size).toBe(2);
  expect(result.scenarios[0].simulated.operating_profit).toBe(baseline.operating_profit);
  expect(result.scenarios[0].differences.operating_profit).toBe('0.00');
  expect(Number(result.scenarios[1].simulated.revenue)).toBeGreaterThan(Number(baseline.revenue));
  expect(Number(result.scenarios[1].simulated.operating_profit)).toBeLessThan(0);
  const results = page.getByRole('region', { name: 'Scenario comparison results', exact: true });
  const table = page.getByRole('table', { name: 'Scenario financial comparison', exact: true });
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: result.currency });
  await expect(table).toContainText('Keep current strategy');
  await expect(table).toContainText('Discount with extra overhead');
  await expect(table).toContainText(currency.format(Number(result.scenarios[1].simulated.operating_profit)));
  await expect(results).toContainText(/operating loss/i);
  await page.getByRole('radio', { name: 'Select Keep current strategy', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Select Keep current strategy', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Exclude Discount with extra overhead from consideration', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Select Discount with extra overhead', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/comparison-desktop.png', fullPage: true });
  const after = await request.get('http://127.0.0.1:8000/api/finance/summary');
  expect(await after.json()).toEqual(baseline);
  // Editing invalidates the published result and lets the merchant reassess.
  await second.getByLabel('Additional operating expense', { exact: true }).fill('0');
  await expect(results).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shared-baseline comparison', exact: true })).toBeVisible();
});

test('four strategies support adding, duplication, removal and reset without losing the single-scenario workflow', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A/B Arena', exact: true }).click();
  const first = page.getByRole('group', { name: 'Scenario 1 editor', exact: true });
  await first.getByLabel('Selling price change (%)', { exact: true }).fill('5');
  await first.getByRole('button', { name: 'Duplicate scenario', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Scenario 3 editor', exact: true }).getByLabel('Selling price change (%)', { exact: true })).toHaveValue('5');
  await page.getByRole('button', { name: 'Add scenario', exact: true }).click();
  await expect(page.getByRole('group', { name: /Scenario \d editor/ })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Add scenario', exact: true })).toBeDisabled();
  const responsePromise = page.waitForResponse(compareUrl);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.scenarios).toHaveLength(4);
  expect(result.scenarios[0].simulated).toEqual(result.scenarios[2].simulated);
  expect(result.scenarios[0].differences).toEqual(result.scenarios[2].differences);
  expect(new Set(result.scenarios.map((scenario: { id: string }) => scenario.id)).size).toBe(4);
  await expect(page.getByRole('table', { name: 'Scenario financial comparison', exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Scenario 4 editor', exact: true }).getByRole('button', { name: 'Remove scenario', exact: true }).click();
  await expect(page.getByRole('group', { name: /Scenario \d editor/ })).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Scenario comparison results', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset comparison', exact: true }).click();
  await expect(page.getByRole('group', { name: /Scenario \d editor/ })).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Scenario 1 editor', exact: true }).getByLabel('Selling price change (%)', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Single scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hypothetical results', exact: true })).toBeVisible();
});

test('empty historical periods keep every arena result explicitly unavailable', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A/B Arena', exact: true }).click();
  await page.getByLabel('Baseline start date', { exact: true }).fill('2099-01-01');
  await page.getByLabel('Baseline end date', { exact: true }).fill('2099-01-30');
  await page.getByRole('button', { name: 'Load baseline', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Baseline orders', exact: true })).toContainText('0');
  const responsePromise = page.waitForResponse(compareUrl);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  for (const scenario of result.scenarios) {
    expect(scenario.status).toBe('unavailable');
    expect(scenario.simulated).toBeNull();
    expect(scenario.comparison).toBeNull();
  }
  await expect(page.getByRole('region', { name: 'Scenario comparison results', exact: true })).toContainText(/unavailable/i);
});

test('arena comparison fits mobile width and preserves an identical shared-baseline result', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A/B Arena', exact: true }).click();
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shared-baseline comparison', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/comparison-mobile.png', fullPage: true });
});
