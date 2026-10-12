# Phase 03 — Financial Calculation Engine

The financial endpoint calculates the synthetic demo store's historical results from PostgreSQL. It uses Decimal throughout, preserves unknown values as `null`, and separates business revenue from collected VAT. The result is a management operating-profit report, not accounting net profit, a tax return, or a sales forecast.

## Architecture

`GET /api/finance/summary` → `FinanceService` → scoped finance repository → `FinancialInput` → `calculate_financials` → `FinanceSummary`.

- `backend/app/services/finance/types.py` contains validated Pydantic inputs and results. Decimal inputs accept Decimal, integer or decimal strings; floats and booleans are rejected as money.
- `calculations.py` contains pure arithmetic and refund-history validation, without SQLAlchemy or HTTP imports. Calculations can run independently of PostgreSQL.
- `backend/app/repositories/finance.py` selects transaction snapshots, refunds, traffic and costs. It does not read current product prices for calculations.
- `backend/app/services/financial_reporting.py` resolves the authorized demo store and attaches currency, dates and provenance.
- `backend/app/api/finance.py` validates request filters and returns decimal strings. The existing request session provides one read-only, repeatable-read snapshot across queries.
- React calls the finance endpoint and shows six existing-style KPI cards: revenue, gross profit, operating profit, operating expenses, operating margin and conversion. Unknown values display **Unavailable**, with completeness warnings.

No authentication, write API, AI, simulation, optimization or experimentation functionality was added.

## Money and VAT

Currency precision is **two decimal places**, with `ROUND_HALF_UP`. Each transaction line is split and rounded before aggregation. Arithmetic runs in a local Decimal context with precision 50, independent of the caller's rounding context. JSON represents money and percentages as decimal strings, including negative amounts. Frontend numeric conversion is for display only.

For a stored percentage `r` (20 means 20%, not 0.20), line quantity `q`, unit-price snapshot `p`, and whole-line discount `d`:

```text
unadjusted line amount = q × p
discounted line amount = q × p − d
VAT-inclusive amount A: exclusive = round(A / (1 + r / 100))
                        VAT       = round(A) − exclusive
VAT-exclusive amount A: exclusive = round(A)
                        VAT       = round(A × r / 100)
```

The discount has the same tax basis as its line price. Gross sales and discounted sales are separately split; the exclusive discount is their difference, preserving the cent-level identity `gross_sales − discounts = vat_exclusive_sales_revenue`. VAT is computed after discount. Different items can have different rates and tax bases.

For example, two items at 120.00 including 20% VAT, with a 24.00 line discount, produce exclusive gross sales 200.00, discount 20.00, revenue 180.00 and VAT 36.00. A later refund of 54.00 including the original 20% VAT reduces revenue by 45.00 and collected VAT by 9.00.

