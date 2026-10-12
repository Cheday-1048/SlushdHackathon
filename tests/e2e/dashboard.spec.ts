import { expect, test } from '@playwright/test';

test('production dashboard displays the real PostgreSQL financial summary', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/finance/summary');
  expect(response.ok()).toBeTruthy();
  const summary = await response.json();
  expect(summary.data_source.type).toBe('database_demo');
  expect(summary.data_source.description).toMatch(/synthetic/i);
  expect(Number(summary.total_expenses)).toBeCloseTo(Number(summary.operating_expenses) + Number(summary.advertising_expenditure), 2);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: summary.currency });
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toContainText(currency.format(Number(summary.revenue)));
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await expect(page.getByRole('article', { name: 'Gross profit', exact: true })).toContainText(currency.format(Number(summary.gross_profit)));
  await expect(page.getByRole('article', { name: 'Operating profit', exact: true })).toContainText(currency.format(Number(summary.operating_profit)));
  await expect(page.getByRole('article', { name: 'Operating expenses', exact: true })).toContainText(currency.format(Number(summary.operating_expenses)));
  await expect(page.getByRole('article', { name: 'Operating margin', exact: true })).toContainText(`${Number(summary.operating_profit_margin)}%`);
  await expect(page.getByRole('article', { name: 'Conversion rate', exact: true })).toContainText(`${Number(summary.conversion_rate)}%`);
  await expect(page.getByText(summary.data_source.description)).toBeVisible();
  await expect(page.getByText('Database demo', { exact: true })).toBeVisible();
  const details = page.getByRole('region', { name: 'Report details' });
  await expect(details.locator('dl > div').filter({ has: page.getByText('Total orders', { exact: true }) })).toContainText(summary.order_count.toLocaleString('en-US'));
  await expect(details.locator('dl > div').filter({ has: page.getByText('Total visitors', { exact: true }) })).toContainText(summary.visitors.toLocaleString('en-US'));
  await expect(details.locator('dl > div').filter({ has: page.getByText('Total expenses', { exact: true }) })).toContainText(currency.format(Number(summary.total_expenses)));
  await expect(details.locator('dl > div').filter({ has: page.getByText('Advertising expenditure', { exact: true }) })).toContainText(currency.format(Number(summary.advertising_expenditure)));
  await expect(page.getByText('No activity in this reporting period.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toContainText(currency.format(Number(summary.revenue)));
});

test('shows loading until a real request completes', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/analytics/dashboard', async (route) => { await gate; await route.continue(); });
  await page.goto('/dashboard');
  await expect(page.getByText('Loading dashboard from the API…')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
});

test('disconnection shows an error and retry recovers with the real backend', async ({ page }) => {
  await page.route('http://127.0.0.1:8000/**', (route) => route.abort('connectionrefused'));
  await page.goto('/dashboard');
  await expect(page.getByText('API disconnected', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard unavailable' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toHaveCount(0);
  await page.unroute('http://127.0.0.1:8000/**');
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
});

test('a healthy API does not mask database unavailability', async ({ page }) => {
  await page.route('**/api/analytics/dashboard', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'database_unavailable', message: 'The database is unavailable. Please retry.' }) }));
  await page.goto('/dashboard');
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  await expect(page.getByText('The database is unavailable. Please retry.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toHaveCount(0);
});

test('incomplete financial data warns clearly and never renders unknown profit as zero', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/analytics/dashboard');
  expect(response.ok()).toBeTruthy();
  const analytics = await response.json();
  const summary = analytics.summary;
  const incomplete = {
    ...analytics,
    summary: { ...summary,
    revenue: null,
    gross_profit: null,
    operating_profit: null,
    gross_profit_margin: null,
    contribution_margin: null,
    operating_profit_margin: null,
    average_order_value: null,
    data_completeness: { ...summary.data_completeness, is_complete: false, missing_vat_lines: 1, warnings: ['A historical transaction has unknown VAT semantics.'] },
    },
  };
  await page.route('**/api/analytics/dashboard', (route) => route.fulfill({ json: incomplete }));
  await page.goto('/dashboard');
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('Financial data is incomplete');
  await expect(warning).toContainText('A historical transaction has unknown VAT semantics.');
  for (const name of ['Revenue', 'Gross profit', 'Operating profit', 'Operating margin']) {
    await expect(page.getByRole('article', { name, exact: true }).locator('.kpi-value')).toHaveText('Unavailable');
  }
  await expect(page.getByText('No activity in this reporting period.')).toHaveCount(0);
});

