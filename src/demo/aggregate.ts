import { analyticsDashboardSchema, type AnalyticsDashboard, type ReportingFilter } from '../api/schemas';
import dataset from './nova-commerce.json';

/*
 * Demo data adapter. The bundled dataset is the backend's own synthetic September 2026 store, exported from
 * the real seed and finance engine as additive per-day components (see nova-commerce.json).
 * Any reporting period is rebuilt here by summing those components and recomputing the ratios with the same
 * rules as the backend (exact two-decimal arithmetic, ROUND_HALF_UP). aggregate.test.ts compares the output
 * with real backend responses for several periods.
 */

interface DayRecord {
  date: string;
  revenue: string;
  cogs: string;
  orders: number;
  visitors: number;
  expenses: Record<string, string>;
  products: Partial<Record<string, { unitsSold: number; unitsReturned: number; revenue: string; cogs: string }>>;
}

export const business = dataset.business;
export const demoProducts = dataset.products;
const days = dataset.days as unknown as DayRecord[];
const dayByDate = new Map(days.map((day) => [day.date, day]));

const CATEGORIES = [
  ['employee_costs', 'Employee costs'], ['rent', 'Rent'], ['shipping', 'Shipping'],
  ['platform_fees', 'Platform fees'], ['other_operating', 'Other operating expenses'], ['advertising', 'Advertising'],
] as const;
const DAY_MS = 86_400_000;

const cents = (value: string) => BigInt(value.replace('.', ''));
function money(value: bigint) {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
/** Integer division rounding half away from zero (Python's ROUND_HALF_UP for Decimal). */
function divide(numerator: bigint, denominator: bigint) {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  if ((n % d) * 2n >= d) quotient += 1n;
  return negative ? -quotient : quotient;
}
/** a / b × 100 with two decimals. Works for money in cents and for plain counts alike. */
const percent = (a: bigint, b: bigint) => money(divide(a * 10_000n, b));
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const addDays = (date: string, offset: number) => new Date(toTime(date) + offset * DAY_MS).toISOString().slice(0, 10);

const completeness = (trafficDays: number, expected: number) => ({
  is_complete: trafficDays === expected,
  warnings: trafficDays === expected ? [] : [`Visitor data covers ${trafficDays} of ${expected} reporting days.`],
  missing_vat_lines: 0, missing_refund_orders: 0, missing_shipping_orders: 0, missing_restock_refunds: 0, missing_order_items: 0,
  traffic_days: trafficDays, expected_traffic_days: expected,
});

/** Reporting period for a filter. Presets end on the dataset's "today" because the data stops there. */
export function resolvePeriod(filter: ReportingFilter) {
  if (filter.preset === 'custom') return { start: filter.start_date, end: filter.end_date };
  if (filter.preset === 'demo') return { ...business.period };
  const length = Number(filter.preset.split('_')[1]);
  return { start: addDays(business.asOfDate, -(length - 1)), end: business.asOfDate };
}

export function buildDemoDashboard(filter: ReportingFilter): AnalyticsDashboard {
  const period = resolvePeriod(filter);
  const length = (toTime(period.end) - toTime(period.start)) / DAY_MS + 1;
  const dates = Array.from({ length }, (_, index) => addDays(period.start, index));
  const records = dates.map((date) => dayByDate.get(date));
  const present = records.filter((record): record is DayRecord => record !== undefined);

  const sum = (pick: (record: DayRecord) => string) => present.reduce((total, record) => total + cents(pick(record)), 0n);
  const category = (key: string) => sum((record) => record.expenses[key]);
  const revenue = sum((record) => record.revenue);
  const cogs = sum((record) => record.cogs);
  const grossProfit = revenue - cogs;
  const advertising = category('advertising');
  const operating = CATEGORIES.filter(([key]) => key !== 'advertising').reduce((total, [key]) => total + category(key), 0n);
  const operatingProfit = grossProfit - operating - advertising;
  const contribution = grossProfit - category('shipping') - category('platform_fees') - advertising;
  const orders = present.reduce((total, record) => total + record.orders, 0);
  const visitors = present.reduce((total, record) => total + record.visitors, 0);
  const trafficComplete = present.length === length;
  const positive = revenue > 0n;

  const conversion = (orderCount: number, visitorCount: number) => (visitorCount > 0 ? percent(BigInt(orderCount), BigInt(visitorCount)) : orderCount === 0 ? '0.00' : null);

  const daily = dates.map((date, index) => {
    const record = records[index];
    if (!record) {
      return { date, revenue: '0.00', order_count: 0, visitors: null, conversion_rate: null, operating_expenses: '0.00', advertising_expenditure: '0.00', total_expenses: '0.00', gross_profit: '0.00', operating_profit: '0.00', data_completeness: completeness(0, 1) };
    }
    const dayOperating = CATEGORIES.filter(([key]) => key !== 'advertising').reduce((total, [key]) => total + cents(record.expenses[key]), 0n);
    const dayAdvertising = cents(record.expenses.advertising);
    const dayGross = cents(record.revenue) - cents(record.cogs);
    return {
      date, revenue: record.revenue, order_count: record.orders, visitors: record.visitors, conversion_rate: conversion(record.orders, record.visitors),
      operating_expenses: money(dayOperating), advertising_expenditure: money(dayAdvertising), total_expenses: money(dayOperating + dayAdvertising),
      gross_profit: money(dayGross), operating_profit: money(dayGross - dayOperating - dayAdvertising), data_completeness: completeness(1, 1),
    };
  });

  const products = demoProducts.flatMap((product) => {
    const rows = present.map((record) => record.products[product.sku]).filter((row) => row !== undefined);
    if (rows.length === 0) return [];
    const productRevenue = rows.reduce((total, row) => total + cents(row.revenue), 0n);
    const productCogs = rows.reduce((total, row) => total + cents(row.cogs), 0n);
    return [{
      product_id: product.id, name: product.name, sku: product.sku,
      units_sold: rows.reduce((total, row) => total + row.unitsSold, 0), units_returned: rows.reduce((total, row) => total + row.unitsReturned, 0),
      revenue: money(productRevenue), cogs: money(productCogs), gross_profit: money(productRevenue - productCogs),
      gross_profit_margin: productRevenue > 0n ? percent(productRevenue - productCogs, productRevenue) : null,
      data_completeness: completeness(0, 0),
    }];
  });

  return analyticsDashboardSchema.parse({
    summary: {
      revenue: money(revenue), cogs: money(cogs), gross_profit: money(grossProfit), operating_expenses: money(operating),
      advertising_expenditure: money(advertising), total_expenses: money(operating + advertising), operating_profit: money(operatingProfit),
      gross_profit_margin: positive ? percent(grossProfit, revenue) : null, contribution_margin: positive ? percent(contribution, revenue) : null,
      operating_profit_margin: positive ? percent(operatingProfit, revenue) : null, average_order_value: orders > 0 && positive ? money(divide(revenue, BigInt(orders))) : null,
      order_count: orders, visitors, conversion_rate: trafficComplete ? conversion(orders, visitors) : null,
      currency: business.currency, reporting_period: period,
      data_source: { type: 'database_demo', description: `${business.name} demo dataset: synthetic transactions bundled with the app (Demo Mode, no backend).` },
      data_completeness: completeness(present.length, length),
    },
    store_timezone: business.timezone, as_of_date: business.asOfDate, selected_preset: filter.preset, daily, products,
    expenses: CATEGORIES.map(([key, label]) => ({ category: key, label, amount: money(category(key)) })),
    unallocated_customer_shipping_revenue: '0.00', product_warnings: [],
  });
}
