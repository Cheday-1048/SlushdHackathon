import { z } from 'zod';
import { optimizationResponseSchema } from './optimization';
import { financeSummarySchema } from './schemas';
import { simulationPeriodSchema } from './simulation';

export const assistantRequestSchema = simulationPeriodSchema.safeExtend({ message: z.string().trim().min(1, 'Describe your business goal.').max(2000, 'Keep your message to 2,000 characters or fewer.') });
export const assistantResponseSchema = z.object({
  message: z.string().min(1),
  metrics: financeSummarySchema.nullable(),
  optimization: optimizationResponseSchema.nullable(),
  tools_used: z.array(z.enum(['get_store_metrics', 'run_goal_optimization'])).max(2),
}).superRefine((data, ctx) => {
  if (new Set(data.tools_used).size !== data.tools_used.length) ctx.addIssue({ code: 'custom', message: 'Assistant tool names must be unique.' });
  if (data.metrics !== null && !data.tools_used.includes('get_store_metrics')) ctx.addIssue({ code: 'custom', message: 'Historical metrics require an executed metrics tool.' });
  if (data.optimization !== null && !data.tools_used.includes('run_goal_optimization')) ctx.addIssue({ code: 'custom', message: 'Strategies require an executed optimization tool.' });
  if (data.metrics && data.optimization && (data.metrics.currency !== data.optimization.currency || data.metrics.reporting_period.start !== data.optimization.reporting_period.start || data.metrics.reporting_period.end !== data.optimization.reporting_period.end)) ctx.addIssue({ code: 'custom', message: 'Assistant results must share a reporting period and currency.' });
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
