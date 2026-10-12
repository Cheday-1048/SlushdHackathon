"""Independent arithmetic examples for the pure engine (no database fixture)."""

from decimal import Decimal, ROUND_DOWN, localcontext

import pytest
from pydantic import ValidationError

from app.services.finance import (
    ExpenseEntry, FinancialInput, RefundLine, SaleLine, ShippingCharge,
    calculate_financials, validate_refund_history,
)

D = Decimal


def sale(**overrides):
    return SaleLine(**{
        "quantity": 1, "unit_price": D("120"), "discount_amount": D("0"),
        "vat_rate": D("20"), "unit_cost_snapshot": D("40"),
        "price_includes_vat": True, **overrides,
    })


def refund(**overrides):
    return RefundLine(**{
        "amount": D("120"), "amount_includes_vat": True, "vat_rate": D("20"),
        "quantity_returned": 1, "quantity_restocked": 1,
        "unit_cost_snapshot": D("40"), **overrides,
    })


def period(**overrides):
    return FinancialInput(**{
        "sales": [sale()], "order_count": 1, "visitors": 100,
        "traffic_days": 1, "period_days": 1, **overrides,
    })


def expense(category, amount):
    return ExpenseEntry(category=category, amount=D(amount))


@pytest.mark.parametrize("unit_price,inclusive,vat_rate,expected_revenue,expected_vat", [
    ("120", True, "20", "100.00", "20.00"),
    ("100", False, "20", "100.00", "20.00"),
    ("110", True, "10", "100.00", "10.00"),
    ("100", False, "10", "100.00", "10.00"),
    ("100", True, "0", "100.00", "0.00"),
    ("100", False, "0", "100.00", "0.00"),
    ("107.50", True, "7.50", "100.00", "7.50"),
    ("100", False, "7.50", "100.00", "7.50"),
])
def test_vat_bases_and_transaction_rates(unit_price, inclusive, vat_rate, expected_revenue, expected_vat):
    result = calculate_financials(period(sales=[sale(
        unit_price=D(unit_price), price_includes_vat=inclusive, vat_rate=D(vat_rate),
    )]))
    assert result.gross_sales == D(expected_revenue)
    assert result.vat_exclusive_sales_revenue == D(expected_revenue)
    assert result.revenue == D(expected_revenue)
    assert result.vat_collected_sales == D(expected_vat)


def test_full_mixed_tax_discount_refund_shipping_expense_example():
    result = calculate_financials(period(
        sales=[
            sale(quantity=2, discount_amount=D("24")),
            sale(unit_price=D("50"), discount_amount=D("5"), vat_rate=D("10"),
                 unit_cost_snapshot=D("20"), price_includes_vat=False),
            sale(unit_price=D("15"), vat_rate=D("0"), unit_cost_snapshot=D("5")),
        ],
        refunds=[refund(amount=D("54"))],
        shipping=[ShippingCharge(amount=D("12"), vat_rate=D("20"), price_includes_vat=True)],
        expenses=[expense("employee_costs", "40"), expense("rent", "20"),
                  expense("shipping", "8"), expense("platform_fees", "5"),
                  expense("software", "2"), expense("miscellaneous", "3"),
                  expense("advertising", "999")],
        ad_spend=[D("10")], order_count=3, visitors=200,
    ))
    expected = {
        "gross_sales": "265.00", "discounts": "25.00", "vat_exclusive_sales_revenue": "240.00",
        "customer_shipping_revenue": "10.00", "vat_collected_sales": "42.50",
        "refunds": "45.00", "vat_refunded": "9.00", "net_vat_collected": "33.50",
        "net_sales_revenue": "205.00", "revenue": "205.00", "cogs_before_returns": "105.00",
        "cogs_reversed": "40.00", "cogs": "65.00", "gross_profit": "140.00",
        "gross_profit_margin": "68.29", "contribution_profit": "117.00", "contribution_margin": "57.07",
        "advertising_expenditure": "10.00", "employee_expenses": "40.00", "rent_expenses": "20.00",
        "shipping_expenses": "8.00", "platform_fees": "5.00", "other_operating_expenses": "5.00",
        "operating_expenses": "78.00", "total_expenses": "88.00", "operating_profit": "52.00",
        "operating_profit_margin": "25.37", "average_order_value": "68.33", "conversion_rate": "1.50",
    }
    for name, value in expected.items():
        assert getattr(result, name) == D(value), name
        assert getattr(result, name).as_tuple().exponent == -2, name
    assert result.break_even_order_quantity == 2
    assert result.data_completeness.is_complete


