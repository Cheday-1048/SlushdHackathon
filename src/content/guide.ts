import {
  BarChart3, Bot, Brain, CircleDollarSign, Database, FlaskConical, Gauge, LayoutDashboard, LineChart, Rocket, Scale, Server,
  SlidersHorizontal, Split, Target, Workflow, type LucideIcon,
} from 'lucide-react';
import { afterLabel, beforeLabel, compareVisual, digVisual, explainVisual, facts, optimizeVisual, seeVisual, simulateVisual } from './scenario-data';

/*
 * GUIDE CONTENT — the single place to edit what the Guide says.
 * Every "implemented" claim names evidence (files or API paths). src/content/guide.test.ts checks that the
 * evidence exists, so the implemented/planned split cannot silently drift away from the code.
 * Statuses follow the Phase 03-08 reports and the code. "Planned" is used only for work that does not exist.
 */

export type Status = 'available' | 'partial' | 'planned';
export const statusLabels: Record<Status, string> = { available: 'Implemented', partial: 'Partly implemented', planned: 'Planned' };

export const sections = [
  { id: 'overview', label: 'Product overview' },
  { id: 'workflow', label: 'How it works' },
  { id: 'features', label: 'Core features' },
  { id: 'scenario', label: 'Business scenario' },
  { id: 'architecture', label: 'System architecture' },
  { id: 'status', label: 'MVP vs final product' },
] as const;
export type SectionId = (typeof sections)[number]['id'];

/* ── Product overview ─────────────────────────────────────────────────── */

export const overview = {
  title: 'saleslab.AI turns business data into business decisions',
  lead: 'saleslab.AI is a decision-support system for retail and e-commerce businesses. It brings sales, costs and profitability together, tests options before money is spent on them, and recommends actions under the owner’s goals and limits.',
  mvpNote: 'This build is a hackathon MVP and proof of concept, shown here on one fictional business (Nova Commerce). The financial engine, analytics, Simulation Lab, A/B Arena, Goal Optimizer and AI assistant are implemented and tested. Their limits are stated openly, and work that does not exist yet is labelled Planned.',
  problems: [
    { icon: LineChart, title: 'Growth can hide weaker profit', body: 'Sales rise, so everything looks fine, while costs, discounts, returns or ad spend quietly grow faster.' },
    { icon: Database, title: 'The numbers live in different places', body: 'Orders, refunds, VAT, product costs, ad spend and traffic rarely add up to one trusted figure.' },
    { icon: Scale, title: 'Decisions rest on instinct', body: 'Price, cost and marketing changes are usually tried live, with real money, to see what happens.' },
    { icon: Gauge, title: 'Insight arrives too late', body: 'Reports describe last month. The decision about this month has to be made before they are ready.' },
  ],
  comparison: [
    { dashboard: 'Shows what happened', saleslab: 'Explains why it happened, with evidence', status: 'planned' as Status },
    { dashboard: 'Reports past numbers', saleslab: 'Tests what could happen next', status: 'available' as Status },
    { dashboard: 'Leaves the choice to guesswork', saleslab: 'Compares options and finds strategies that meet a goal', status: 'available' as Status },
    { dashboard: 'Stops at the chart', saleslab: 'Keeps tracking results after a decision', status: 'partial' as Status },
  ],
  values: [
    { icon: CircleDollarSign, title: 'A trustworthy profit picture', body: 'One tested calculation engine. Values that cannot be calculated show as Unavailable instead of a guess.', status: 'available' as Status },
    { icon: Brain, title: 'Faster understanding', body: 'The assistant turns a plain-language goal into calculated strategies and explains them. Explaining past changes is planned.', status: 'partial' as Status },
    { icon: FlaskConical, title: 'Safer decisions', body: 'Options are evaluated on the business’s own numbers, as hypothetical results, before anything is applied.', status: 'available' as Status },
    { icon: Target, title: 'Accountable recommendations', body: 'Recommended strategies state their assumptions and limits. Tracking the outcome against expectations is planned.', status: 'partial' as Status },
  ],
};

/* ── How it works ─────────────────────────────────────────────────────── */