test('a real single-day loss retains its negative profit and margin', async ({ page, request }) => {
  const defaultResponse = await request.get('http://127.0.0.1:8000/api/finance/summary');
  expect(defaultResponse.ok()).toBeTruthy();
  const defaultSummary = await defaultResponse.json();
  // The seeded period records monthly rent on its first day.
  const day = defaultSummary.reporting_period.start;
  const response = await request.get(`http://127.0.0.1:8000/api/finance/summary?start_date=${day}&end_date=${day}`);
  expect(response.ok()).toBeTruthy();
  const summary = await response.json();
  expect(Number(summary.operating_profit)).toBeLessThan(0);
  expect(Number(summary.operating_profit_margin)).toBeLessThan(0);
  await page.route('**/api/analytics/dashboard', (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('start_date', day);
    url.searchParams.set('end_date', day);
    return route.continue({ url: url.toString() });
  });
  await page.goto('/dashboard');
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: summary.currency });
  await expect(page.getByRole('article', { name: 'Operating profit', exact: true })).toContainText(currency.format(Number(summary.operating_profit)));
  await expect(page.getByRole('article', { name: 'Operating margin', exact: true })).toContainText(`${new Intl.NumberFormat('en-US').format(Number(summary.operating_profit_margin))}%`);
});

test('the Phase 02 dashboard API remains backwards compatible', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/dashboard/summary');
  expect(response.ok()).toBeTruthy();
  const summary = await response.json();
  expect(summary.data_source.type).toBe('database_demo');
  expect(summary.total_orders).toBeGreaterThan(0);
  expect(summary.total_visitors).toBeGreaterThan(summary.total_orders);
  expect(summary.revenue).toMatch(/^\d+(?:\.\d{1,2})?$/);
  expect(Number(summary.total_expenses)).toBeCloseTo(Number(summary.operating_expenses) + Number(summary.advertising_expenditure), 2);
});

test('an actual empty database reporting period shows zero metrics and metadata', async ({ page, request }) => {
  const start = '2099-01-01';
  const end = '2099-01-30';
  const response = await request.get(`http://127.0.0.1:8000/api/finance/summary?start_date=${start}&end_date=${end}`);
  expect(response.ok()).toBeTruthy();
  const summary = await response.json();
  expect(summary.order_count).toBe(0);
  expect(summary.visitors).toBe(0);
  expect(Number(summary.revenue)).toBe(0);
  expect(Number(summary.total_expenses)).toBe(0);
  await page.route('**/api/analytics/dashboard', (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    return route.continue({ url: url.toString() });
  });
  await page.goto('/dashboard');
  await expect(page.getByText('No activity in this reporting period.')).toBeVisible();
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: summary.currency });
  for (const metric of ['Revenue', 'Gross profit', 'Operating profit', 'Operating expenses']) await expect(page.getByRole('article', { name: metric, exact: true })).toContainText(currency.format(0));
  await expect(page.getByRole('article', { name: 'Operating margin', exact: true }).locator('.kpi-value')).toHaveText('Unavailable');
  await expect(page.getByRole('article', { name: 'Conversion rate', exact: true }).locator('.kpi-value')).toHaveText(summary.conversion_rate === null ? 'Unavailable' : `${Number(summary.conversion_rate)}%`);
  await expect(page.getByText('Database demo', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Report details' })).toContainText(`${start} to ${end}`);
});

test('product and expense endpoints expose persisted demo store records', async ({ request }) => {
  const productResponse = await request.get('http://127.0.0.1:8000/api/products');
  expect(productResponse.ok()).toBeTruthy();
  const products = await productResponse.json();
  expect(products.data_source.type).toBe('database_demo');
  expect(products.data_source.description).toMatch(/synthetic/i);
  expect(products.total).toBeGreaterThanOrEqual(10);
  expect(products.total).toBeLessThanOrEqual(15);
  expect(products.items.length).toBeGreaterThan(0);
  for (const product of products.items) {
    expect(product.store_id).toBe(products.store_id);
    expect(product.sku).toEqual(expect.any(String));
    expect(product.selling_price).toMatch(/^\d+(?:\.\d{1,2})?$/);
    expect(product.unit_cost).toMatch(/^\d+(?:\.\d{1,2})?$/);
  }
  const expenseResponse = await request.get('http://127.0.0.1:8000/api/expenses');
  expect(expenseResponse.ok()).toBeTruthy();
  const expenses = await expenseResponse.json();
  expect(expenses.store_id).toBe(products.store_id);
  expect(expenses.data_source.type).toBe('database_demo');
  expect(expenses.total).toBeGreaterThan(0);
  expect(expenses.items.length).toBeGreaterThan(0);
  for (const expense of expenses.items) {
    expect(expense.store_id).toBe(expenses.store_id);
    expect(expense.amount).toMatch(/^\d+(?:\.\d{1,2})?$/);
    expect(expense.expense_date >= expenses.reporting_period.start).toBeTruthy();
    expect(expense.expense_date <= expenses.reporting_period.end).toBeTruthy();
    expect(expense.included_in_operating_expenses).toBe(expense.category !== 'advertising');
  }
});