def test_discount_is_for_the_entire_line_and_uses_its_price_basis():
    inclusive = calculate_financials(period(sales=[sale(quantity=2, discount_amount=D("24"))]))
    exclusive = calculate_financials(period(sales=[sale(
        quantity=2, unit_price=D("100"), discount_amount=D("20"), price_includes_vat=False,
    )]))
    for result in [inclusive, exclusive]:
        assert result.gross_sales == D("200.00")
        assert result.discounts == D("20.00")
        assert result.vat_exclusive_sales_revenue == D("180.00")
        assert result.vat_collected_sales == D("36.00")
        assert result.cogs == D("80.00")


def test_discount_rounding_preserves_report_identity_at_cents():
    result = calculate_financials(period(sales=[sale(unit_price=D("0.03"), discount_amount=D("0.01"))]))
    assert result.gross_sales == D("0.03")
    assert result.discounts == D("0.01")
    assert result.vat_exclusive_sales_revenue == D("0.02")
    assert result.gross_sales - result.discounts == result.vat_exclusive_sales_revenue


def test_vat_rounds_half_up_per_line_before_aggregation():
    result = calculate_financials(period(sales=[sale(unit_price=D("0.03")), sale(unit_price=D("0.03"))]))
    assert result.revenue == D("0.06")
    assert result.vat_collected_sales == D("0.00")
    one_line = calculate_financials(period(sales=[sale(quantity=2, unit_price=D("0.03"))]))
    assert one_line.revenue == D("0.05")
    assert one_line.vat_collected_sales == D("0.01")


def test_exclusive_vat_half_cent_rounds_up():
    result = calculate_financials(period(sales=[sale(
        unit_price=D("0.05"), vat_rate=D("10"), price_includes_vat=False,
    )]))
    assert result.revenue == D("0.05")
    assert result.vat_collected_sales == D("0.01")


def test_decimal_context_of_caller_does_not_change_financial_results():
    inputs = period(sales=[sale(unit_price=D("199.99"))])
    with localcontext() as context:
        context.prec = 4
        context.rounding = ROUND_DOWN
        result = calculate_financials(inputs)
    assert result.revenue == D("166.66")
    assert result.vat_collected_sales == D("33.33")
    assert result.gross_profit == D("126.66")


def test_refund_with_restock_reverses_historical_cost_and_collected_vat():
    result = calculate_financials(period(refunds=[refund()]))
    assert result.refunds == D("100.00")
    assert result.vat_refunded == D("20.00")
    assert result.net_vat_collected == D("0.00")
    assert result.revenue == D("0.00")
    assert result.cogs_before_returns == D("40.00")
    assert result.cogs_reversed == D("40.00")
    assert result.cogs == D("0.00")
    assert result.gross_profit == D("0.00")
    assert result.gross_profit_margin is None


def test_unrestocked_return_retains_cost_and_can_make_profit_negative():
    result = calculate_financials(period(refunds=[refund(quantity_restocked=0)]))
    assert result.revenue == D("0.00")
    assert result.cogs == D("40.00")
    assert result.gross_profit == D("-40.00")
    assert result.operating_profit == D("-40.00")
    assert result.break_even_order_quantity is None


def test_exclusive_refund_with_no_goods_returned_does_not_reverse_cost():
    result = calculate_financials(period(refunds=[refund(
        amount=D("10"), amount_includes_vat=False, quantity_returned=0, quantity_restocked=None,
    )]))
    assert result.refunds == D("10.00")
    assert result.vat_refunded == D("2.00")
    assert result.revenue == D("90.00")
    assert result.cogs_reversed == D("0.00")
    assert result.cogs == D("40.00")
    assert result.data_completeness.is_complete


def test_refund_only_period_has_negative_revenue_cogs_and_vat():
    result = calculate_financials(period(sales=[], refunds=[refund()], order_count=0, visitors=0))
    assert result.revenue == D("-100.00")
    assert result.net_vat_collected == D("-20.00")
    assert result.cogs == D("-40.00")
    assert result.gross_profit == D("-60.00")
    assert result.operating_profit_margin is None
    assert result.average_order_value is None
    assert result.break_even_order_quantity is None


def test_ad_spend_is_authoritative_and_advertising_ledger_is_never_counted():
    result = calculate_financials(period(
        expenses=[expense("advertising", "30"), expense("shipping", "5")],
        ad_spend=[D("10"), D("20")],
    ))
    assert result.advertising_expenditure == D("30.00")
    assert result.operating_expenses == D("5.00")
    assert result.total_expenses == D("35.00")
    assert result.operating_profit == D("25.00")
    no_ad_spend = calculate_financials(period(expenses=[expense("advertising", "30")]))
    assert no_ad_spend.advertising_expenditure == D("0.00")
    assert no_ad_spend.operating_profit == D("60.00")