These arithmetic conventions follow the inclusive/exclusive relationship illustrated in [GOV.UK's VAT calculation guidance](https://www.gov.uk/charge-reclaim-record-vat) and taxation of discounted prices described in [its discount guidance](https://www.gov.uk/charge-reclaim-record-vat/vat-on-discounts-and-gifts). The application uses stored transaction rates; it does not infer a jurisdiction or apply UK tax rules to the synthetic USD store. Invoice-level rounding, input-VAT recovery and tax filing rules require later validation for each merchant.

## Metric definitions

All amounts below are in the store currency. Sales and refunds are VAT-exclusive unless a VAT field is named explicitly.

| API field | Definition |
| --- | --- |
| `gross_sales` | Merchandise sales before discounts and returns, excluding customer shipping. |
| `discounts` | Exclusive gross sales less exclusive discounted merchandise sales. |
| `vat_exclusive_sales_revenue` | Merchandise revenue after discounts, before refunds. |
| `customer_shipping_revenue` | Charges to customers, separately VAT-split from order shipping snapshots. |
| `vat_collected_sales` | VAT on discounted merchandise plus customer shipping in the period. |
| `refunds` | Completed merchandise refund events, positive deduction from revenue. |
| `vat_refunded` | VAT component of those refund events. |
| `net_vat_collected` | `vat_collected_sales − vat_refunded`; informational, not tax payable. |
| `net_sales_revenue`, `revenue` | Equal aliases: discounted merchandise revenue + customer shipping revenue − refunds. |
| `cogs_before_returns` | Sum of sold quantity × historical unit-cost snapshot. |
| `cogs_reversed` | Sum of explicitly restocked quantity × original unit-cost snapshot. |
| `cogs` | `cogs_before_returns − cogs_reversed`. |
| `gross_profit` | `revenue − cogs`. |
| `gross_profit_margin` | `gross_profit / revenue × 100`. |
| `contribution_profit` | Gross profit − carrier shipping − platform fees − advertising. |
| `contribution_margin` | `contribution_profit / revenue × 100`. |
| `employee_expenses` | `Expense.employee_costs`. |
| `rent_expenses` | `Expense.rent`. |
| `shipping_expenses` | `Expense.shipping`, representing carrier costs. |
| `platform_fees` | Explicit `Expense.platform_fees` rows; no estimated percentage. |
| `other_operating_expenses` | `Expense.software + Expense.miscellaneous`. |
| `operating_expenses` | Employee + rent + carrier shipping + platform fees + other expenses; excludes ads and COGS. |
| `advertising_expenditure` | Only `AdSpend.amount`. |
| `total_expenses` | Operating expenses + advertising; excludes COGS. |
| `operating_profit` | Gross profit − operating expenses − advertising. |
| `operating_profit_margin` | `operating_profit / revenue × 100`. |
| `order_count` | Orders originating in the period with a recognized status; returns do not subtract an order. |
| `visitors` | Sum of recorded daily visitors, not unique monthly people or sessions. |
| `conversion_rate` | `order_count / visitors × 100`, rounded to two decimals, only with full traffic-day coverage. |
| `average_order_value` | Net period revenue / period order count, including period refund effects. |
| `break_even_order_quantity` | Ceiling of fixed costs × order count / contribution profit, using the observed period mix. |

Margins are `null` when revenue is zero, negative or unknown. Negative profit and margins are preserved when revenue is positive. AOV is `null` when order count is zero or revenue unknown. With complete traffic coverage, zero orders and zero visitors gives conversion 0.00; positive orders with zero visitors gives `null` and a warning. Missing traffic dates always give conversion `null`. Conversion may exceed 100% because it is an order-to-visit ratio, not a deduplicated shopper probability.

For break-even, fixed costs are employee + rent + software + miscellaneous; carrier shipping, platform fees and advertising are treated as variable per observed order. It is `null` with no orders, unknown inputs or nonpositive contribution; zero fixed cost with positive contribution yields zero orders. No intermediate per-order rounding is used before ceiling. The fixed-cost/contribution principle is described by [OpenStax managerial accounting](https://openstax.org/books/principles-managerial-accounting/pages/3-2-calculate-a-break-even-point-in-units-and-dollars). Treating these particular categories as fixed/variable and preserving the period's basket mix are **application assumptions requiring merchant validation**. Missing traffic alone does not prevent a monetary break-even calculation.

## Expense policy and accounting assumptions

`AdSpend` is authoritative even when it has no rows. Advertising entries in `Expense` are bookkeeping mirrors and are always excluded; there is no fallback to that ledger, estimate, or addition of both sources. Other cost categories enter the appropriate bucket once. Stored expense and unit-cost amounts are assumed to be the merchant's booked costs, already on the intended accounting basis. The engine does not remove potentially recoverable input VAT from expenses or COGS.

Customer shipping is revenue from order snapshots; carrier shipping is a cost from expenses. The demo explicitly charges customers zero shipping and has carrier costs. Zero platform fees means no booked platform-fee rows, not proof that a merchant has none. Completeness indicators cannot detect a bill, campaign, sale or refund that was never recorded.

Operating profit excludes income taxes, interest, unrecorded depreciation, financing, inventory valuation adjustments and other unmodelled accounting entries. It must not be presented as accounting net profit. Costs use their stored expense/spend date, without accrual schedules or allocation of monthly rent across days.

## Historical orders and refunds

Recognized order statuses are `completed`, `partially_refunded`, `refunded` and `returned`. Original merchandise sales remain on the original order date, including refunded orders. `pending` and `cancelled` orders are excluded. Refund events are included only when their status is `completed` and their parent order has a recognized status; pending/cancelled refund events are excluded.

`Refund` stores an event timestamp, positive amount, explicit tax basis, returned quantity and optional restocked quantity. Its composite foreign key requires an item from the same store. The original OrderItem supplies VAT rate and cost. Quantity zero supports a price-only refund. A return reverses COGS only for explicitly restocked units; a known zero restock leaves costs incurred. Unknown restock for a physical return makes COGS and dependent profit unknown. A refund-only interval can have negative revenue and negative COGS reversals without division errors.

For items refunded in a report, the repository validates the entire completed refund ledger against the original line: cumulative returned quantity cannot exceed sold quantity, and cumulative refunded cash cannot exceed original discounted cash including VAT. A completed refund cannot precede its original sale timestamp. Invalid histories produce a clear `503 invalid_financial_history` instead of a misleading report. Unknown tax basis prevents the amount comparison and produces a completeness warning, even if the ambiguous sale/refund lies outside the requested period. Current metrics whose own tax basis is known remain calculable; unknown current monetary inputs propagate to nulls. Direct database writes remain possible; there is no transaction ingestion or refund-writing API in this phase.

Each refund event is independently rounded like a credit-note line. Multiple partial refunds can therefore leave a cent-level VAT/revenue residual even when their total cash exactly refunds the sale. For example, an inclusive 1.00 sale at 20% records 0.83 revenue and 0.17 VAT; two inclusive 0.50 refunds each record 0.42 revenue and 0.08 VAT, leaving −0.01 net revenue and +0.01 net VAT. This is accepted and tested, rather than rejected as an over-refund or silently reallocating a posted event. Cumulative invoice/credit-note allocation is outside this phase and must be reconciled against actual invoices before accounting use.

An order marked returned/refunded without any completed refund event does **not** generate a guessed refund from its price. Its refund amount, VAT adjustment and COGS reversal remain unknown. Without an event date, it conservatively flags reporting periods ending after the original order date, including periods after the sale. A posted ledger is authoritative; the engine does not infer missing partial amounts from a status label.

Only merchandise refunds are represented. Customer-shipping refunds, separate restocking dates, exchanges, chargebacks, currency conversion, invoice VAT reconciliation, cost layers and inventory movements require additional records and rules later. Operators must not encode shipping refunds as merchandise refunds or infer them from a returned status.

## Reporting and access

```http
GET /api/finance/summary
GET /api/finance/summary?start_date=2026-09-01&end_date=2026-09-30
```

Provide both dates or neither. Defaults remain September 1–30, 2026. Public dates are inclusive. Orders and refunds use store-local midnight at the start and midnight following the end, converted independently to UTC: `[start, end + 1 day)`. This preserves 23/25-hour days across daylight-saving changes. Expenses, advertising and traffic use their stored local calendar date inclusively. Refunds are selected by refund event date even if the original sale occurred earlier. Reports therefore reflect later refunds in later periods.

The endpoint accepts no organization/store selector. The service resolves the fixed demo IDs and requires both organization and store `is_demo` flags. Unknown query parameters, partial/invalid/reversed dates return 422. An unseeded or non-demo scope returns 404; connection/schema problems return 503 without exposing credentials. Health remains a liveness check only.

`/api/dashboard/summary` remains the deprecated **Phase 02 compatibility contract**: completed merchandise orders using its original tax-exclusive convention, without returns or customer shipping. Its shape and tests remain unchanged. It is not suitable for new mixed-tax or refund data; use `/api/finance/summary` for financial reporting. Its common figures agree with the unchanged seed. Products and expense-list endpoints remain available.

## Completeness and empty periods

`data_completeness` reports `is_complete`, human-readable `warnings`, counts of missing VAT basis, refund records, shipping information, restock quantities and order-item snapshots, plus observed/expected traffic days. Unknown essential inputs propagate to affected metrics as `null`; independently known expenses or COGS can still be returned. An explicit shipping amount of zero requires no tax basis to establish zero revenue.

Empty periods return zero recorded money and orders, with `null` AOV, margins and break-even. If no traffic rows exist, they warn about traffic coverage and return conversion `null`. This distinguishes missing visitor measurements from recorded zero visits. `is_complete` means these detectable conditions passed, not a certified or reconciled general ledger.

## Schema migration and seed

Apply `alembic -c backend/alembic.ini upgrade head` using the configured backend connection. Revision `0002_financial_snapshots`, following `0001_retail_schema`, adds nullable tax-basis and customer-shipping fields, refund storage and constraints, platform-fee expenses, and wider order status storage. It performs no reset and creates no fabricated refund rows. Destructive downgrade remains disabled.

Only the deterministic Phase 02 seed item/order IDs in the correctly flagged demo organization/store receive known tax-exclusive and zero-customer-shipping metadata. Other existing records retain `NULL` ambiguity. Original monetary values, discounts, rates, costs and statuses are preserved. The additive seed writes explicit metadata for new seed records and retains existing records and operator edits on reruns. The September seed still contains 377 orders, 660 items and zero refund events. Refund behavior is exercised with separate test data.

## Verified example and tests

The complete database-derived response is saved in [phase-03-summary-example.json](phase-03-summary-example.json). Selected September results:

```json
{
  "revenue": "29371.63",
  "cogs": "10906.00",
  "gross_profit": "18465.63",
  "gross_profit_margin": "62.87",
  "operating_expenses": "6507.45",
  "advertising_expenditure": "1776.00",
  "operating_profit": "10182.18",
  "operating_profit_margin": "34.67",
  "average_order_value": "85.88",
  "break_even_order_quantity": 120,
  "order_count": 342,
  "visitors": 11635,
  "conversion_rate": "2.94",
  "currency": "USD",
  "reporting_period": {"start": "2026-09-01", "end": "2026-09-30"}
}
```

Pure tests use independent expected values for mixed VAT, inclusive/exclusive discounts, per-line rounding, refunds, restocking, negative/zero values, expenses, margins, AOV, conversion, break-even and incomplete inputs. Real PostgreSQL tests cover date/status selection, snapshots after catalog changes, cross-store isolation, API serialization, constraints and upgrading an existing Phase 02 database. Browser tests cover the real production dashboard, incomplete values, a real daily loss, errors/retry, empty periods and mobile width.

Run the existing README test commands with an explicitly isolated local `TEST_DATABASE_URL` to include database tests. Without it, PostgreSQL tests skip rather than using application data. The exact executed results, files and remaining environment limits are recorded in [phase-03-report.md](phase-03-report.md).
