import {
  BarChart3, Bot, Brain, CircleDollarSign, Database, FlaskConical, Gauge, LayoutDashboard, LineChart, Rocket, Scale, Server,
  SlidersHorizontal, Split, Target, Workflow, type LucideIcon,
} from 'lucide-react';

/*
 * GUIDE CONTENT — the single place to edit what the Guide says.
 * Every "available" claim names evidence (files or API paths). src/content/guide.test.ts checks that the
 * evidence exists, so the MVP/planned split cannot silently drift away from the code.
 * Planned modules are product vision. The repository documents no technical design for them, and this
 * file does not invent one.
 */

export type Status = 'available' | 'partial' | 'planned';
export const statusLabels: Record<Status, string> = { available: 'Available in MVP', partial: 'Partly in MVP', planned: 'Planned' };

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
  lead: 'saleslab.AI is a decision-support system for retail and e-commerce businesses. It brings sales, costs and profitability together, explains what is happening and why, and is designed to let owners test their options before they spend money on them.',
  mvpNote: 'This build is a hackathon MVP and proof of concept. Its foundation is working and tested: a financial engine and analytics on a fictional demo store. The decision modules described in this guide are the planned full product and are labelled as such.',
  problems: [
    { icon: LineChart, title: 'Growth can hide weaker profit', body: 'Sales rise, so everything looks fine, while costs, discounts, returns or ad spend quietly grow faster.' },
    { icon: Database, title: 'The numbers live in different places', body: 'Orders, refunds, VAT, product costs, ad spend and traffic rarely add up to one trusted figure.' },
    { icon: Scale, title: 'Decisions rest on instinct', body: 'Price, cost and marketing changes are usually tried live, with real money, to see what happens.' },
    { icon: Gauge, title: 'Insight arrives too late', body: 'Reports describe last month. The decision about this month has to be made before they are ready.' },
  ],
  comparison: [
    { dashboard: 'Shows what happened', saleslab: 'Explains why it happened, with evidence', status: 'planned' as Status },
    { dashboard: 'Reports past numbers', saleslab: 'Tests what could happen next', status: 'planned' as Status },
    { dashboard: 'Leaves the choice to guesswork', saleslab: 'Compares options and recommends with reasons', status: 'planned' as Status },
    { dashboard: 'Stops at the chart', saleslab: 'Keeps tracking results after a decision', status: 'partial' as Status },
  ],
  values: [
    { icon: CircleDollarSign, title: 'A trustworthy profit picture', body: 'One tested calculation engine. Values that cannot be calculated show as Unavailable instead of a guess.', status: 'available' as Status },
    { icon: Brain, title: 'Faster understanding', body: 'Plain-language explanations of what changed and the likely causes behind it.', status: 'planned' as Status },
    { icon: FlaskConical, title: 'Safer decisions', body: 'Options are evaluated on the business’s own numbers before anything is applied.', status: 'planned' as Status },
    { icon: Target, title: 'Accountable recommendations', body: 'Suggested actions come with reasons the owner can check, then be monitored.', status: 'planned' as Status },
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
    today: 'One fictional demo store (September 2026) in PostgreSQL. Connecting a company’s own data is not built yet.',
  },
  {
    id: 'processing', title: 'Data Processing', icon: Workflow, status: 'available',
    summary: 'Raw records become dependable inputs: historical snapshots, VAT split, store-local days.',
    does: ['Uses the price and cost recorded at the time of sale, not today’s catalog', 'Splits VAT from revenue and counts refunds on their own dates', 'Groups days in the store’s timezone and flags missing data'],
    receives: 'Business Data', hands: 'Validated inputs for the financial engine',
    value: 'Later numbers are right because the inputs are right.',
    today: 'Working. Historical snapshots, VAT handling, refund dating and timezone-aware daily grouping are implemented and tested.',
  },
  {
    id: 'analytics', title: 'Financial Analytics', icon: BarChart3, status: 'available',
    summary: 'Revenue, cost of goods, profit, margins, conversion and break-even from one engine.',
    does: ['Calculates revenue, gross profit and operating profit with exact decimal arithmetic', 'Breaks results down by day, product and expense category', 'Reports completeness so partial data is never presented as complete'],
    receives: 'Processed records', hands: 'Trusted figures for people and, later, for AI',
    value: 'A single version of the financial truth.',
    today: 'Working. Served through the finance and analytics APIs and shown in the Dashboard and Analytics views.',
  },
  {
    id: 'ai', title: 'AI Analysis', icon: Brain, status: 'planned',
    summary: 'Reads the analytics, spots what changed and explains likely causes with the evidence behind them.',
    does: ['Interprets results in the context of the business', 'Turns figures into plain-language explanations', 'Shows which numbers support each explanation'],
    receives: 'Financial Analytics results', hands: 'Findings and hypotheses to test',
    value: 'Understanding in minutes instead of a day of spreadsheet work.',
    today: 'Not built. The repository contains no AI integration.',
  },
  {
    id: 'simulation', title: 'Scenario Simulation', icon: FlaskConical, status: 'planned',
    summary: 'Tests “what if” changes to price, cost or marketing budget before they are applied.',
    does: ['Estimates the likely effect of a proposed change', 'Runs what-if analysis on the business’s own history', 'Makes the trade-offs of a decision visible'],
    receives: 'Findings and the owner’s ideas', hands: 'Expected outcomes for each option',
    value: 'Mistakes are made on paper, not with real money.',
    today: 'Not built. No simulation work exists in the repository.',
  },
  {
    id: 'recommendations', title: 'Decision Recommendations', icon: Target, status: 'planned',
    summary: 'Compares strategies and finds options that meet a goal, each with reasons.',
    does: ['A/B Arena compares alternative strategies side by side', 'Goal Optimizer looks for actions that reach a stated goal under constraints', 'The AI Decision Assistant explains the recommendation'],
    receives: 'Simulated outcomes and the owner’s goals', hands: 'A short list of justified options',
    value: 'The owner stays in charge and decides with evidence.',
    today: 'Not built. The sidebar lists these modules as Planned and disabled.',
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
    id: 'simulation', title: 'Simulation Lab', icon: FlaskConical, status: 'planned',
    tagline: 'Evaluate a decision before applying it.', question: 'What happens if I change this?',
    mvp: [],
    vision: ['Evaluate scenarios before a decision is applied', 'Estimate the likely effect of price, cost and marketing-budget changes', 'What-if analysis on the business’s own numbers'],
  },
  {
    id: 'arena', title: 'A/B Arena', icon: Split, status: 'planned',
    tagline: 'Put alternative strategies side by side.', question: 'Which of these two strategies is better for us?',
    mvp: [],
    vision: ['Compare alternative business strategies', 'Evaluate Scenario A against Scenario B', 'Analyze the expected result of each decision'],
  },
  {
    id: 'optimizer', title: 'Goal Optimizer', icon: Target, status: 'planned',
    tagline: 'Start from the goal and work back to the actions.', question: 'What should we do to reach this goal?',
    mvp: [],
    vision: ['Optimize toward goals the user sets', 'Target profitability, growth and efficiency scenarios', 'Evaluate recommended actions under constraints'],
  },
  {
    id: 'assistant', title: 'AI Decision Assistant', icon: Bot, status: 'planned',
    tagline: 'Explains the data and the options in plain language.', question: 'Why is this happening, and what should I do next?',
    mvp: [],
    vision: ['Interpret business data in context', 'Turn analytic results into clear explanations', 'Give justified recommendations the owner can check', 'Weigh analysis, simulation and optimization results together'],
  },
];