def test_customer_shipping_revenue_and_carrier_expenses_are_separate():
    result = calculate_financials(period(
        shipping=[ShippingCharge(amount=D("10"), vat_rate=D("20"), price_includes_vat=False)],
        expenses=[expense("shipping", "8")],
    ))
    assert result.customer_shipping_revenue == D("10.00")
    assert result.revenue == D("110.00")
    assert result.vat_collected_sales == D("22.00")
    assert result.shipping_expenses == D("8.00")
    assert result.gross_profit == D("70.00")
    assert result.contribution_profit == D("62.00")


def test_zero_orders_zero_visitors_and_empty_reporting_period_are_safe():
    result = calculate_financials(period(sales=[], order_count=0, visitors=0))
    assert result.revenue == result.cogs == result.operating_profit == D("0.00")
    assert result.conversion_rate == D("0.00")
    assert result.average_order_value is None
    assert result.gross_profit_margin is None
    assert result.contribution_margin is None
    assert result.operating_profit_margin is None
    assert result.break_even_order_quantity is None
    assert result.data_completeness.is_complete


def test_zero_revenue_with_costs_reports_loss_and_undefined_margins():
    result = calculate_financials(period(sales=[sale(discount_amount=D("120"))], expenses=[expense("rent", "10")]))
    assert result.revenue == D("0.00")
    assert result.discounts == D("100.00")
    assert result.gross_profit == D("-40.00")
    assert result.operating_profit == D("-50.00")
    assert result.average_order_value == D("0.00")
    assert result.operating_profit_margin is None


def test_negative_operating_profit_and_margin_are_valid():
    result = calculate_financials(period(expenses=[expense("rent", "100")]))
    assert result.gross_profit == D("60.00")
    assert result.operating_profit == D("-40.00")
    assert result.operating_profit_margin == D("-40.00")


def test_conversion_with_orders_and_no_visitors_is_unknown():
    result = calculate_financials(period(visitors=0))
    assert result.conversion_rate is None
    assert not result.data_completeness.is_complete
    assert "visitors are zero" in " ".join(result.data_completeness.warnings)


def test_order_based_conversion_is_not_artificially_capped():
    result = calculate_financials(period(order_count=3, visitors=2))
    assert result.conversion_rate == D("150.00")


def test_incomplete_traffic_warns_without_erasing_known_financials():
    result = calculate_financials(period(traffic_days=1, period_days=3))
    assert result.revenue == D("100.00")
    assert result.conversion_rate is None
    assert not result.data_completeness.is_complete
    assert result.data_completeness.expected_traffic_days == 3
    assert "1 of 3" in " ".join(result.data_completeness.warnings)


def test_zero_orders_with_missing_traffic_has_unknown_conversion():
    result = calculate_financials(period(sales=[], order_count=0, visitors=0, traffic_days=0))
    assert result.conversion_rate is None
    assert result.revenue == D("0.00")
    assert not result.data_completeness.is_complete


@pytest.mark.parametrize("fixed_costs,orders,expected", [("61", 2, 3), ("60", 2, 2), ("0", 2, 0)])
def test_break_even_uses_ceiling_and_handles_zero_fixed_cost(fixed_costs, orders, expected):
    result = calculate_financials(period(expenses=[expense("rent", fixed_costs)], order_count=orders))
    assert result.break_even_order_quantity == expected


def test_break_even_does_not_round_per_order_contribution_before_dividing():
    result = calculate_financials(period(
        sales=[sale(unit_price=D("0.04"), vat_rate=D("0"), unit_cost_snapshot=D("0"))],
        order_count=3, expenses=[expense("rent", "0.04")],
    ))
    assert result.contribution_profit == D("0.04")
    assert result.break_even_order_quantity == 3


@pytest.mark.parametrize("ads", ["60", "61"])
def test_break_even_is_undefined_for_zero_or_negative_contribution(ads):
    result = calculate_financials(period(ad_spend=[D(ads)], expenses=[expense("rent", "10")]))
    assert result.break_even_order_quantity is None


def test_unknown_sales_vat_marks_sales_and_dependent_profit_unknown():
    result = calculate_financials(period(sales=[sale(price_includes_vat=None)]))
    for field in ["gross_sales", "discounts", "vat_exclusive_sales_revenue", "vat_collected_sales",
                  "revenue", "gross_profit", "operating_profit", "average_order_value", "break_even_order_quantity"]:
        assert getattr(result, field) is None, field
    assert result.cogs == D("40.00")
    assert result.operating_expenses == D("0.00")
    assert result.data_completeness.missing_vat_lines == 1
    assert not result.data_completeness.is_complete