export interface WorkflowStage {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  does: string[];
  receives: string;
  hands: string;
  value: string;
  status: Status;
  today: string;
}

export const workflow: WorkflowStage[] = [
  {
    id: 'data', title: 'Business Data', icon: Database, status: 'partial',
    summary: 'Orders, products, refunds, costs, ad spend and store traffic in one consistent record.',
    does: ['Stores every sale line with its own price, discount, VAT and cost', 'Keeps refunds, expenses, ad spend and daily traffic alongside', 'Separates the business’s data from everything else'],
    receives: 'The business’s own sales and cost records', hands: 'Clean, complete records for processing',
    value: 'Everything the business knows is in one place.',
    today: 'One fictional demo store (Nova Commerce, September 2026) in PostgreSQL, also bundled for Demo Mode. Connecting a company’s own data is not built yet.',
  },
  {
    id: 'processing', title: 'Data Processing', icon: Workflow, status: 'available',
    summary: 'Raw records become dependable inputs: historical snapshots, VAT split, store-local days.',
    does: ['Uses the price and cost recorded at the time of sale, not today’s catalog', 'Splits VAT from revenue and counts refunds on their own dates', 'Groups days in the store’s timezone and flags missing data'],
    receives: 'Business Data', hands: 'Validated inputs for the financial engine',
    value: 'Later numbers are right because the inputs are right.',
    today: 'Implemented. Historical snapshots, VAT handling, refund dating and timezone-aware daily grouping are tested.',
  },
  {
    id: 'analytics', title: 'Financial Analytics', icon: BarChart3, status: 'available',
    summary: 'Revenue, cost of goods, profit, margins, conversion and break-even from one engine.',
    does: ['Calculates revenue, gross profit and operating profit with exact decimal arithmetic', 'Breaks results down by day, product and expense category', 'Reports completeness so partial data is never presented as complete'],
    receives: 'Processed records', hands: 'Trusted figures for people and for the decision modules',
    value: 'A single version of the financial truth.',
    today: 'Implemented. Served through the finance and analytics APIs and shown in the Dashboard and Analytics views.',
  },
  {
    id: 'ai', title: 'AI Analysis', icon: Brain, status: 'partial',
    summary: 'An AI assistant that turns a goal into calculated strategies. Explaining why performance changed is the planned next step.',
    does: ['Interprets a plain-language goal, such as raising operating profit by a percentage', 'Calls two validated backend tools: historical metrics and the Goal Optimizer', 'Shows the applied request, the calculated strategies and their limits'],
    receives: 'A goal in plain language and the Financial Analytics results', hands: 'Calculated strategies to compare',
    value: 'Goals become options without a spreadsheet.',
    today: 'The assistant is implemented. It needs the backend and a server-side OpenAI key, and was tested with a provider stub; no live OpenAI request has been made. Cause analysis of past changes is not built.',
  },
  {
    id: 'simulation', title: 'Scenario Simulation', icon: FlaskConical, status: 'available',
    summary: 'Tests “what if” changes to price, cost, traffic, conversion and marketing budget before they are applied.',
    does: ['Takes seven explicit assumptions and calculates hypothetical revenue, gross profit and operating profit', 'Compares them with the real historical baseline', 'Never writes to business records'],
    receives: 'The baseline and the owner’s assumptions', hands: 'Hypothetical outcomes for each option',
    value: 'Mistakes are made on paper, not with real money.',
    today: 'Implemented as a deterministic model. Traffic and conversion are the user’s assumptions; it is not a forecast of customer behavior.',
  },
  {
    id: 'recommendations', title: 'Decision Recommendations', icon: Target, status: 'available',
    summary: 'Compares strategies and finds options that meet a goal, each with its assumptions.',
    does: ['A/B Arena compares 2–4 strategies against one shared baseline', 'Goal Optimizer tests a bounded grid of options against a profit goal and limits', 'Recommended strategies can be sent to the Arena'],
    receives: 'Simulated outcomes and the owner’s goals', hands: 'A short list of options to decide on',
    value: 'The owner stays in charge and decides with evidence.',
    today: 'Implemented. Recommendations are the best tested candidates under stated assumptions, not guaranteed optima.',
  },
  {
    id: 'monitoring', title: 'Performance Monitoring', icon: Gauge, status: 'partial',
    summary: 'Follows results after a decision and shows whether reality matches what was expected.',
    does: ['Tracks KPIs over rolling and custom periods', 'Compares outcomes with what was expected', 'Feeds what is learned back into the next analysis'],
    receives: 'Fresh business data and chosen decisions', hands: 'Results that start the next cycle',
    value: 'Decisions are checked, not forgotten.',
    today: 'KPI tracking works: Dashboard filters cover the sample period, last 7, 30 and 90 days, and custom ranges. Comparing outcomes with expectations is planned.',
  },
];

