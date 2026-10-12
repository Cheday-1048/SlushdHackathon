import { z } from 'zod';
import { financeSummarySchema } from './schemas';

function decimalInput(min: number, max: number, places: number) {
  return z.string().trim().regex(new RegExp(`^-?\\d+(?:\\.\\d{1,${places}})?$`), `Enter a decimal number with at most ${places} decimal places.`)
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max, `Enter a value from ${min} to ${max}.`);
}

const percentChange = decimalInput(-100, 1000, 4);
const conversion = decimalInput(0, 100, 4);
const signedMoneyInput = z.string().trim().regex(/^-?\d+(?:\.\d{1,2})?$/, 'Enter an amount with at most 2 decimal places.').refine((value) => {
  const match = /^-?(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return false;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) <= 9999999999999999n;
}, 'Enter an amount with at most 14 whole digits.');
const nonnegativeMoneyInput = signedMoneyInput.refine((value) => Number(value) >= 0, 'Enter a nonnegative amount.');

export const simulationParametersSchema = z.object({
  selling_price_change_pct: percentChange,
  discount_pct: decimalInput(0, 100, 4),
  expected_conversion_rate: conversion.nullable(),
  visitor_change_pct: decimalInput(-100, 10000, 4),
  unit_cost_change_pct: percentChange,
  advertising_budget_change_amount: signedMoneyInput,
  additional_operating_expense_amount: nonnegativeMoneyInput,
}).strict();

export const simulationFormSchema = simulationParametersSchema.extend({
  expected_conversion_rate: z.union([z.literal(''), conversion]).transform((value) => value === '' ? null : value),
});

export type SimulationFormValues = z.input<typeof simulationFormSchema>;
export type SimulationParameters = z.output<typeof simulationParametersSchema>;

export const defaultSimulationValues: SimulationFormValues = {
  selling_price_change_pct: '0', discount_pct: '0', expected_conversion_rate: '',
  visitor_change_pct: '0', unit_cost_change_pct: '0',
  advertising_budget_change_amount: '0.00', additional_operating_expense_amount: '0.00',
};

export const simulationPeriodSchema = z.object({ start_date: z.iso.date(), end_date: z.iso.date() }).strict().superRefine((period, ctx) => {
  if (period.end_date < period.start_date) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be on or after start date.' });
  const days = (Date.parse(`${period.end_date}T00:00:00Z`) - Date.parse(`${period.start_date}T00:00:00Z`)) / 86400000 + 1;
  if (days > 366) ctx.addIssue({ code: 'custom', message: 'Choose a reporting period of 366 days or fewer.' });
  if (period.start_date === '0001-01-01') ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'Start date must be after January 1, 0001.' });
  if (period.end_date === '9999-12-31') ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be before December 31, 9999.' });
});
export type SimulationPeriod = z.infer<typeof simulationPeriodSchema>;
export const simulationRequestSchema = simulationPeriodSchema.safeExtend({ parameters: simulationParametersSchema });
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;

const amount = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/).refine((value) => Number.isFinite(Number(value)));
const expectedCount = z.string().regex(/^\d+(?:\.\d{1,6})?$/).refine((value) => Number.isFinite(Number(value)));
const quantityDifference = z.string().regex(/^-?\d+(?:\.\d{1,6})?$/).refine((value) => Number.isFinite(Number(value)));

export const simulatedMetricsSchema = z.object({
  revenue: amount, cogs: amount, gross_profit: amount, gross_profit_margin: amount.nullable(),
  contribution_profit: amount, contribution_margin: amount.nullable(), operating_expenses: amount,
  advertising_expenditure: amount, operating_profit: amount, operating_profit_margin: amount.nullable(),
  expected_orders: expectedCount, expected_visitors: expectedCount, assumed_conversion_rate: expectedCount,
  conversion_rate_source: z.enum(['historical_ratio', 'user_assumption']), customer_shipping_revenue: amount,
  shipping_expenses: amount, platform_fees: amount, employee_expenses: amount, rent_expenses: amount,
  other_operating_expenses: amount, total_expenses: amount,
});
export const differencesSchema = z.object({
  revenue: amount, operating_profit: amount, gross_profit: amount, orders: quantityDifference,
  revenue_change_pct: amount.nullable(), profit_change_pct: amount.nullable(),
});
const responseCommon = {
  model_version: z.literal('aggregate-v1'), store_id: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  reporting_period: z.object({ start: z.iso.date(), end: z.iso.date() }), baseline: financeSummarySchema,
  parameters: simulationParametersSchema, assumptions: z.array(z.string()), warnings: z.array(z.string()),
};
export const simulationResponseSchema = z.discriminatedUnion('status', [
  z.object({ ...responseCommon, status: z.literal('ready'), simulated: simulatedMetricsSchema, differences: differencesSchema }),
  z.object({ ...responseCommon, status: z.literal('unavailable'), simulated: z.null(), differences: z.null() }),
]).superRefine((data, ctx) => {
  if (data.currency !== data.baseline.currency || data.reporting_period.start !== data.baseline.reporting_period.start || data.reporting_period.end !== data.baseline.reporting_period.end) {
    ctx.addIssue({ code: 'custom', message: 'Simulation baseline metadata does not match the reporting period and currency.' });
  }
  if (data.status === 'ready' && [data.baseline.revenue, data.baseline.cogs, data.baseline.gross_profit, data.baseline.operating_profit].some((value) => value === null)) {
    ctx.addIssue({ code: 'custom', message: 'A ready simulation requires known baseline financial values.' });
  }
});
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;