def test_unknown_refund_vat_preserves_known_sales_and_cogs_but_blocks_net_revenue():
    result = calculate_financials(period(refunds=[refund(amount_includes_vat=None)]))
    assert result.gross_sales == D("100.00")
    assert result.vat_collected_sales == D("20.00")
    assert result.refunds is result.vat_refunded is result.net_vat_collected is None
    assert result.revenue is result.gross_profit is None
    assert result.cogs == D("0.00")
    assert result.data_completeness.missing_vat_lines == 1


def test_missing_refund_records_never_invents_refund_or_restock_amounts():
    result = calculate_financials(period(missing_refund_orders=1))
    assert result.refunds is result.vat_refunded is result.cogs_reversed is None
    assert result.cogs is result.gross_profit is result.operating_profit is None
    assert result.cogs_before_returns == D("40.00")
    assert result.data_completeness.missing_refund_orders == 1


def test_unknown_restock_preserves_revenue_but_not_cogs_or_profit():
    result = calculate_financials(period(refunds=[refund(quantity_restocked=None)]))
    assert result.revenue == D("0.00")
    assert result.cogs_before_returns == D("40.00")
    assert result.cogs_reversed is result.cogs is result.gross_profit is None
    assert result.data_completeness.missing_restock_refunds == 1


@pytest.mark.parametrize("amount,vat_rate,inclusive", [(None, "20", True), ("12", None, True), ("12", "20", None)])
def test_unknown_customer_shipping_blocks_revenue(amount, vat_rate, inclusive):
    result = calculate_financials(period(shipping=[ShippingCharge(
        amount=amount, vat_rate=vat_rate, price_includes_vat=inclusive,
    )]))
    assert result.customer_shipping_revenue is result.revenue is result.vat_collected_sales is None
    assert result.gross_sales == D("100.00")
    assert result.cogs == D("40.00")
    assert result.data_completeness.missing_shipping_orders == 1


def test_known_zero_shipping_needs_no_tax_basis_to_prove_zero():
    result = calculate_financials(period(shipping=[ShippingCharge(amount=D("0"), vat_rate=None, price_includes_vat=None)]))
    assert result.customer_shipping_revenue == D("0.00")
    assert result.revenue == D("100.00")
    assert result.data_completeness.is_complete


def test_missing_order_items_blocks_sales_costs_and_profits():
    result = calculate_financials(period(missing_order_items=1))
    assert result.gross_sales is result.revenue is result.cogs_before_returns is result.cogs is None
    assert result.operating_profit is result.break_even_order_quantity is None
    assert result.data_completeness.missing_order_items == 1


def test_repository_warnings_are_retained_and_deduplicated():
    result = calculate_financials(period(extra_warnings=["Historical data incomplete.", "Historical data incomplete."]))
    assert result.data_completeness.warnings == ["Historical data incomplete."]
    assert not result.data_completeness.is_complete


@pytest.mark.parametrize("field", ["unit_price", "discount_amount", "vat_rate", "unit_cost_snapshot"])
def test_binary_floats_are_rejected_for_sale_inputs(field):
    with pytest.raises(ValidationError, match="Use Decimal"):
        sale(**{field: 0.1})


def test_float_ad_spend_and_expenses_are_rejected():
    with pytest.raises(ValidationError, match="Use Decimal"):
        period(ad_spend=[0.1])
    with pytest.raises(ValidationError, match="Use Decimal"):
        ExpenseEntry(category="rent", amount=0.1)


@pytest.mark.parametrize("overrides", [
    {"quantity": 0}, {"quantity": True}, {"unit_price": D("-1")},
    {"discount_amount": D("121")}, {"vat_rate": D("101")}, {"unit_cost_snapshot": D("-1")},
    {"unit_price": True}, {"price_includes_vat": "yes"},
])
def test_invalid_sale_values_are_rejected(overrides):
    with pytest.raises(ValidationError):
        sale(**overrides)


def test_invalid_refund_restock_quantity_is_rejected():
    with pytest.raises(ValidationError, match="cannot exceed"):
        refund(quantity_returned=1, quantity_restocked=2)


def test_unknown_expense_category_is_rejected_instead_of_silently_omitted():
    with pytest.raises(ValidationError):
        expense("uncategorized", "10")