/* ── Core features ────────────────────────────────────────────────────── */

export interface FeatureModule {
  id: string;
  title: string;
  icon: LucideIcon;
  status: Status;
  tagline: string;
  question: string;
  mvp: string[];
  vision: string[];
  to?: string;
  /** Needs the FastAPI backend, so it is not available in Demo Mode. */
  needsBackend?: boolean;
}

export const features: FeatureModule[] = [
  {
    id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, status: 'available', to: '/dashboard',
    tagline: 'The overall health of the business at a glance.', question: 'How is the business doing right now?',
    mvp: ['Six KPIs: revenue, gross profit, operating profit, operating expenses, operating margin, conversion rate', 'Daily performance chart for the selected KPI', 'Period filters: sample period, last 7/30/90 days, custom range', 'Data-completeness warnings; unknown values show as Unavailable'],
    vision: ['Business-health indicators that summarize overall condition', 'KPI tracking against targets the owner sets'],
  },
  {
    id: 'analytics', title: 'Business Analytics', icon: BarChart3, status: 'available', to: '/dashboard#analytics',
    tagline: 'Sales and financial analysis that shows what changed and where.', question: 'What changed, and where?',
    mvp: ['Six charts: revenue, orders, visitors and conversion, revenue vs operating expenses, product sales, expense breakdown', 'Product table with units, revenue, cost of goods, gross profit and margin', 'Expense categories, with advertising counted once', 'Exact values in tables beside every chart'],
    vision: ['Trend evaluation across periods', 'Data-driven insights written in plain language'],
  },
  {
    id: 'simulation', title: 'Simulation Lab', icon: FlaskConical, status: 'available', to: '/simulation-lab', needsBackend: true,
    tagline: 'Evaluate a decision before applying it.', question: 'What happens if I change this?',
    mvp: ['Seven assumptions: price, additional discount, conversion, visitors, unit cost, advertising budget, extra operating expense', 'Hypothetical revenue, gross profit and operating profit next to the historical baseline', 'Clearly labelled as hypothetical; no business records are written'],
    vision: ['Saved scenarios and decision history (nothing is stored today)', 'Modeling of customer response such as price–demand effects (traffic and conversion are user assumptions today)'],
  },
  {
    id: 'arena', title: 'A/B Arena', icon: Split, status: 'available', to: '/simulation-lab', needsBackend: true,
    tagline: 'Put alternative strategies side by side.', question: 'Which of these two strategies is better for us?',
    mvp: ['Compare 2–4 named hypothetical strategies against one shared historical baseline', 'Add, duplicate, rename, edit, remove and reset scenarios; select or exclude them manually', 'Differences against the baseline, with a fingerprint of the baseline used'],
    vision: ['Real-traffic A/B experiments with customers (the sidebar keeps “A/B Testing” as Planned)', 'Persisted decisions and scenario history'],
  },
  {
    id: 'optimizer', title: 'Goal Optimizer', icon: Target, status: 'available', to: '/simulation-lab', needsBackend: true,
    tagline: 'Start from the goal and work back to the actions.', question: 'What should we do to reach this goal?',
    mvp: ['Set a percentage operating-profit goal and decision limits', 'Bounded deterministic search (up to 625 tested candidates) over price change, additional discount, advertising increase and extra operating expense', 'Up to three feasible strategies ranked by modeled operating profit; any can be sent to the A/B Arena'],
    vision: ['A validated price–demand model and risk estimates (none today)', 'Absolute-profit and loss-reduction objectives'],
  },
  {
    id: 'assistant', title: 'AI Decision Assistant', icon: Bot, status: 'available', to: '/ai-assistant', needsBackend: true,
    tagline: 'Turns a goal in plain language into calculated strategies.', question: 'How could we raise operating profit by 10%?',
    mvp: ['Interprets a goal and calls two validated backend tools: store metrics and goal optimization', 'Results, limits and explanations are written by the backend, never taken from model text', 'The OpenAI key and model are configured on the server only', 'Tested with a provider stub; no live OpenAI request has been made yet'],
    vision: ['Explaining why performance changed, with evidence', 'Multi-turn conversation (each request is independent today)', 'Goals beyond percentage operating-profit increases'],
  },
];

