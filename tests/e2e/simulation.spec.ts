import { expect, test } from '@playwright/test';

const previewUrl = 'http://127.0.0.1:8000/api/simulations/preview';

test('unchanged simulation reconciles with the real financial report through the browser', async ({ page, request }) => {
  const finance = await request.get('http://127.0.0.1:8000/api/finance/summary');
  expect(finance.ok()).toBeTruthy();
  const baseline = await finance.json();
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Simulation Lab', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Simulation Lab', exact: true })).toBeVisible();
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: baseline.currency });
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toContainText(currency.format(Number(baseline.revenue)));
  await expect(page.getByLabel('Expected conversion rate (%)', { exact: true })).toHaveValue('');
  const responsePromise = page.waitForResponse(previewUrl);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.status).toBe('ready');
  expect(result.baseline).toEqual(baseline);
  expect(Number(result.simulated.expected_orders)).toBe(baseline.order_count);
  for (const metric of ['revenue', 'cogs', 'operating_expenses', 'advertising_expenditure', 'gross_profit', 'operating_profit', 'gross_profit_margin', 'operating_profit_margin']) {
    expect(result.simulated[metric]).toBe(baseline[metric]);
  }
  expect(Number(result.differences.operating_profit)).toBe(0);
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toBeVisible();
  const comparison = page.getByRole('table', { name: 'Historical and hypothetical comparison', exact: true });
  await expect(comparison).toContainText(currency.format(Number(baseline.revenue)));
  await expect(comparison).toContainText(currency.format(Number(baseline.operating_profit)));
  await page.screenshot({ path: 'test-results/simulation-identity-desktop.png', fullPage: true });
});

test('all scenario controls reach the real API and display fractional expected orders and a loss', async ({ page, request }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  const controls = [
    ['Selling price change (%)', '10'],
    ['Additional discount (%)', '20'],
    ['Expected conversion rate (%)', '4'],
    ['Visitor count change (%)', '10'],
    ['Product unit cost change (%)', '5'],
    ['Advertising budget change', '100'],
    ['Additional operating expense', '50000'],
  ];
  for (const [label, value] of controls) await page.getByLabel(label, { exact: true }).fill(value);
  const responsePromise = page.waitForResponse(previewUrl);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(response.request().postDataJSON().parameters).toEqual({
    selling_price_change_pct: '10', discount_pct: '20', expected_conversion_rate: '4',
    visitor_change_pct: '10', unit_cost_change_pct: '5',
    advertising_budget_change_amount: '100', additional_operating_expense_amount: '50000',
  });
  // Independent volume calculation, not the rounded historical conversion rate.
  expect(Number(result.simulated.expected_orders)).toBeCloseTo(result.baseline.visitors * 1.1 * 0.04, 6);
  expect(Number(result.simulated.expected_orders) % 1).not.toBe(0);
  expect(Number(result.simulated.operating_profit)).toBeLessThan(0);
  expect(result.simulated.conversion_rate_source).toBe('user_assumption');
  const table = page.getByRole('table', { name: 'Historical and hypothetical comparison', exact: true });
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: result.currency });
  await expect(table).toContainText(currency.format(Number(result.simulated.revenue)));
  await expect(table).toContainText(currency.format(Number(result.simulated.operating_profit)));
  await expect(page.getByRole('region', { name: 'Simulation results', exact: true })).toContainText(/operating loss/i);
  const after = await request.get(`http://127.0.0.1:8000/api/finance/summary?start_date=${result.reporting_period.start}&end_date=${result.reporting_period.end}`);
  expect(await after.json()).toEqual(result.baseline);
  await page.screenshot({ path: 'test-results/simulation-scenario-desktop.png', fullPage: true });
});

test('a custom period with no observed basket exposes warnings instead of invented projections', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByLabel('Baseline start date', { exact: true }).fill('2099-01-01');
  await page.getByLabel('Baseline end date', { exact: true }).fill('2099-01-30');
  const baselinePromise = page.waitForResponse((response) => response.url().includes('/api/finance/summary?start_date=2099-01-01'));
  await page.getByRole('button', { name: 'Load baseline', exact: true }).click();
  expect((await baselinePromise).ok()).toBeTruthy();
  await expect(page.getByRole('article', { name: 'Baseline orders', exact: true })).toContainText('0');
  const responsePromise = page.waitForResponse(previewUrl);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.status).toBe('unavailable');
  expect(result.simulated).toBeNull();
  expect(result.differences).toBeNull();
  await expect(page.getByText('Simulation unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Historical and hypothetical comparison', exact: true })).toHaveCount(0);
});

test('negative resulting advertising budget gives a backend validation error and can be corrected', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByLabel('Advertising budget change', { exact: true }).fill('-99999');
  const invalid = page.waitForResponse(previewUrl);
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  expect((await invalid).status()).toBe(422);
  await expect(page.getByText(/Advertising budget change cannot make/)).toBeVisible();
  await page.getByLabel('Advertising budget change', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hypothetical results', exact: true })).toBeVisible();
});

test('simulation remains usable at mobile width after displaying real results', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/simulation-lab');
  await expect(page.getByRole('article', { name: 'Baseline revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hypothetical results', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/simulation-mobile.png', fullPage: true });
});