def test_snapshot_value_objects_are_frozen():
    transaction = sale()
    with pytest.raises(ValidationError, match="frozen"):
        transaction.unit_price = D("999")
    result = calculate_financials(period(sales=[transaction]))
    assert result.revenue == D("100.00")
    assert result.cogs == D("40.00")


def test_invalid_traffic_coverage_is_rejected():
    with pytest.raises(ValidationError, match="cannot exceed"):
        period(traffic_days=2, period_days=1)


def test_refund_history_accepts_full_refund_across_different_tax_bases():
    validate_refund_history(sale(quantity=2), [
        refund(amount=D("120")),
        refund(amount=D("100"), amount_includes_vat=False),
    ])


def test_refund_history_accepts_refunds_equal_to_discounted_revenue():
    validate_refund_history(sale(discount_amount=D("12")), [
        refund(amount=D("48"), quantity_returned=0, quantity_restocked=0),
        refund(amount=D("50"), amount_includes_vat=False),
    ])


def test_refund_history_rejects_cumulative_returned_quantity():
    with pytest.raises(ValueError, match="returned quantity"):
        validate_refund_history(sale(), [refund(amount=D("30")), refund(amount=D("30"))])


def test_refund_history_rejects_cumulative_amount_over_original_discounted_sale():
    with pytest.raises(ValueError, match="discounted settlement amount"):
        validate_refund_history(sale(discount_amount=D("12")), [
            refund(amount=D("60"), quantity_returned=0, quantity_restocked=0),
            refund(amount=D("60")),
        ])


def test_refund_history_amount_limit_is_after_tax_normalization():
    with pytest.raises(ValueError, match="discounted settlement amount"):
        validate_refund_history(sale(), [refund(amount=D("100.01"), amount_includes_vat=False)])


def test_refund_history_counts_rounded_vat_in_the_settlement_cash_limit():
    validate_refund_history(sale(unit_price=D("0.03")), [
        refund(amount=D("0.03"), amount_includes_vat=True),
    ])
    # A 0.03 exclusive refund has 0.01 VAT: total cash 0.04 exceeds 0.03.
    with pytest.raises(ValueError, match="discounted settlement amount"):
        validate_refund_history(sale(unit_price=D("0.03")), [
            refund(amount=D("0.03"), amount_includes_vat=False),
        ])


def test_valid_split_refund_retains_per_credit_note_rounding_residuals():
    original = sale(unit_price=D("1.00"), unit_cost_snapshot=D("0.40"))
    credits = [
        refund(amount=D("0.50"), quantity_returned=0, quantity_restocked=0, unit_cost_snapshot=D("0.40")),
        refund(amount=D("0.50"), unit_cost_snapshot=D("0.40")),
    ]
    validate_refund_history(original, credits)
    result = calculate_financials(period(sales=[original], refunds=credits))
    assert result.vat_exclusive_sales_revenue == D("0.83")
    assert result.vat_collected_sales == D("0.17")
    assert result.refunds == D("0.84")
    assert result.vat_refunded == D("0.16")
    assert result.revenue == D("-0.01")
    assert result.net_vat_collected == D("0.01")
    assert result.cogs_before_returns == result.cogs_reversed == D("0.40")
    assert result.cogs == D("0.00")
    assert result.gross_profit == D("-0.01")
    assert result.data_completeness.is_complete


def test_valid_split_refund_accepts_mixed_tax_bases_with_equal_cash_settlement():
    validate_refund_history(sale(unit_price=D("1.00")), [
        refund(amount=D("0.50"), quantity_returned=0, quantity_restocked=0),
        # 0.42 exclusive + 0.08 VAT settles as the remaining 0.50.
        refund(amount=D("0.42"), amount_includes_vat=False),
    ])


@pytest.mark.parametrize("second_amount,inclusive", [("0.51", True), ("0.43", False)])
def test_split_refund_rejects_actual_cash_overrefund(second_amount, inclusive):
    with pytest.raises(ValueError, match="discounted settlement amount"):
        validate_refund_history(sale(unit_price=D("1.00")), [
            refund(amount=D("0.50"), quantity_returned=0, quantity_restocked=0),
            refund(amount=D(second_amount), amount_includes_vat=inclusive),
        ])


def test_refund_history_unknown_tax_skips_amount_validation_but_checks_quantity():
    validate_refund_history(sale(price_includes_vat=None), [refund(amount=D("999"))])
    validate_refund_history(sale(), [refund(amount=D("999"), amount_includes_vat=None)])
    with pytest.raises(ValueError, match="returned quantity"):
        validate_refund_history(sale(price_includes_vat=None), [
            refund(amount_includes_vat=None), refund(amount_includes_vat=None),
        ])