/* ── Example business scenario ────────────────────────────────────────── */

export type ScenarioVisual =
  | { kind: 'metrics'; items: { label: string; before: string; after: string; tone: 'good' | 'bad' }[] }
  | { kind: 'bars'; caption: string; rows: { label: string; value: number; display: string; tone: 'good' | 'bad' | 'neutral' }[] }
  | { kind: 'findings'; items: { title: string; evidence: string }[] }
  | { kind: 'table'; caption: string; columns: string[]; rows: { cells: string[]; highlight?: boolean }[] }
  | { kind: 'checklist'; items: { label: string; done: boolean }[] };

export interface ScenarioStep {
  id: string;
  module: string;
  icon: LucideIcon;
  headline: string;
  body: string;
  status: Status;
  today: string;
  visual: ScenarioVisual;
}

export const scenario = {
  title: 'Sales are up, but profit is shrinking',
  situation: `Nova Commerce, the demo store, sells more in ${afterLabel} than in ${beforeLabel}: revenue is up ${facts.revenueChangePct.toFixed(1)}%. The owner is pleased until operating margin falls from ${facts.marginBefore.toFixed(1)}% to ${facts.marginAfter.toFixed(1)}%. How would saleslab.AI work through it?`,
  disclaimer: 'Steps 1 and 2 use the Nova Commerce demo data, the same data as the Dashboard. Steps 4–6 were computed by the implemented Simulation, A/B Arena and Goal Optimizer engines on that data; they are hypothetical results under stated assumptions, not forecasts. Step 3 shows a planned capability, so its text is an example of the kind of output intended, not real AI output.',
  steps: [
    {
      id: 'see', module: 'Dashboard', icon: LayoutDashboard, status: 'available',
      headline: 'The dashboard makes the problem visible',
      body: 'Choosing each week as a custom range shows revenue growing while operating profit and margin fall.',
      today: 'Implemented: use the Dashboard’s custom range for each week. A side-by-side comparison of two periods is planned.',
      visual: seeVisual,
    },
    {
      id: 'dig', module: 'Business Analytics', icon: BarChart3, status: 'available',
      headline: 'Analytics inspects costs and sales',
      body: 'The expense breakdown and the daily revenue-versus-expenses chart show which costs moved when the margin fell.',
      today: 'Implemented: revenue vs operating expenses, expense breakdown and product tables. Written insights are planned.',
      visual: digVisual,
    },
    {
      id: 'explain', module: 'AI Decision Assistant', icon: Bot, status: 'planned',
      headline: 'AI explains likely causes, with evidence',
      body: 'A planned capability: the assistant connects the changes, ranks the likely causes and points to the numbers behind each one.',
      today: 'Planned. The assistant implemented today turns goals into strategies; it does not yet explain past changes. The evidence figures shown are real demo data.',
      visual: explainVisual,
    },
    {
      id: 'simulate', module: 'Simulation Lab', icon: FlaskConical, status: 'available',
      headline: 'Simulation Lab tests alternatives',
      body: 'Before touching anything, the owner tries two ideas on the same week. Cutting advertising looks worse than expected on profit, a small price rise slightly better.',
      today: 'Implemented. These figures come from the real Simulation engine; the assumptions are the user’s. It needs the backend, so it is not available in Demo Mode.',
      visual: simulateVisual,
    },
    {
      id: 'compare', module: 'A/B Arena', icon: Split, status: 'available',
      headline: 'A/B Arena compares the strategies',
      body: 'Both strategies are placed on one shared baseline so the difference in profit and revenue is directly comparable.',
      today: 'Implemented. These figures come from the real A/B Arena service.',
      visual: compareVisual,
    },
    {
      id: 'optimize', module: 'Goal Optimizer', icon: Target, status: 'available',
      headline: 'Goal Optimizer fits the options to the goal',
      body: 'The owner states a profit goal and limits. The optimizer tests a bounded grid and keeps only the strategies that satisfy both.',
      today: 'Implemented. Real optimizer output, with its model limit: demand is assumed unchanged, so higher prices always look attractive. The assistant can run the same goal from a sentence when the backend and an OpenAI key are configured.',
      visual: optimizeVisual,
    },
    {
      id: 'decide', module: 'You decide', icon: SlidersHorizontal, status: 'partial',
      headline: 'The owner reviews and decides',
      body: 'Each recommendation arrives with its assumptions and limits. The owner decides, and monitoring then checks the result against what was expected.',
      today: 'KPI monitoring works today. Tracking decisions against expectations is planned.',
      visual: { kind: 'checklist', items: [
        { label: 'Review the recommended strategy and its assumptions', done: true },
        { label: 'Choose and apply the decision', done: false },
        { label: 'Track margin and revenue on the Dashboard', done: true },
        { label: 'Compare the result with the expectation', done: false },
      ] },
    },
  ] satisfies ScenarioStep[],
};

