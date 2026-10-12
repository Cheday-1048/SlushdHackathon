import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReactNode } from 'react';
import type { AnalyticsDashboard } from '../api/schemas';

// Number conversion is only for Recharts coordinates. The API owns all calculations.
export const chartNumber = (value: string | null) => value === null ? null : Number(value);
const dateTick = (value: string) => value.slice(5);
const compactTick = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
const COLORS = { revenue: 'var(--chart-1)', secondary: 'var(--chart-2)', visitors: 'var(--chart-3)', expense: 'var(--chart-4)' };

function ChartCard({ title, description, children, empty = false }: { title: string; description: string; children: ReactNode; empty?: boolean }) {
  return <section className="card chart-card" aria-label={title}>
    <h3>{title}</h3><p className="muted small">{description}</p>
    {empty ? <p className="chart-empty" role="status">No recorded activity for this chart.</p> : <div className="chart-frame" role="img" aria-label={`${title}. Values are available in the data tables below.`}>{children}</div>}
  </section>;
}

export function Analytics({ data }: { data: AnalyticsDashboard }) {
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.summary.currency, minimumFractionDigits: 2 });
  const number = new Intl.NumberFormat('en-US');
  const amount = (value: string | null) => value === null ? 'Unavailable' : currency.format(Number(value));
  const percentage = (value: string | null) => value === null ? 'Unavailable' : `${number.format(Number(value))}%`;
  const daily = data.daily.map((day) => ({ ...day, revenue: chartNumber(day.revenue), conversion_rate: chartNumber(day.conversion_rate), operating_expenses: Number(day.operating_expenses) }));
  const products = data.products.map((product) => ({ ...product, revenue: chartNumber(product.revenue) }));
  const expenses = data.expenses.map((expense) => ({ ...expense, amount: Number(expense.amount) }));
  const monetaryTooltip = (value: number | string | ReadonlyArray<number | string> | undefined) => typeof value === 'number' ? currency.format(value) : String(value ?? 'Unavailable');
  const noSales = daily.every((day) => day.order_count === 0 && day.revenue === 0);
  return <section id="analytics" className="analytics-section" aria-labelledby="analytics-heading">
    <div className="reporting-period"><h2 id="analytics-heading">Business analytics</h2><span className="muted small">{data.summary.currency} · {data.store_timezone}</span></div>
    <p className="muted small analytics-definition">Daily values use recorded dates in the store’s timezone. Gaps mean unavailable data. Expenses stay on their recorded dates; no daily or product allocation is estimated.</p>
    <div className="analytics-grid">
      <ChartCard title="Daily revenue trend" description={`Net revenue excluding VAT · ${data.summary.currency}`} empty={noSales}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={daily} margin={{ top: 16, right: 18, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={dateTick} minTickGap={28} /><YAxis tickFormatter={compactTick} /><Tooltip formatter={monetaryTooltip} />
            <Line dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Daily order trend" description="Sales orders on their original order date" empty={daily.every((day) => day.order_count === 0)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={daily} margin={{ top: 16, right: 18, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={dateTick} minTickGap={28} /><YAxis allowDecimals={false} /><Tooltip />
            <Bar dataKey="order_count" name="Orders" fill={COLORS.revenue} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Visitors and conversion rate" description="Visitors (left axis) · sales orders / visitors % (right axis)">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={daily} margin={{ top: 16, right: 0, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={dateTick} minTickGap={28} /><YAxis yAxisId="visitors" tickFormatter={compactTick} allowDecimals={false} /><YAxis yAxisId="conversion" orientation="right" tickFormatter={(value: number) => `${value}%`} width={52} /><Tooltip formatter={(value, name) => [name === 'Conversion rate' ? `${value}%` : value, name]} /><Legend />
            <Bar yAxisId="visitors" dataKey="visitors" name="Visitors" fill={COLORS.visitors} isAnimationActive={false} />
            <Line yAxisId="conversion" dataKey="conversion_rate" name="Conversion rate" stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Revenue versus operating expenses" description={`Operating expenses exclude advertising · ${data.summary.currency}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={daily} margin={{ top: 16, right: 18, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={dateTick} minTickGap={28} /><YAxis tickFormatter={compactTick} /><Tooltip formatter={monetaryTooltip} /><Legend />
            <Line dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="operating_expenses" name="Operating expenses" stroke={COLORS.expense} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Product sales performance" description={`Net merchandise revenue by SKU, excluding customer shipping · ${data.summary.currency}`} empty={products.length === 0}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={products} margin={{ top: 16, right: 18, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="sku" minTickGap={8} height={60} angle={-25} textAnchor="end" tick={{ fontSize: 10 }} /><YAxis tickFormatter={compactTick} /><Tooltip formatter={monetaryTooltip} />
            <Bar dataKey="revenue" name="Revenue" fill={COLORS.secondary} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Expense breakdown" description={`Recorded operating costs and advertising, counted once · ${data.summary.currency}`} empty={expenses.every((expense) => expense.amount === 0)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={expenses} layout="vertical" margin={{ top: 16, right: 18, left: 0, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={compactTick} /><YAxis dataKey="label" type="category" width={108} tick={{ fontSize: 11 }} /><Tooltip formatter={monetaryTooltip} />
            <Bar dataKey="amount" name="Expense" fill={COLORS.expense} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
    <details className="card data-table-panel daily-data"><summary>Daily analytics data</summary><div className="table-scroll" tabIndex={0} aria-label="Scrollable daily analytics data"><table aria-label="Daily analytics data"><thead><tr><th scope="col">Date</th><th scope="col">Revenue</th><th scope="col">Orders</th><th scope="col">Visitors</th><th scope="col">Conversion</th><th scope="col">Operating expenses</th><th scope="col">Advertising</th><th scope="col">Gross profit</th><th scope="col">Operating profit</th><th scope="col">Data status</th></tr></thead><tbody>{data.daily.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{amount(day.revenue)}</td><td>{number.format(day.order_count)}</td><td>{day.visitors === null ? 'Unavailable' : number.format(day.visitors)}</td><td>{percentage(day.conversion_rate)}</td><td>{amount(day.operating_expenses)}</td><td>{amount(day.advertising_expenditure)}</td><td>{amount(day.gross_profit)}</td><td>{amount(day.operating_profit)}</td><td>{day.data_completeness.is_complete ? 'Complete' : day.data_completeness.warnings.join(' ') || 'Incomplete'}</td></tr>)}</tbody></table></div></details>
    <section className="card data-table-panel" aria-labelledby="products-heading"><h3 id="products-heading">Product analytics</h3><p className="muted small">Sales and returns use transaction price and cost snapshots. Product names and SKUs are current catalog labels.</p>
      <p className="muted small">Customer shipping revenue is separate and is not assigned to products: {amount(data.unallocated_customer_shipping_revenue)}. Operating expenses and advertising are not allocated to products.</p>
      {data.product_warnings.length > 0 && <div className="notice mock-notice" role="alert"><div><strong>Product data limitations</strong>{data.product_warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
      {data.products.length === 0 ? <p className="table-empty" role="status">No product sales or returns in this reporting period.</p> : <div className="table-scroll" tabIndex={0} aria-label="Scrollable product analytics"><table aria-label="Product analytics"><thead><tr><th scope="col">Product / SKU</th><th scope="col">Units sold</th><th scope="col">Units returned</th><th scope="col">Revenue</th><th scope="col">Historical COGS</th><th scope="col">Gross profit</th><th scope="col">Gross margin</th><th scope="col">Data status</th></tr></thead><tbody>{data.products.map((product) => <tr key={product.product_id}><th scope="row">{product.name}<span className="muted small table-sku">{product.sku}</span></th><td>{number.format(product.units_sold)}</td><td>{number.format(product.units_returned)}</td><td>{amount(product.revenue)}</td><td>{amount(product.cogs)}</td><td>{amount(product.gross_profit)}</td><td>{percentage(product.gross_profit_margin)}</td><td>{product.data_completeness.is_complete ? 'Complete' : product.data_completeness.warnings.join(' ') || 'Incomplete'}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="card data-table-panel" aria-labelledby="expenses-heading"><h3 id="expenses-heading">Expense overview</h3><p className="muted small">Advertising comes from recorded ad spend. The advertising ledger mirror is excluded. Shipping here is carrier cost.</p><div className="table-scroll" tabIndex={0} aria-label="Scrollable expense overview"><table aria-label="Expense overview"><thead><tr><th scope="col">Category</th><th scope="col">Amount ({data.summary.currency})</th></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.category}><th scope="row">{expense.label}</th><td>{amount(expense.amount)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Operating expenses (excluding ads)</th><td>{amount(data.summary.operating_expenses)}</td></tr><tr><th scope="row">Total expenses (including ads)</th><td>{amount(data.summary.total_expenses)}</td></tr></tfoot></table></div></section>
  </section>;
}
