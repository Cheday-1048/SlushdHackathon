"""Independent arithmetic and edge cases for the read-only aggregate model."""

from decimal import Decimal, ROUND_DOWN, localcontext

import pytest
from pydantic import ValidationError

from app.services.finance import (
    ExpenseEntry, FinancialInput, RefundLine, SaleLine, ShippingCharge, calculate_financials,
)
from app.services.simulation import ScenarioParameters, SimulationCalculation, simulate

D = Decimal


def baseline(**overrides):
    """200 orders: 90,000 discounted merchandise + 2,000 customer shipping.

    All prices include 20% VAT; COGS is 40,000, booked OPEX 19,000 and
    authoritative advertising 4,000. Historical operating profit is 29,000.
    """
    data = dict(
        sales=[SaleLine(
            quantity=200, unit_price="600", discount_amount="12000", vat_rate="20",
            unit_cost_snapshot="200", price_includes_vat=True,
        )],
        shipping=[ShippingCharge(amount="2400", vat_rate="20", price_includes_vat=True)],
        expenses=[
            ExpenseEntry(category="employee_costs", amount="10000"),
            ExpenseEntry(category="rent", amount="5000"),
            ExpenseEntry(category="shipping", amount="2000"),
            ExpenseEntry(category="platform_fees", amount="1000"),
            ExpenseEntry(category="software", amount="1000"),
            ExpenseEntry(category="advertising", amount="999999"),
        ],
        ad_spend=[D("4000")], order_count=200, visitors=10000,
        traffic_days=30, period_days=30,
    )
    data.update(overrides)
    return calculate_financials(FinancialInput(**data))


def scenario(**changes):
    result = simulate(baseline(), ScenarioParameters(**changes))
    assert result.status == "ready"
    assert result.simulated is not None and result.differences is not None
    return result


def test_identity_reconciles_every_shared_metric_with_financial_engine():
    historical = baseline()
    result = simulate(historical, ScenarioParameters())
    assert historical.revenue == D("92000.00")
    assert historical.operating_profit == D("29000.00")
    assert result.status == "ready"
    assert result.simulated is not None and result.differences is not None
    for field in (
        "revenue", "cogs", "gross_profit", "gross_profit_margin", "contribution_profit",
        "contribution_margin", "operating_expenses", "advertising_expenditure", "operating_profit",
        "operating_profit_margin", "customer_shipping_revenue", "shipping_expenses", "platform_fees",
        "employee_expenses", "rent_expenses", "other_operating_expenses", "total_expenses",
    ):
        assert getattr(result.simulated, field) == getattr(historical, field), field
    assert result.simulated.expected_orders == D("200.000000")
    assert result.simulated.expected_visitors == D("10000.000000")
    assert result.simulated.assumed_conversion_rate == D("2.000000")
    assert result.simulated.conversion_rate_source == "historical_ratio"
    assert result.differences.model_dump() == {
        "revenue": D("0.00"), "operating_profit": D("0.00"), "gross_profit": D("0.00"),
        "orders": D("0.000000"), "revenue_change_pct": D("0.00"), "profit_change_pct": D("0.00"),
    }


def test_identity_uses_exact_counts_instead_of_rounded_report_conversion():
    historical = baseline(order_count=342, visitors=11635)
    assert historical.conversion_rate == D("2.94")
    result = simulate(historical, ScenarioParameters())
    assert result.simulated.expected_orders == D("342.000000")
    assert result.simulated.assumed_conversion_rate == D("2.939407")
    assert result.simulated.revenue == historical.revenue
    assert result.simulated.operating_profit == historical.operating_profit


@pytest.mark.parametrize("changes,revenue,cogs,profit,orders", [
    ({"selling_price_change_pct": "10"}, "101000.00", "40000.00", "38000.00", "200.000000"),
    ({"discount_pct": "10"}, "83000.00", "40000.00", "20000.00", "200.000000"),
    ({"selling_price_change_pct": "10", "discount_pct": "10"}, "91100.00", "40000.00", "28100.00", "200.000000"),
    ({"expected_conversion_rate": "2.5"}, "115000.00", "50000.00", "41250.00", "250.000000"),
    ({"visitor_change_pct": "50"}, "138000.00", "60000.00", "53500.00", "300.000000"),
    ({"unit_cost_change_pct": "25"}, "92000.00", "50000.00", "19000.00", "200.000000"),
    ({"advertising_budget_change_amount": "1000"}, "92000.00", "40000.00", "28000.00", "200.000000"),
    ({"advertising_budget_change_amount": "-1000"}, "92000.00", "40000.00", "30000.00", "200.000000"),
    ({"additional_operating_expense_amount": "500"}, "92000.00", "40000.00", "28500.00", "200.000000"),
])
def test_each_control_has_independently_calculated_effect(changes, revenue, cogs, profit, orders):
    result = scenario(**changes)
    assert result.simulated.revenue == D(revenue)
    assert result.simulated.cogs == D(cogs)
    assert result.simulated.operating_profit == D(profit)
    assert result.simulated.expected_orders == D(orders)