/* ── System architecture ──────────────────────────────────────────────── */

export interface ArchitectureNode {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  status: 'available' | 'planned';
  details: string[];
  note?: string;
}

export const architecture: { nodes: ArchitectureNode[]; security: { today: string[]; notYet: string[] } } = {
  nodes: [
    {
      id: 'browser', title: 'Web application', subtitle: 'React · TypeScript · Vite', icon: LayoutDashboard, status: 'available',
      details: ['Calls the API and validates every response with a typed schema', 'Formats numbers for display and never recalculates money, margins or totals', 'Demo Mode serves a bundled sample dataset and needs no backend', 'Shared design system with light and dark themes'],
    },
    {
      id: 'api', title: 'API', subtitle: 'FastAPI', icon: Server, status: 'available',
      details: ['/api/analytics/dashboard and /api/finance/summary: reporting snapshots', '/api/simulations/preview and /api/simulations/compare: scenarios and the A/B Arena', '/api/optimization/goal: goal-based strategy search', '/api/assistant/chat: the AI assistant', '/api/products, /api/expenses and /health', 'Clear 503, 404 and 422 errors instead of fallback data'],
    },
    {
      id: 'engine', title: 'Financial and decision engines', subtitle: 'Exact decimal arithmetic', icon: CircleDollarSign, status: 'available',
      details: ['Pure calculations with no web or database code inside', 'Two-decimal money with ROUND_HALF_UP; unknown inputs stay null', 'Simulation, comparison and optimization reuse the same financial baseline', 'The AI assistant only selects tools; amounts and recommendations come from these engines'],
    },
    {
      id: 'database', title: 'Data layer', subtitle: 'PostgreSQL · Alembic', icon: Database, status: 'available',
      details: ['Nine models in a dedicated schema with constraints and indexes', 'Versioned migrations and a repeatable synthetic seed', 'Supabase is the intended host; a live Supabase connection is not verified yet'],
    },
    {
      id: 'planned', title: 'Planned additions', subtitle: 'Not designed yet', icon: Rocket, status: 'planned',
      details: ['Connecting a business’s own data', 'Accounts and permissions for several businesses', 'AI explanations of past changes, and real-traffic A/B experiments', 'No technical design exists for these in the project documentation'],
      note: 'Design intent, not a specification.',
    },
  ],
  security: {
    today: [
      'Database credentials and the OpenAI key live only on the server and never in browser variables',
      'Database connections require SSL by default',
      'The API serves only the fixed demo store; unknown query parameters are rejected',
      'Each data request uses a read-only transaction with one consistent snapshot',
      'Browser origins are allowed only from an explicit list',
      'The assistant has no SQL, code-execution or write tools',
    ],
    notYet: ['User accounts and authentication', 'Permissions for multiple real businesses', 'Hosted production deployment'],
  },
};

