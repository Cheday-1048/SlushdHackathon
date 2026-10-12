import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:8000';
const goal = 'Increase my operating profit by 20% without increasing advertising costs.';

test('missing server credentials leave manual optimization available and retain the message', async ({ page }) => {
  await page.goto('/ai-assistant');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByLabel('Your business goal', { exact: true }).fill(goal);
  const pending = page.waitForResponse(`${api}/api/assistant/chat`);
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe('assistant_not_configured');
  await expect(page.getByRole('alert')).toContainText('Set OPENAI_API_KEY on the backend');
  await expect(page.getByLabel('Your business goal', { exact: true })).toHaveValue(goal);
  await expect(page.getByRole('region', { name: 'AI assistant response', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Goal Optimizer', exact: true }).click();
  const optimization = page.waitForResponse(`${api}/api/optimization/goal`);
  await page.getByRole('button', { name: 'Find Strategies', exact: true }).click();
  expect((await optimization).ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Recommended strategies', exact: true })).toBeVisible();
});

test('provider-stubbed assistant displays real calculated results and transfers exact strategy to the real Arena', async ({ page, request }) => {
  // Only the assistant envelope is replaced. Both calculation and subsequent
  // comparison below use the real FastAPI/PostgreSQL services; no paid API call.
  const optimized = await request.post(`${api}/api/optimization/goal`, { data: {
    start_date: '2026-09-01', end_date: '2026-09-30', target_profit_increase_pct: '20',
    constraints: { min_selling_price_change_pct: '0', max_selling_price_change_pct: '10', max_discount_pct: '10', max_advertising_increase_amount: '0', max_additional_operating_expense_amount: '0', minimum_operating_profit_margin_pct: null },
    behavioral_assumptions: { conversion_mode: 'historical', expected_conversion_rate: null, visitor_change_pct: '0', unit_cost_change_pct: '0' },
  } });
  expect(optimized.ok()).toBeTruthy();
  const result = await optimized.json();
  expect(result.status).toBe('feasible');
  await page.route('**/api/assistant/chat', async route => {
    expect(route.request().postDataJSON()).toEqual({ message: goal, start_date: '2026-09-01', end_date: '2026-09-30' });
    await route.fulfill({ json: { message: 'These calculated strategies are hypothetical and rely on the applied assumptions.', metrics: result.baseline, optimization: result, tools_used: ['get_store_metrics', 'run_goal_optimization'] } });
  });
  await page.goto('/ai-assistant');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByLabel('Your business goal', { exact: true }).fill(goal);
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calculated hypothetical strategies', exact: true })).toBeVisible();
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: result.currency });
  await expect(page.getByRole('article', { name: 'Assistant strategy 1', exact: true })).toContainText(money.format(Number(result.recommendations[0].simulated.operating_profit)));
  await page.screenshot({ path: 'test-results/assistant-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/assistant-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Send to A/B Arena', exact: true }).first().click();
  const editor = page.getByRole('group', { name: 'Scenario 2 editor', exact: true });
  await expect(editor.getByLabel('Selling price change (%)', { exact: true })).toHaveValue(result.recommendations[0].parameters.selling_price_change_pct);
  const comparison = page.waitForResponse(`${api}/api/simulations/compare`);
  await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
  const response = await comparison;
  expect(response.ok()).toBeTruthy();
  const compared = await response.json();
  expect(compared.scenarios[1].parameters).toEqual(result.recommendations[0].parameters);
  expect(compared.scenarios[1].simulated).toEqual(result.recommendations[0].simulated);
  expect(compared.baseline).toEqual(result.baseline);
});