def test_discount_conversion_example_preserves_tax_discount_and_expense_definitions():
    result = scenario(discount_pct="10", expected_conversion_rate="2.5")
    expected = {
        "revenue": "103750.00", "cogs": "50000.00", "gross_profit": "53750.00",
        "gross_profit_margin": "51.81", "operating_expenses": "19750.00",
        "advertising_expenditure": "4000.00", "operating_profit": "30000.00",
        "operating_profit_margin": "28.92", "contribution_profit": "46000.00",
        "contribution_margin": "44.34", "expected_orders": "250.000000",
        "expected_visitors": "10000.000000", "assumed_conversion_rate": "2.500000",
        "customer_shipping_revenue": "2500.00", "shipping_expenses": "2500.00",
        "platform_fees": "1250.00", "employee_expenses": "10000.00", "rent_expenses": "5000.00",
        "other_operating_expenses": "1000.00", "total_expenses": "23750.00",
    }
    for field, expected_value in expected.items():
        assert getattr(result.simulated, field) == D(expected_value), field
    assert result.simulated.conversion_rate_source == "user_assumption"
    assert result.differences.model_dump() == {
        "revenue": D("11750.00"), "operating_profit": D("1000.00"), "gross_profit": D("1750.00"),
        "orders": D("50.000000"), "revenue_change_pct": D("12.77"), "profit_change_pct": D("3.45"),
    }


def test_fractional_expected_orders_drive_all_variable_values_consistently():
    result = scenario(visitor_change_pct="12.3456", expected_conversion_rate="2.1234")
    assert result.simulated.expected_visitors == D("11234.560000")
    assert result.simulated.expected_orders == D("238.554647")
    assert result.simulated.revenue == D("109735.14")
    assert result.simulated.cogs == D("47710.93")
    assert result.simulated.shipping_expenses == D("2385.55")
    assert result.simulated.platform_fees == D("1192.77")
    assert result.simulated.operating_profit == D("38445.89")
    assert result.differences.orders == D("38.554647")


@pytest.mark.parametrize("changes", [{"visitor_change_pct": "-100"}, {"expected_conversion_rate": "0"}])
def test_zero_scenario_volume_keeps_fixed_costs_and_ads(changes):
    result = scenario(**changes)
    assert result.simulated.expected_orders == 0
    assert result.simulated.revenue == D("0.00")
    assert result.simulated.cogs == D("0.00")
    assert result.simulated.shipping_expenses == D("0.00")
    assert result.simulated.platform_fees == D("0.00")
    assert result.simulated.operating_expenses == D("16000.00")
    assert result.simulated.advertising_expenditure == D("4000.00")
    assert result.simulated.operating_profit == D("-20000.00")
    assert result.simulated.gross_profit_margin is None
    assert result.simulated.operating_profit_margin is None
    assert any("zero orders" in warning for warning in result.warnings)
    assert any("operating loss" in warning for warning in result.warnings)


@pytest.mark.parametrize("field", ["selling_price_change_pct", "discount_pct"])
def test_free_merchandise_keeps_shipping_and_costs(field):
    changes = {field: "-100" if field == "selling_price_change_pct" else "100"}
    result = scenario(**changes)
    assert result.simulated.revenue == D("2000.00")
    assert result.simulated.cogs == D("40000.00")
    assert result.simulated.operating_profit == D("-61000.00")
    assert result.simulated.operating_profit_margin == D("-3050.00")
    assert any("large price/discount" in warning for warning in result.warnings)


def test_unit_cost_can_be_reduced_to_zero_without_changing_order_volume():
    result = scenario(unit_cost_change_pct="-100")
    assert result.simulated.cogs == D("0.00")
    assert result.simulated.expected_orders == D("200.000000")
    assert result.simulated.operating_profit == D("69000.00")