/* ── MVP vs final product ─────────────────────────────────────────────── */

export interface Capability {
  id: string;
  area: 'Data and engine' | 'API' | 'Interface' | 'Decision modules' | 'Quality' | 'Platform';
  title: string;
  description: string;
  status: Status;
  /** Repository files that exist for this capability (implemented/partial only). */
  evidence?: string[];
  /** API paths that must appear in docs/openapi.json. */
  endpoints?: string[];
}

export const capabilities: Capability[] = [
  { id: 'schema', area: 'Data and engine', status: 'available', title: 'Retail data model, migrations and demo seed', description: 'Nine-model PostgreSQL schema, versioned migrations and a repeatable synthetic store (September 2026).', evidence: ['backend/app/db/models.py', 'backend/migrations/versions/0001_retail_schema.py', 'backend/app/seed.py'] },
  { id: 'engine', area: 'Data and engine', status: 'available', title: 'Financial calculation engine', description: 'Exact decimal revenue, cost of goods, profit, margins, conversion and break-even, with VAT and refund handling.', evidence: ['backend/app/services/finance/calculations.py', 'backend/tests/test_finance_calculations.py', 'docs/phase-03-financial-engine.md'] },
  { id: 'finance-api', area: 'API', status: 'available', title: 'Finance summary API', description: 'Authoritative financial report for any date range, with completeness indicators.', evidence: ['backend/app/api/finance.py'], endpoints: ['/api/finance/summary'] },
  { id: 'analytics-api', area: 'API', status: 'available', title: 'Analytics API', description: 'Summary, daily series, product performance and expense categories in one consistent snapshot.', evidence: ['backend/app/api/analytics.py', 'backend/tests/test_analytics_database.py'], endpoints: ['/api/analytics/dashboard'] },
  { id: 'catalog-api', area: 'API', status: 'available', title: 'Products and expenses API', description: 'Paginated product and expense records of the demo store.', evidence: ['backend/app/api/catalog.py'], endpoints: ['/api/products', '/api/expenses'] },
  { id: 'dashboard', area: 'Interface', status: 'available', title: 'Dashboard with six KPIs', description: 'Revenue, gross profit, operating profit, operating expenses, operating margin and conversion, plus a daily performance chart.', evidence: ['src/pages/dashboard.tsx', 'src/components/dashboard/kpi-overview.tsx', 'src/components/dashboard/performance-chart.tsx'] },
  { id: 'analytics-ui', area: 'Interface', status: 'available', title: 'Business analytics charts and tables', description: 'Six charts plus product and expense tables with exact values.', evidence: ['src/components/analytics.tsx'] },
  { id: 'filters', area: 'Interface', status: 'available', title: 'Reporting period filters', description: 'Sample period, last 7/30/90 days and custom ranges up to 366 days, with validation.', evidence: ['src/components/reporting-filter.tsx', 'src/hooks/use-dashboard.ts'] },
  { id: 'demo-mode', area: 'Interface', status: 'available', title: 'Demo Mode on a bundled sample business', description: 'Nova Commerce, September 2026: the backend’s own synthetic data, filterable by any period, with no backend or database.', evidence: ['src/demo/aggregate.ts', 'src/demo/nova-commerce.json', 'src/demo/aggregate.test.ts'] },
  { id: 'design', area: 'Interface', status: 'available', title: 'Design system with light/dark themes', description: 'Shared tokens, accent, density and motion preferences, and a responsive shell.', evidence: ['src/design-system/tokens.css', 'src/components/layout/app-shell.tsx'] },
  { id: 'simulation', area: 'Decision modules', status: 'available', title: 'Simulation Lab', description: 'Seven explicit assumptions produce deterministic hypothetical revenue and profit next to the historical baseline.', evidence: ['backend/app/services/simulation/calculations.py', 'backend/tests/test_simulation_calculations.py', 'src/pages/simulation-lab.tsx'], endpoints: ['/api/simulations/preview'] },
  { id: 'arena', area: 'Decision modules', status: 'available', title: 'A/B Arena', description: 'Compares 2–4 hypothetical strategies against one shared baseline.', evidence: ['backend/app/services/simulation_comparison.py', 'backend/tests/test_comparison_database.py', 'src/components/simulation-arena.tsx'], endpoints: ['/api/simulations/compare'] },
  { id: 'optimizer', area: 'Decision modules', status: 'available', title: 'Goal Optimizer', description: 'Bounded deterministic search for strategies that meet a profit goal under constraints. Best tested candidates, not guaranteed optima.', evidence: ['backend/app/services/optimization.py', 'backend/tests/test_optimization_database.py', 'src/components/goal-optimizer.tsx'], endpoints: ['/api/optimization/goal'] },
  { id: 'assistant', area: 'Decision modules', status: 'available', title: 'AI Decision Assistant', description: 'Turns a plain-language goal into validated tool calls; the backend writes all figures and explanations. Tested with a provider stub.', evidence: ['backend/app/services/assistant.py', 'backend/tests/test_assistant.py', 'src/components/decision-assistant.tsx'], endpoints: ['/api/assistant/chat'] },
  { id: 'monitoring', area: 'Decision modules', status: 'partial', title: 'KPI monitoring over time', description: 'KPIs can be tracked over rolling and custom periods. Comparing results with expectations is not built.', evidence: ['src/components/reporting-filter.tsx'] },
  { id: 'tests', area: 'Quality', status: 'available', title: 'Automated tests and CI workflow', description: 'Backend, frontend and browser tests. The Phase 08 report records 530 backend and 76 frontend tests passing (macOS, PostgreSQL 16.2).', evidence: ['backend/tests/test_api.py', 'tests/e2e/dashboard.spec.ts', '.github/workflows/verify.yml', 'docs/phase-08-report.md'] },
  { id: 'ai-causes', area: 'Decision modules', status: 'planned', title: 'AI explanations of past changes', description: 'Ranking likely causes of a performance change with the evidence behind each one.' },
  { id: 'live-ab', area: 'Decision modules', status: 'planned', title: 'Real-traffic A/B experiments', description: 'Live experiments with customers. The Arena compares hypothetical strategies only.' },
  { id: 'live-ai', area: 'Platform', status: 'planned', title: 'Live AI provider verification', description: 'No live OpenAI request has been made; the assistant is verified with a provider stub.' },
  { id: 'own-data', area: 'Data and engine', status: 'planned', title: 'Connecting a business’s own data', description: 'Importing or syncing real sales and cost records. The MVP reads one fictional store.' },
  { id: 'persistence', area: 'Decision modules', status: 'planned', title: 'Saved scenarios and decision history', description: 'Scenarios, recommendations and decisions are not stored today.' },
  { id: 'auth', area: 'Platform', status: 'planned', title: 'Authentication and multi-business access', description: 'Accounts and permissions for real tenants. The project documents these as a later phase.' },
  { id: 'hosting', area: 'Platform', status: 'planned', title: 'Hosted production deployment with a live database', description: 'Public backend deployment with a hosted database. A live Supabase connection has not been verified.' },
];

