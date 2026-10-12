import { z } from 'zod';
import { financeSummarySchema } from './schemas';
import { differencesSchema, simulatedMetricsSchema, simulationFormSchema, simulationParametersSchema, simulationPeriodSchema } from './simulation';

export const comparisonScenarioSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1, 'Enter a scenario name.').max(80, 'Use 80 characters or fewer.'), parameters: simulationParametersSchema }).strict();
const scenarioList = z.array(comparisonScenarioSchema).min(2).max(4).refine((scenarios) => new Set(scenarios.map(({ id }) => id)).size === scenarios.length, 'Scenario identifiers must be unique.');
export const comparisonRequestSchema = simulationPeriodSchema.safeExtend({ scenarios: scenarioList });
export const comparisonFormSchema = z.object({ scenarios: z.array(comparisonScenarioSchema.extend({ parameters: simulationFormSchema })).min(2).max(4) });
export type ComparisonFormValues = z.input<typeof comparisonFormSchema>;
export type ComparisonFormOutput = z.output<typeof comparisonFormSchema>;
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;
const amount = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
const precise = z.string().regex(/^-?\d+(?:\.\d{1,6})?$/);
const comparisonMetricsSchema = z.object({
  orders_change_pct: amount.nullable(), gross_profit_change_pct: amount.nullable(),
  operating_expenses_difference: amount, operating_expenses_change_pct: amount.nullable(),
  advertising_expenditure_difference: amount, advertising_expenditure_change_pct: amount.nullable(),
  conversion_rate_difference_pp: precise.nullable(), operating_profit_margin_difference_pp: amount.nullable(),
});
const commonScenario = { ...comparisonScenarioSchema.shape, assumptions: z.array(z.string()), warnings: z.array(z.string()) };
export const comparedScenarioSchema = z.discriminatedUnion('status', [
  z.object({ ...commonScenario, status: z.literal('ready'), simulated: simulatedMetricsSchema, differences: differencesSchema, comparison: comparisonMetricsSchema }),
  z.object({ ...commonScenario, status: z.literal('unavailable'), simulated: z.null(), differences: z.null(), comparison: z.null() }),
]);
export const comparisonResponseSchema = z.object({
  model_version: z.literal('aggregate-v1'), snapshot_id: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  store_id: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), reporting_period: z.object({ start: z.iso.date(), end: z.iso.date() }),
  baseline: financeSummarySchema, scenarios: z.array(comparedScenarioSchema).min(2).max(4), assumptions: z.array(z.string()), warnings: z.array(z.string()),
}).superRefine((data, ctx) => {
  if (data.currency !== data.baseline.currency || data.reporting_period.start !== data.baseline.reporting_period.start || data.reporting_period.end !== data.baseline.reporting_period.end) ctx.addIssue({ code: 'custom', message: 'Comparison baseline metadata does not match.' });
  if (new Set(data.scenarios.map(({ id }) => id)).size !== data.scenarios.length) ctx.addIssue({ code: 'custom', message: 'Comparison scenario identifiers must be unique.' });
  if (data.scenarios.some((scenario) => scenario.status === 'ready') && [data.baseline.revenue, data.baseline.cogs, data.baseline.gross_profit, data.baseline.operating_profit].some((value) => value === null)) ctx.addIssue({ code: 'custom', message: 'Ready scenarios require known baseline financial values.' });
});
export type ComparisonResponse = z.infer<typeof comparisonResponseSchema>;
export type ComparedScenario = z.infer<typeof comparedScenarioSchema>;