test('future modules remain disabled and unknown routes have a return path', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Simulation Lab', exact: true })).toHaveAttribute('href', '/simulation-lab');
  await expect(page.getByRole('link', { name: 'AI Assistant', exact: true })).toHaveAttribute('href', '/ai-assistant');
  await expect(page.getByRole('button', { name: 'A/B Testing Planned' })).toBeDisabled();
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
});

test('dashboard remains usable at a mobile browser width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
});

for (const days of [7, 30, 90]) {
  test(`last ${days} days updates the complete dashboard from the store-local period`, async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
    const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/analytics/dashboard?preset=last_${days}_days`));
    await page.getByRole('combobox', { name: 'Reporting period', exact: true }).selectOption(`last_${days}_days`);
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.daily).toHaveLength(days);
    expect(data.summary.reporting_period.end).toBe(data.as_of_date);
    await expect(page.getByRole('region', { name: 'Report details' })).toContainText(`${data.summary.reporting_period.start} to ${data.summary.reporting_period.end}`);
    const amount = data.summary.revenue === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: data.summary.currency }).format(Number(data.summary.revenue));
    await expect(page.getByRole('article', { name: 'Revenue', exact: true }).locator('.kpi-value')).toHaveText(amount);
    await expect(page.getByText('Store timezone:', { exact: false })).toContainText(data.store_timezone);
  });
}

test('custom dates update revenue, historical product rows, expenses and daily charts together', async ({ page, request }) => {
  const start = '2026-09-10';
  const end = '2026-09-16';
  const expectedResponse = await request.get(`http://127.0.0.1:8000/api/analytics/dashboard?start_date=${start}&end_date=${end}`);
  expect(expectedResponse.ok()).toBeTruthy();
  const data = await expectedResponse.json();
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Reporting period', exact: true }).selectOption('custom');
  await page.getByLabel('Start date', { exact: true }).fill(start);
  await page.getByLabel('End date', { exact: true }).fill(end);
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Report details' })).toContainText(`${start} to ${end}`);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.summary.currency });
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toContainText(currency.format(Number(data.summary.revenue)));
  const productTable = page.getByRole('table', { name: 'Product analytics' });
  await expect(productTable.locator('tbody tr')).toHaveCount(data.products.length);
  const product = data.products[0];
  const productRow = productTable.getByRole('row').filter({ hasText: product.sku });
  await expect(productRow).toContainText(product.name);
  await expect(productRow).toContainText(currency.format(Number(product.revenue)));
  await expect(productRow).toContainText(currency.format(Number(product.cogs)));
  const expenses = page.getByRole('table', { name: 'Expense overview' });
  await expect(expenses.locator('tbody tr')).toHaveCount(data.expenses.length);
  for (const expense of data.expenses) await expect(expenses.getByRole('row').filter({ hasText: expense.label })).toContainText(currency.format(Number(expense.amount)));
});

test('invalid custom dates preserve the active report and give a clear validation error', async ({ page }) => {
  await page.goto('/dashboard');
  const revenue = page.getByRole('article', { name: 'Revenue', exact: true }).locator('.kpi-value');
  await expect(revenue).toBeVisible();
  const before = await revenue.textContent();
  await page.getByRole('combobox', { name: 'Reporting period', exact: true }).selectOption('custom');
  await page.getByLabel('Start date', { exact: true }).fill('2026-09-30');
  await page.getByLabel('End date', { exact: true }).fill('2026-09-01');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/end|start|range/i);
  await expect(revenue).toHaveText(before!);
});

test('analytics navigation opens the functional chart section', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page).toHaveURL(/#analytics$/);
  for (const name of ['Daily revenue trend', 'Daily order trend', 'Visitors and conversion rate', 'Revenue versus operating expenses', 'Product sales performance', 'Expense breakdown']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});

test('isolated known revenue and conversion remain visible between missing days', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/analytics/dashboard');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  data.daily = data.daily.map((day: typeof data.daily[number], index: number) => index === 3 ? day : {
    ...day, revenue: null, visitors: null, conversion_rate: null,
    data_completeness: { ...day.data_completeness, is_complete: false, warnings: ['Historical measurements are missing.'] },
  });
  data.summary.data_completeness = { ...data.summary.data_completeness, is_complete: false, warnings: ['Historical measurements are missing.'] };
  await page.route('**/api/analytics/dashboard', (route) => route.fulfill({ json: data }));
  await page.goto('/dashboard');
  await expect(page.getByRole('article', { name: 'Revenue', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Daily revenue trend', exact: true }).locator('.recharts-line-dot')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Visitors and conversion rate', exact: true }).locator('.recharts-line-dot')).toHaveCount(1);
  await page.getByText('Daily analytics data', { exact: true }).click();
  const table = page.getByRole('table', { name: 'Daily analytics data' });
  await expect(table.locator('tbody tr').first()).toContainText('Unavailable');
  await expect(table.locator('tbody tr').nth(3)).toContainText(`${Number(data.daily[3].conversion_rate)}%`);
});