/* ── Example business scenario (all numbers are illustrative) ─────────── */

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
  situation: 'An online home-goods store grows revenue for three months. The owner is pleased, until the bank balance does not follow. How would saleslab.AI work through it?',
  disclaimer: 'All numbers in this scenario are illustrative. Steps 3–7 describe planned modules, so their outputs are examples of the kind of result the product is designed to give, not real AI output.',
  steps: [
    {
      id: 'see', module: 'Dashboard', icon: LayoutDashboard, status: 'available',
      headline: 'The dashboard makes the problem visible',
      body: 'Revenue and operating margin sit side by side. Sales are up, margin has dropped.',
      today: 'Working today for any chosen period. A side-by-side change against the previous period is planned.',
      visual: { kind: 'metrics', items: [
        { label: 'Revenue', before: '$100,000', after: '$118,000', tone: 'good' },
        { label: 'Operating margin', before: '22%', after: '15%', tone: 'bad' },
        { label: 'Advertising share of revenue', before: '12%', after: '19%', tone: 'bad' },
      ] },
    },
    {
      id: 'dig', module: 'Business Analytics', icon: BarChart3, status: 'available',
      headline: 'Analytics inspects costs and sales',
      body: 'Daily revenue against operating expenses, the expense breakdown and product margins show which costs grew fastest.',
      today: 'Working today: revenue vs operating expenses, expense breakdown and product tables. Written insights are planned.',
      visual: { kind: 'bars', caption: 'Growth over the period (illustrative)', rows: [
        { label: 'Revenue', value: 18, display: '+18%', tone: 'good' },
        { label: 'Advertising spend', value: 45, display: '+45%', tone: 'bad' },
        { label: 'Discounts given', value: 30, display: '+30%', tone: 'bad' },
        { label: 'Shipping cost', value: 9, display: '+9%', tone: 'neutral' },
      ] },
    },
    {
      id: 'explain', module: 'AI Decision Assistant', icon: Bot, status: 'planned',
      headline: 'AI explains likely causes, with evidence',
      body: 'The assistant connects the changes, ranks the likely causes and points to the numbers that support each one.',
      today: 'Planned. Nothing here is real AI output.',
      visual: { kind: 'findings', items: [
        { title: 'Advertising grew much faster than the sales it brought in', evidence: 'Ad spend +45% against revenue +18%' },
        { title: 'Discounts concentrate on two best-selling products', evidence: 'Those products carry the lowest gross margins' },
      ] },
    },
    {
      id: 'simulate', module: 'Simulation Lab', icon: FlaskConical, status: 'planned',
      headline: 'Simulation Lab tests alternatives',
      body: 'Before touching anything, the owner asks what happens if ad spend is cut or prices on low-margin items are raised.',
      today: 'Planned. The figures are examples.',
      visual: { kind: 'table', caption: 'What-if results (illustrative)', columns: ['Change', 'Revenue', 'Operating margin'], rows: [
        { cells: ['No change', '$118,000', '15%'] },
        { cells: ['Cut ad spend by 20%', '$113,500', '18%'] },
        { cells: ['Raise low-margin prices by 5%', '$110,000', '19%'] },
      ] },
    },
    {
      id: 'compare', module: 'A/B Arena', icon: Split, status: 'planned',
      headline: 'A/B Arena compares the strategies',
      body: 'Two complete strategies are compared on expected margin and on the risk each one carries.',
      today: 'Planned. The figures are examples.',
      visual: { kind: 'table', caption: 'Strategy A vs B (illustrative)', columns: ['', 'A: reduce ads', 'B: adjust prices'], rows: [
        { cells: ['Expected margin', '18%', '19%'] },
        { cells: ['Expected revenue change', '−4%', '−7%'] },
        { cells: ['Main risk', 'Fewer new customers', 'Price-sensitive buyers leave'] },
      ] },
    },
    {
      id: 'optimize', module: 'Goal Optimizer', icon: Target, status: 'planned',
      headline: 'Goal Optimizer fits the options to the goal',
      body: 'The owner states a goal and limits. The optimizer keeps only the options that satisfy both.',
      today: 'Planned. The figures are examples.',
      visual: { kind: 'table', caption: 'Goal: operating margin of at least 20%, revenue loss of at most 5% (illustrative)', columns: ['Option', 'Margin', 'Revenue loss', 'Fits goal'], rows: [
        { cells: ['Cut ads 15% and adjust prices 3%', '20%', '−4%', 'Yes'], highlight: true },
        { cells: ['Cut ads 20% only', '18%', '−4%', 'No'] },
        { cells: ['Adjust prices 5% only', '19%', '−7%', 'No'] },
      ] },
    },
    {
      id: 'decide', module: 'You decide', icon: SlidersHorizontal, status: 'partial',
      headline: 'The owner reviews and decides',
      body: 'The recommendation arrives with its reasoning. The owner decides, and monitoring then checks the result against what was expected.',
      today: 'KPI monitoring works today. Recommendations and expected-versus-actual tracking are planned.',
      visual: { kind: 'checklist', items: [
        { label: 'Review the recommended option and its reasons', done: false },
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
      details: ['Calls the API and validates every response with a typed schema', 'Formats numbers for display and never recalculates money, margins or totals', 'Shared design system with light and dark themes'],
    },
    {
      id: 'api', title: 'API', subtitle: 'FastAPI', icon: Server, status: 'available',
      details: ['/api/analytics/dashboard: one consistent reporting snapshot', '/api/finance/summary: the authoritative financial report', '/api/products and /api/expenses: store records', '/health: liveness check', 'Clear 503, 404 and 422 errors instead of fallback data'],
    },
    {
      id: 'engine', title: 'Financial engine', subtitle: 'Exact decimal arithmetic', icon: CircleDollarSign, status: 'available',
      details: ['Pure calculations with no web or database code inside', 'Two-decimal money with ROUND_HALF_UP; unknown inputs stay null', 'Revenue, cost of goods, gross and operating profit, margins, break-even'],
    },
    {
      id: 'database', title: 'Data layer', subtitle: 'PostgreSQL · Alembic', icon: Database, status: 'available',
      details: ['Nine models in a dedicated schema with constraints and indexes', 'Versioned migrations and a repeatable synthetic seed', 'Supabase is the intended host; a live Supabase connection is not verified yet'],
    },
    {
      id: 'planned', title: 'AI, simulation and optimization', subtitle: 'Planned services', icon: Rocket, status: 'planned',
      details: ['No technical design exists yet in the project documentation', 'Intent: follow the same boundary as today’s components. The browser talks only to the API, and credentials stay on the server', 'Models, methods and data contracts are not decided and are intentionally not specified here'],
      note: 'Design intent, not a specification.',
    },
  ],
  security: {
    today: [
      'Database credentials live only on the server and never in browser variables',
      'Database connections require SSL by default',
      'The API serves only the fixed demo store; unknown query parameters are rejected',
      'Each data request uses a read-only transaction with one consistent snapshot',
      'Browser origins are allowed only from an explicit list',
    ],
    notYet: ['User accounts and authentication', 'Permissions for multiple real businesses', 'Hosted production deployment'],
  },
};

/* ── MVP vs final product ─────────────────────────────────────────────── */

export interface Capability {
  id: string;
  area: 'Data and engine' | 'API' | 'Interface' | 'Quality' | 'Decision modules' | 'Platform';
  title: string;
  description: string;
  status: Status;
  /** Repository files that exist for this capability (available/partial only). */
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
  { id: 'states', area: 'Interface', status: 'available', title: 'Loading, error, empty and incomplete-data states', description: 'The interface says when data is loading, missing or incomplete instead of showing guesses.', evidence: ['tests/e2e/dashboard.spec.ts'] },
  { id: 'design', area: 'Interface', status: 'available', title: 'Design system with light/dark themes', description: 'Shared tokens, accent, density and motion preferences, and a responsive shell.', evidence: ['src/design-system/tokens.css', 'src/components/layout/app-shell.tsx'] },
  { id: 'tests', area: 'Quality', status: 'available', title: 'Automated tests and CI workflow', description: 'Backend, frontend and browser tests. The Phase 04 report records 279 backend, 34 frontend and 18 browser tests passing (macOS, PostgreSQL 16.2).', evidence: ['backend/tests/test_api.py', 'tests/e2e/dashboard.spec.ts', '.github/workflows/verify.yml', 'docs/phase-04-report.md'] },
  { id: 'monitoring', area: 'Decision modules', status: 'partial', title: 'KPI monitoring over time', description: 'KPIs can be tracked over rolling and custom periods. Comparing results with expectations is not built.', evidence: ['src/components/reporting-filter.tsx'] },
  { id: 'own-data', area: 'Data and engine', status: 'planned', title: 'Connecting a business’s own data', description: 'Importing or syncing real sales and cost records. The MVP reads one fictional demo store.' },
  { id: 'ai-analysis', area: 'Decision modules', status: 'planned', title: 'AI analysis and decision assistant', description: 'Contextual interpretation, explanations with evidence and justified recommendations.' },
  { id: 'simulation', area: 'Decision modules', status: 'planned', title: 'Simulation Lab', description: 'What-if analysis for price, cost and marketing-budget changes.' },
  { id: 'arena', area: 'Decision modules', status: 'planned', title: 'A/B Arena', description: 'Side-by-side comparison of alternative strategies and their expected outcomes.' },
  { id: 'optimizer', area: 'Decision modules', status: 'planned', title: 'Goal Optimizer', description: 'Optimization toward user-set goals under constraints.' },
  { id: 'auth', area: 'Platform', status: 'planned', title: 'Authentication and multi-business access', description: 'Accounts and permissions for real tenants. The project documents these as a later phase.' },
  { id: 'hosting', area: 'Platform', status: 'planned', title: 'Hosted production deployment', description: 'Public deployment with a hosted database. A live Supabase connection has not been verified.' },
];

export const verification = {
  verified: 'Recorded in docs/phase-04-report.md: 279 backend, 34 frontend and 18 browser tests passed on macOS with PostgreSQL 16.2.',
  notVerified: 'Not verified: a live Supabase connection, hosted deployment, and execution on Windows with a real database.',
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
    message: 'A decision-support system for retail and e-commerce that explains performance, tests options before money is spent and recommends actions with reasons.',
    points: ['Built on financial figures the owner can trust', 'Designed to explain and advise, not only to display', 'Today: a working MVP with a tested financial core'],
    details: { title: 'What the MVP contains', items: ['React and TypeScript web app on a FastAPI backend', 'PostgreSQL data model with a fictional demo store', 'Exact-decimal financial engine and analytics API', 'Dashboard and analytics views with period filters'] },
  },
  {
    id: 'problem', label: 'Problem', title: 'Growth can hide a profit problem',
    message: 'Owners watch sales rise and assume all is well, while costs, discounts, returns and ad spend tell a different story from different places.',
    points: ['Profit and sales do not always move together', 'Financial data is scattered', 'Decisions are tested live, with real money'],
    details: { title: 'Why it persists', items: ['Revenue, VAT, refunds, product costs and ad spend sit in separate tools', 'Reports are retrospective, decisions are forward-looking', 'Small businesses rarely have an analyst to connect the pieces'] },
  },
  {
    id: 'solution', label: 'Solution', title: 'A system that supports the decision, not just the report',
    message: 'saleslab.AI is positioned as a decision system. It starts from trustworthy financials and extends to explanation, simulation and recommendation.',
    points: ['One consistent financial truth (working today)', 'Explanations with evidence (planned)', 'Decisions tested before they are made (planned)', 'Recommendations with reasons (planned)'],
    details: { title: 'Positioning', items: ['Not a generic analytics dashboard', 'The owner always makes the final decision', 'Every recommendation is designed to show its reasoning'] },
  },
  {
    id: 'workflow', label: 'Workflow', title: 'Seven connected stages, one flow',
    message: 'Data flows from the business through processing and analytics to AI analysis, simulation and recommendations, then back through monitoring.',
    points: ['Three stages work today: processing, analytics and KPI monitoring', 'Each stage hands its result to the next', 'Select a stage to see what it does'],
    details: { title: 'Technical architecture', items: ['Web app calls a FastAPI service', 'The API uses a decimal financial engine and PostgreSQL', 'Planned AI components are not yet designed'] },
  },
  {
    id: 'features', label: 'Features', title: 'Six modules, one purpose: better decisions',
    message: 'Two modules work in the MVP. Four decision modules form the vision for the full product.',
    points: ['Dashboard and Business Analytics: available', 'Simulation Lab, A/B Arena, Goal Optimizer, AI Decision Assistant: planned', 'Each module answers a specific owner question'],
    details: { title: 'Per-module detail', items: ['Open a module card for what exists today and what is planned', 'Sidebar shows planned modules as disabled, never as working features'] },
  },
  {
    id: 'scenario', label: 'Business scenario', title: 'Example: sales up, profit down',
    message: 'Follow one problem through the whole product, from noticing it to monitoring the decision. All numbers are illustrative.',
    points: ['Steps 1–2 use features that work today', 'Steps 3–7 show the planned modules', 'Illustrative numbers, not real AI output'],
    details: { title: 'How to read the scenario', items: ['Each step shows whether its module is available or planned', 'Use Play to run the walkthrough automatically'] },
  },
  {
    id: 'vision', label: 'MVP vs vision', title: 'What works today, and what comes next',
    message: 'The foundation is built and tested. The decision modules are the road ahead, and are clearly separated here.',
    points: ['Available: data model, financial engine, APIs, dashboard, analytics', 'Planned: AI, simulation, A/B Arena, optimizer, own-data connection, accounts, hosting', 'Verification status is stated openly'],
    details: { title: 'Verification', items: [verification.verified, verification.notVerified] },
  },
];