def test_advertising_can_be_zero_but_never_negative_and_does_not_drive_conversion():
    result = scenario(advertising_budget_change_amount="-4000")
    assert result.simulated.advertising_expenditure == D("0.00")
    assert result.simulated.expected_orders == D("200.000000")
    with pytest.raises(ValueError, match="advertising budget negative"):
        scenario(advertising_budget_change_amount="-4000.01")


@pytest.mark.parametrize("expenses,expected_profit", [
    ([ExpenseEntry(category="rent", amount="48000")], "0.00"),
    ([ExpenseEntry(category="rent", amount="49000")], "-1000.00"),
])
def test_zero_and_loss_baseline_profit_have_no_misleading_percent(expenses, expected_profit):
    historical = baseline(expenses=expenses)
    assert historical.operating_profit == D(expected_profit)
    result = simulate(historical, ScenarioParameters(selling_price_change_pct="10"))
    assert result.status == "ready"
    assert result.differences.operating_profit == D("9000.00")
    assert result.differences.profit_change_pct is None
    assert any("zero or negative baseline" in warning for warning in result.warnings)


def test_zero_revenue_baseline_is_supported_if_an_observed_basket_exists():
    historical = baseline(sales=[SaleLine(
        quantity=200, unit_price="0", discount_amount="0", vat_rate="20",
        unit_cost_snapshot="200", price_includes_vat=True,
    )], shipping=[])
    result = simulate(historical, ScenarioParameters())
    assert result.status == "ready"
    assert result.simulated.revenue == D("0.00")
    assert result.differences.revenue_change_pct is None
    assert result.simulated.operating_profit == D("-63000.00")


@pytest.mark.parametrize("orders,visitors", [(0, 0), (0, 100), (1, 0)])
def test_no_observed_basket_returns_unavailable_not_fabricated_revenue(orders, visitors):
    historical = baseline(sales=[], shipping=[], order_count=orders, visitors=visitors)
    result = simulate(historical, ScenarioParameters(expected_conversion_rate="2.5"))
    assert result.status == "unavailable"
    assert result.simulated is None and result.differences is None
    assert any("positive recorded orders and visitors" in warning for warning in result.warnings)


@pytest.mark.parametrize("changes,warning", [
    ({"traffic_days": 29}, "Visitor data covers"),
    ({"missing_order_items": 1}, "Historical item snapshots"),
    ({"missing_refund_orders": 1}, "Refund records are missing"),
    ({"shipping": [ShippingCharge(amount=None, vat_rate=None, price_includes_vat=None)]}, "shipping amount"),
    ({"extra_warnings": ["Unknown original VAT basis outside the reporting period."]}, "Unknown original VAT"),
])
def test_incomplete_baseline_does_not_silently_fill_values(changes, warning):
    result = simulate(baseline(**changes), ScenarioParameters())
    assert result.status == "unavailable"
    assert result.simulated is None and result.differences is None
    assert any(warning in value for value in result.warnings)


def test_unknown_vat_and_restock_are_explicitly_unavailable():
    historical = baseline(sales=[SaleLine(
        quantity=1, unit_price="600", discount_amount="0", vat_rate="20",
        unit_cost_snapshot="200", price_includes_vat=None,
    )], refunds=[RefundLine(
        amount="60", amount_includes_vat=True, vat_rate="20",
        quantity_returned=1, quantity_restocked=None, unit_cost_snapshot="200",
    )])
    result = simulate(historical, ScenarioParameters())
    assert result.status == "unavailable"
    assert any("VAT-inclusive status" in warning for warning in result.warnings)
    assert any("Restocked quantity" in warning for warning in result.warnings)


def test_refunds_and_restocked_costs_scale_once_with_net_basket():
    historical = baseline(refunds=[RefundLine(
        amount="1200", amount_includes_vat=True, vat_rate="20",
        quantity_returned=2, quantity_restocked=2, unit_cost_snapshot="200",
    )])
    assert historical.revenue == D("91000.00")
    assert historical.cogs == D("39600.00")
    result = simulate(historical, ScenarioParameters(expected_conversion_rate="4"))
    assert result.simulated.revenue == D("182000.00")
    assert result.simulated.cogs == D("79200.00")
    assert any("earlier orders" in warning for warning in result.warnings)


