import { z } from 'zod';
import { financeSummarySchema } from './schemas';
import { differencesSchema, simulatedMetricsSchema, simulationParametersSchema, simulationPeriodSchema } from './simulation';

const decimal = (min: number, max: number) => z.string().trim().regex(/^-?\d+(?:\.\d{1,4})?$/, 'Enter a decimal with at most 4 decimal places.').refine(value => Number(value) >= min && Number(value) <= max, `Enter a value from ${min} to ${max}.`);
const optionalPercent = z.union([z.literal(''), decimal(0, 100)]).transform(value => value === '' ? null : value);
const money = simulationParametersSchema.shape.additional_operating_expense_amount;
const constraints = z.object({
  min_selling_price_change_pct: decimal(-100, 1000), max_selling_price_change_pct: decimal(-100, 1000),
  max_discount_pct: decimal(0, 100), max_advertising_increase_amount: money,
  max_additional_operating_expense_amount: money, minimum_operating_profit_margin_pct: decimal(0, 100).nullable(),
}).strict().superRefine((value, ctx) => { if (Number(value.min_selling_price_change_pct) > Number(value.max_selling_price_change_pct)) ctx.addIssue({ code: 'custom', path: ['max_selling_price_change_pct'], message: 'Maximum selling price change must be at least the minimum.' }); });
const behavior = z.object({ conversion_mode: z.enum(['historical', 'explicit']), expected_conversion_rate: decimal(0, 100).nullable(), visitor_change_pct: decimal(-100, 10000), unit_cost_change_pct: decimal(-100, 1000) }).strict().superRefine((value, ctx) => {
  if (value.conversion_mode === 'explicit' && value.expected_conversion_rate === null) ctx.addIssue({ code: 'custom', path: ['expected_conversion_rate'], message: 'Enter your explicit conversion assumption.' });
  if (value.conversion_mode === 'historical' && value.expected_conversion_rate !== null) ctx.addIssue({ code: 'custom', path: ['expected_conversion_rate'], message: 'Historical mode must retain the measured conversion ratio.' });
});
const search = z.object({ price_points: z.number().int().min(2).max(5), discount_points: z.number().int().min(2).max(5), advertising_points: z.number().int().min(2).max(5), expense_points: z.number().int().min(2).max(5), max_candidates: z.number().int().min(1).max(625) }).strict();
export const optimizationRequestSchema = simulationPeriodSchema.safeExtend({ target_profit_increase_pct: decimal(0, 10000), constraints, behavioral_assumptions: behavior, search });
export type OptimizationRequest = z.infer<typeof optimizationRequestSchema>;
export const optimizationFormSchema = z.object({
  target: decimal(0, 10000), minPrice: decimal(-100, 1000), maxPrice: decimal(-100, 1000), discount: decimal(0, 100), advertising: money, expenses: money, margin: optionalPercent,
  conversionMode: z.enum(['historical', 'explicit']), conversion: optionalPercent, visitors: decimal(-100, 10000), unitCost: decimal(-100, 1000),
}).superRefine((value, ctx) => {
  if (Number(value.minPrice) > Number(value.maxPrice)) ctx.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Maximum selling price change must be at least the minimum.' });
  if (value.conversionMode === 'explicit' && value.conversion === null) ctx.addIssue({ code: 'custom', path: ['conversion'], message: 'Enter your explicit conversion assumption.' });
});
export type OptimizationFormValues = z.input<typeof optimizationFormSchema>;
export type OptimizationFormOutput = z.output<typeof optimizationFormSchema>;
export const defaultOptimizationValues: OptimizationFormValues = { target: '10', minPrice: '0', maxPrice: '10', discount: '10', advertising: '0.00', expenses: '0.00', margin: '', conversionMode: 'historical', conversion: '', visitors: '0', unitCost: '0' };
export function optimizationSettings(values: OptimizationFormOutput) {
  return { target_profit_increase_pct: values.target, constraints: { min_selling_price_change_pct: values.minPrice, max_selling_price_change_pct: values.maxPrice, max_discount_pct: values.discount, max_advertising_increase_amount: values.advertising, max_additional_operating_expense_amount: values.expenses, minimum_operating_profit_margin_pct: values.margin }, behavioral_assumptions: { conversion_mode: values.conversionMode, expected_conversion_rate: values.conversionMode === 'historical' ? null : values.conversion, visitor_change_pct: values.visitors, unit_cost_change_pct: values.unitCost }, search: { price_points: 5, discount_points: 3, advertising_points: 2, expense_points: 2, max_candidates: 625 } };
}
const amount = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
export const recommendedStrategySchema = z.object({ id: z.uuid(), name: z.string(), parameters: simulationParametersSchema, status: z.literal('ready'), simulated: simulatedMetricsSchema, differences: differencesSchema, assumptions: z.array(z.string()), warnings: z.array(z.string()), constraints_satisfied: z.array(z.string()) });
export const optimizationResponseSchema = z.object({
  model_version: z.literal('aggregate-v1'), search_version: z.literal('grid-v1'), snapshot_id: z.string().regex(/^sha256:[0-9a-f]{64}$/), store_id: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), reporting_period: z.object({ start: z.iso.date(), end: z.iso.date() }), baseline: financeSummarySchema,
  request: optimizationRequestSchema, target_operating_profit: amount.nullable(), target_profit_difference: amount.nullable(), candidates_evaluated: z.number().int().min(0).max(625), feasible_candidate_count: z.number().int().nonnegative(), status: z.enum(['feasible', 'target_not_achievable', 'unavailable']), recommendations: z.array(recommendedStrategySchema).max(3),
  rejections: z.object({ below_profit_target: z.number().int().nonnegative(), below_minimum_margin: z.number().int().nonnegative(), unavailable: z.number().int().nonnegative() }), assumptions: z.array(z.string()), constraint_explanations: z.array(z.string()), warnings: z.array(z.string()),
}).superRefine((data, ctx) => {
  if (data.currency !== data.baseline.currency || data.reporting_period.start !== data.baseline.reporting_period.start || data.reporting_period.end !== data.baseline.reporting_period.end || data.reporting_period.start !== data.request.start_date || data.reporting_period.end !== data.request.end_date) ctx.addIssue({ code: 'custom', message: 'Optimization baseline metadata does not match.' });
  if ((data.status === 'feasible' && (data.recommendations.length === 0 || data.feasible_candidate_count === 0)) || (data.status !== 'feasible' && data.recommendations.length > 0)) ctx.addIssue({ code: 'custom', message: 'Optimization feasibility does not match its recommendations.' });
  if (data.feasible_candidate_count > data.candidates_evaluated) ctx.addIssue({ code: 'custom', message: 'Feasible candidate count exceeds evaluated candidates.' });
  if (data.status === 'feasible' && (data.target_operating_profit === null || data.target_profit_difference === null || data.baseline.operating_profit === null || Number(data.baseline.operating_profit) <= 0 || [data.baseline.revenue, data.baseline.cogs, data.baseline.gross_profit].some(value => value === null))) ctx.addIssue({ code: 'custom', message: 'Feasible strategies require known baseline finances and a positive baseline profit.' });
  if (data.rejections.below_profit_target + data.rejections.below_minimum_margin + data.rejections.unavailable + data.feasible_candidate_count !== data.candidates_evaluated) ctx.addIssue({ code: 'custom', message: 'Candidate counts do not reconcile.' });
  if (data.recommendations.length > data.feasible_candidate_count || new Set(data.recommendations.map(strategy => strategy.id)).size !== data.recommendations.length) ctx.addIssue({ code: 'custom', message: 'Recommendations must identify distinct feasible strategies.' });
});
export type OptimizationResponse = z.infer<typeof optimizationResponseSchema>;
export type RecommendedStrategy = z.infer<typeof recommendedStrategySchema>;