export const verification = {
  verified: 'Recorded in docs/phase-08-report.md: 530 backend and 76 frontend tests passed on macOS with PostgreSQL 16.2. The assistant was verified with a provider stub.',
  notVerified: 'Not verified: a live OpenAI request, a live Supabase connection, a hosted backend deployment, and execution on Windows with a real database.',
};

/* ── Presentation mode ────────────────────────────────────────────────── */

export type PresentationId = 'overview' | 'problem' | 'solution' | 'workflow' | 'features' | 'scenario' | 'vision';

export interface PresentationStep {
  id: PresentationId;
  label: string;
  title: string;
  message: string;
  points: string[];
  details: { title: string; items: string[] };
}

export const presentation: PresentationStep[] = [
  {
    id: 'overview', label: 'Product overview', title: 'saleslab.AI: from business data to business decisions',
    message: 'A decision-support system for retail and e-commerce that tests options before money is spent and recommends actions under the owner’s goals.',
    points: ['Built on financial figures the owner can trust', 'Designed to advise, not only to display', 'Today: a working MVP with analytics, simulation, optimization and an AI assistant'],
    details: { title: 'What the MVP contains', items: ['React and TypeScript web app on a FastAPI backend', 'PostgreSQL data model with a fictional demo store, Nova Commerce', 'Exact-decimal financial engine and analytics API', 'Simulation Lab, A/B Arena, Goal Optimizer and AI assistant', 'Demo Mode that runs on bundled sample data with no backend'] },
  },
  {
    id: 'problem', label: 'Problem', title: 'Growth can hide a profit problem',
    message: 'Owners watch sales rise and assume all is well, while costs, discounts, returns and ad spend tell a different story from different places.',
    points: ['Profit and sales do not always move together', 'Financial data is scattered', 'Decisions are tested live, with real money'],
    details: { title: 'Why it persists', items: ['Revenue, VAT, refunds, product costs and ad spend sit in separate tools', 'Reports are retrospective, decisions are forward-looking', 'Small businesses rarely have an analyst to connect the pieces'] },
  },
  {
    id: 'solution', label: 'Solution', title: 'A system that supports the decision, not just the report',
    message: 'saleslab.AI is positioned as a decision system. It starts from trustworthy financials and extends to simulation, comparison and goal-based recommendation.',
    points: ['One consistent financial truth (implemented)', 'Decisions tested before they are made (implemented)', 'Strategies found for a goal, with assumptions shown (implemented)', 'Explaining past changes with evidence (planned)'],
    details: { title: 'Positioning', items: ['Not a generic analytics dashboard', 'The owner always makes the final decision', 'Every recommendation shows its assumptions and limits'] },
  },
  {
    id: 'workflow', label: 'Workflow', title: 'Seven connected stages, one flow',
    message: 'Data flows from the business through processing and analytics to AI analysis, simulation and recommendations, then back through monitoring.',
    points: ['Five stages are implemented, two partly', 'Each stage hands its result to the next', 'Select a stage to see what it does today'],
    details: { title: 'Technical architecture', items: ['Web app calls a FastAPI service', 'The API uses decimal financial and decision engines and PostgreSQL', 'The AI assistant selects validated tools; the engines produce every figure'] },
  },
  {
    id: 'features', label: 'Features', title: 'Six modules, one purpose: better decisions',
    message: 'All six modules are implemented in this MVP. Each states what it does today and what is still beyond it.',
    points: ['Dashboard and Business Analytics: work in Demo Mode', 'Simulation Lab, A/B Arena, Goal Optimizer and AI assistant: need the backend', 'Each module answers a specific owner question'],
    details: { title: 'Per-module detail', items: ['Open a module card for what exists today and what is not built yet', 'Real-traffic A/B testing stays Planned in the sidebar'] },
  },
  {
    id: 'scenario', label: 'Business scenario', title: 'Example: sales up, profit down',
    message: `Follow one problem on Nova Commerce through the product, from noticing it (${beforeLabel} vs ${afterLabel}) to a recommended decision.`,
    points: ['Steps 1–2 use the demo data behind the Dashboard', 'Steps 4–6 are output of the implemented engines on that data', 'Step 3 shows a planned capability'],
    details: { title: 'How to read the scenario', items: ['Each step shows whether its module is implemented or planned', 'Hypothetical results rest on stated assumptions and are not forecasts', 'Use Play to run the walkthrough automatically'] },
  },
  {
    id: 'vision', label: 'MVP vs vision', title: 'What works today, and what comes next',
    message: 'The foundation and the decision modules are built and tested. What remains is clearly separated here.',
    points: ['Implemented: data model, financial engine, APIs, dashboard, analytics, simulation, arena, optimizer, assistant', 'Planned: AI explanations, live A/B tests, own-data connection, accounts, hosting', 'Verification status is stated openly'],
    details: { title: 'Verification', items: [verification.verified, verification.notVerified] },
  },
];
