import { expect, test } from '@playwright/test';

const optimizeUrl = 'http://127.0.0.1:8000/api/optimization/goal';
const compareUrl = 'http://127.0.0.1:8000/api/simulations/compare';

test('finds feasible strategies from a real baseline and transfers exact parameters into the Arena', async ({ page, request }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Goal Optimizer', exact: true }).click();
  const responsePromise = page.waitForResponse(optimizeUrl);
  await page.getByRole('button', { name: 'Find Strategies', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.status).toBe('feasible');
  expect(result.candidates_evaluated).toBeGreaterThan(0);
  expect(result.candidates_evaluated).toBeLessThanOrEqual(625);
  expect(result.recommendations.length).toBeGreaterThan(0);
  expect(result.recommendations.length).toBeLessThanOrEqual(3);
  expect(result.feasible_candidate_count).toBeGreaterThanOrEqual(result.recommendations.length);
  const strategies = result.recommendations;
  for (let index = 0; index < strategies.length; index += 1) {
    expect(Number(strategies[index].simulated.operating_profit)).toBeGreaterThanOrEqual(Number(result.target_operating_profit));
    expect(strategies[index].parameters.expected_conversion_rate).toBeNull();
    if (index) expect(Number(strategies[index - 1].simulated.operating_profit)).toBeGreaterThanOrEqual(Number(strategies[index].simulated.operating_profit));
  }
  const results = page.getByRole('region', { name: 'Goal optimization results', exact: true });
  await expect(page.getByRole('heading', { name: 'Recommended strategies', exact: true })).toBeVisible();
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: result.currency });
  await expect(results).toContainText(currency.format(Number(strategies[0].simulated.operating_profit)));
  await page.screenshot({ path: 'test-results/optimizer-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Send to A/B Arena', exact: true }).first().click();
  const editor = page.getByRole('group', { name: 'Scenario 2 editor', exact: true });
  await expect(editor.getByLabel('Selling price change (%)', { exact: true })).toHaveValue(strategies[0].parameters.selling_price_change_pct);
  await expect(editor.getByLabel('Additional discount (%)', { exact: true })).toHaveValue(strategies[0].parameters.discount_pct);
  const comparisonPromise = page.waitForResponse(compareUrl);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  const comparisonResponse = await comparisonPromise;
  expect(comparisonResponse.ok()).toBeTruthy();
  const comparison = await comparisonResponse.json();
  expect(comparison.baseline).toEqual(result.baseline);
  expect(comparison.scenarios[1].parameters).toEqual(strategies[0].parameters);
  expect(comparison.scenarios[1].simulated).toEqual(strategies[0].simulated);
  expect(comparison.scenarios[0].simulated.operating_profit).toBe(result.baseline.operating_profit);
  await expect(page.getByRole('heading', { name: 'Shared-baseline comparison', exact: true })).toBeVisible();
  const after = await request.get(`http://127.0.0.1:8000/api/finance/summary?start_date=${result.reporting_period.start}&end_date=${result.reporting_period.end}`);
  expect(await after.json()).toEqual(result.baseline);
});

test('an impossible goal produces an explicit explanation and editing clears stale results', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Goal Optimizer', exact: true }).click();
  await page.getByLabel('Target operating profit increase (%)', { exact: true }).fill('10000');
  await page.getByLabel('Maximum selling price change (%)', { exact: true }).fill('0');
  await page.getByLabel('Maximum discount (%)', { exact: true }).fill('0');
  const responsePromise = page.waitForResponse(optimizeUrl);
  await page.getByRole('button', { name: 'Find Strategies', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.status).toBe('target_not_achievable');
  expect(result.feasible_candidate_count).toBe(0);
  expect(result.recommendations).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Target not achievable under current assumptions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to A/B Arena', exact: true })).toHaveCount(0);
  await page.getByLabel('Target operating profit increase (%)', { exact: true }).fill('10');
  await expect(page.getByRole('region', { name: 'Goal optimization results', exact: true })).toHaveCount(0);
});

test('explicit behavioral assumptions remain fixed across recommendations on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Goal Optimizer', exact: true }).click();
  await page.getByLabel('Conversion assumption', { exact: true }).selectOption('explicit');
  await page.getByLabel('Assumed conversion rate (%)', { exact: true }).fill('4');
  await page.getByLabel('Assumed visitor change (%)', { exact: true }).fill('10');
  await page.getByLabel('Assumed unit cost change (%)', { exact: true }).fill('5');
  const responsePromise = page.waitForResponse(optimizeUrl);
  await page.getByRole('button', { name: 'Find Strategies', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.status).toBe('feasible');
  for (const strategy of result.recommendations) {
    expect(Number(strategy.parameters.expected_conversion_rate)).toBe(4);
    expect(Number(strategy.parameters.visitor_change_pct)).toBe(10);
    expect(Number(strategy.parameters.unit_cost_change_pct)).toBe(5);
  }
  await expect(page.getByRole('heading', { name: 'Recommended strategies', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/optimizer-mobile.png', fullPage: true });
});