@pytest.mark.parametrize("refund", [
    RefundLine(amount="120000", amount_includes_vat=True, vat_rate="20", quantity_returned=0,
               quantity_restocked=0, unit_cost_snapshot="200"),
    RefundLine(amount="1", amount_includes_vat=True, vat_rate="20", quantity_returned=201,
               quantity_restocked=201, unit_cost_snapshot="200"),
])
def test_negative_net_basket_or_net_cogs_from_older_returns_is_unsupported(refund):
    # Events may be refunds of sales outside this reporting period, so period
    # input totals alone cannot reject these histories as an over-refund.
    result = simulate(baseline(refunds=[refund]), ScenarioParameters())
    assert result.status == "unavailable"
    assert result.simulated is None
    assert any("negative net" in warning for warning in result.warnings)


def test_historical_conversion_above_one_hundred_requires_explicit_valid_assumption():
    historical = baseline(order_count=10001, visitors=10000)
    assert historical.conversion_rate == D("100.01")
    result = simulate(historical, ScenarioParameters())
    assert result.status == "unavailable"
    result = simulate(historical, ScenarioParameters(expected_conversion_rate="50"))
    assert result.status == "ready"
    assert result.simulated.expected_orders == D("5000.000000")


def test_extreme_valid_parameters_warn_without_fabricating_better_results():
    result = scenario(selling_price_change_pct="-95", expected_conversion_rate="100", unit_cost_change_pct="1000")
    assert result.simulated.expected_orders == D("10000.000000")
    assert result.simulated.operating_profit < 0
    assert any("large price/discount" in warning for warning in result.warnings)
    assert any("large unit-cost" in warning for warning in result.warnings)
    assert any("large change in order volume" in warning for warning in result.warnings)
    assert any("high conversion" in warning for warning in result.warnings)


def test_currency_rounding_is_half_up_and_output_volume_has_six_places():
    historical = baseline(sales=[SaleLine(
        quantity=1, unit_price="0.05", discount_amount="0", vat_rate="0",
        unit_cost_snapshot="0.01", price_includes_vat=False,
    )], shipping=[], expenses=[], ad_spend=[], order_count=1, visitors=3)
    result = simulate(historical, ScenarioParameters(selling_price_change_pct="10", visitor_change_pct="50"))
    assert result.simulated.expected_visitors == D("4.500000")
    assert result.simulated.expected_orders == D("1.500000")
    assert result.simulated.revenue == D("0.08")
    assert result.simulated.cogs == D("0.02")
    assert result.simulated.gross_profit == D("0.06")
    assert result.simulated.gross_profit_margin == D("75.00")
    assert result.simulated.expected_orders.as_tuple().exponent == -6
    assert result.simulated.revenue.as_tuple().exponent == -2


def test_determinism_serialization_and_ambient_decimal_context_isolation():
    historical = baseline(order_count=342, visitors=11635)
    params = ScenarioParameters(selling_price_change_pct="12.3456", expected_conversion_rate="2.1234")
    expected = simulate(historical, params)
    original = historical.model_dump_json()
    with localcontext() as context:
        context.prec = 6
        context.rounding = ROUND_DOWN
        result = simulate(historical, params)
    assert result == expected == simulate(historical, params)
    assert historical.model_dump_json() == original
    assert SimulationCalculation.model_validate_json(result.model_dump_json()) == result
    assert '"expected_orders":"247.057590"' in result.model_dump_json()


@pytest.mark.parametrize("field,value", [
    ("selling_price_change_pct", "-100.0001"), ("selling_price_change_pct", "1000.0001"),
    ("discount_pct", "-0.0001"), ("discount_pct", "100.0001"),
    ("expected_conversion_rate", "-0.01"), ("expected_conversion_rate", "100.01"),
    ("visitor_change_pct", "-100.0001"), ("visitor_change_pct", "10000.0001"),
    ("unit_cost_change_pct", "-101"), ("unit_cost_change_pct", "1001"),
    ("additional_operating_expense_amount", "-0.01"),
    ("advertising_budget_change_amount", "0.001"),
    ("additional_operating_expense_amount", "10000000000000000"),
    ("discount_pct", "1.12345"), ("selling_price_change_pct", "NaN"),
    ("unit_cost_change_pct", "Infinity"), ("expected_conversion_rate", "-Infinity"),
    ("visitor_change_pct", 1.0), ("advertising_budget_change_amount", 5.5),
    ("discount_pct", True), ("additional_operating_expense_amount", False),
    ("unexpected", "1"),
])
def test_invalid_parameter_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        ScenarioParameters(**{field: value})


def test_exact_decimals_integer_values_and_explicit_null_conversion_are_valid():
    params = ScenarioParameters(discount_pct=D("10.0000"), visitor_change_pct=0, expected_conversion_rate=None)
    assert params.discount_pct == D("10")
    assert params.expected_conversion_rate is None
