"""Add a reproducible, explicitly synthetic September 2026 demo store.

Run after Alembic migrations: ``python -m app.seed`` from ``backend``.
Existing rows are never updated or removed. Every ID is stable across runs.
"""

from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from random import Random
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.demo import DEMO_NAMESPACE, DEMO_ORGANIZATION_ID, DEMO_PERIOD_START, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Order, OrderItem, Organization, Product, Store


def _id(label: str) -> UUID:
    return uuid5(DEMO_NAMESPACE, label)


def _money(value: str | int | Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def build_seed_data() -> dict[type, list[dict]]:
    """Build the same data on every platform without a database connection."""
    rng = Random(20260901)
    created_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    catalog = [
        ("DEMO-MUG-01", "Ceramic coffee mug", "18.50", "6.20", 240),
        ("DEMO-BTL-02", "Insulated water bottle", "32.00", "12.40", 160),
        ("DEMO-TOT-03", "Canvas everyday tote", "24.90", "7.80", 180),
        ("DEMO-NBK-04", "Linen notebook", "16.00", "4.30", 320),
        ("DEMO-CND-05", "Cedar soy candle", "28.00", "9.50", 130),
        ("DEMO-TEA-06", "Loose leaf tea tin", "14.50", "5.10", 260),
        ("DEMO-THR-07", "Cotton throw blanket", "69.00", "28.00", 65),
        ("DEMO-LMP-08", "Desk reading lamp", "84.00", "37.50", 45),
        ("DEMO-PLN-09", "Stoneware planter", "35.00", "13.20", 90),
        ("DEMO-TRY-10", "Oak serving tray", "48.00", "19.00", 55),
        ("DEMO-DIF-11", "Amber reed diffuser", "39.50", "14.50", 80),
        ("DEMO-CLK-12", "Minimal wall clock", "58.00", "24.00", 35),
    ]
    products = [
        {
            "id": _id(f"product:{sku}"), "store_id": DEMO_STORE_ID, "sku": sku,
            "name": name, "selling_price": _money(price), "unit_cost": _money(cost),
            "vat_rate": _money("10.00"), "stock_quantity": stock, "created_at": created_at,
        }
        for sku, name, price, cost, stock in catalog
    ]
    rows: dict[type, list[dict]] = {
        Organization: [{"id": DEMO_ORGANIZATION_ID, "name": "Northstar Retail — Synthetic Demo", "is_demo": True, "created_at": created_at}],
        Store: [{"id": DEMO_STORE_ID, "organization_id": DEMO_ORGANIZATION_ID, "name": "Northstar Home — Synthetic Demo", "currency": "USD", "timezone": "UTC", "is_demo": True, "created_at": created_at}],
        Product: products, Order: [], OrderItem: [], Expense: [], DailyTraffic: [], AdSpend: [],
    }
    # This weighting intentionally gives products different sales performance.
    weights = [19, 16, 15, 13, 11, 10, 6, 3, 8, 5, 7, 2]
    ad_total = _money(0)
    order_sequence = 0
    for day_index in range(30):
        current_date = DEMO_PERIOD_START + timedelta(days=day_index)
        weekend = current_date.weekday() >= 5
        visitors = 290 + (day_index * 17) % 170 + (80 if weekend else 0)
        rows[DailyTraffic].append({
            "id": _id(f"traffic:{current_date}"), "store_id": DEMO_STORE_ID,
            "date": current_date, "visitors": visitors, "sessions": visitors + 45 + day_index % 30,
        })
        for platform, campaign, base in [
            ("Google Ads", "Synthetic autumn home search", 24),
            ("Meta Ads", "Synthetic everyday essentials", 18),
        ]:
            amount = _money(base + (day_index * 7) % 15 + (6 if weekend else 0))
            ad_total += amount
            rows[AdSpend].append({
                "id": _id(f"ads:{platform}:{current_date}"), "store_id": DEMO_STORE_ID,
                "platform": platform, "campaign_name": campaign, "amount": amount,
                "spend_date": current_date,
            })
        daily_count = 9 + day_index % 6 + (4 if weekend else 0)
        for daily_index in range(daily_count):
            order_sequence += 1
            number = f"SYN-202609-{order_sequence:05d}"
            order_id = _id(f"order:{number}")
            order_date = datetime.combine(current_date, time(9 + daily_index % 12, (daily_index * 11) % 60), tzinfo=timezone.utc)
            status = "cancelled" if order_sequence % 23 == 0 else "pending" if order_sequence % 19 == 0 else "completed"
            rows[Order].append({
                "id": order_id, "store_id": DEMO_STORE_ID, "order_number": number,
                "order_date": order_date, "status": status, "created_at": order_date,
                "shipping_amount": _money(0), "shipping_vat_rate": _money(0),
                "shipping_price_includes_vat": False,
            })
            selected: set[int] = set()
            for line_index in range(rng.choice([1, 1, 2, 2, 3])):
                remaining = [index for index in range(len(products)) if index not in selected]
                product_index = rng.choices(remaining, weights=[weights[index] for index in remaining], k=1)[0]
                selected.add(product_index)
                product = products[product_index]
                quantity = rng.choice([1, 1, 1, 2, 2, 3])
                discount_rate = Decimal("0.10") if order_sequence % 7 == 0 else Decimal("0.00")
                rows[OrderItem].append({
                    "id": _id(f"item:{number}:{line_index}"), "store_id": DEMO_STORE_ID,
                    "order_id": order_id, "product_id": product["id"], "quantity": quantity,
                    "unit_price": product["selling_price"],
                    "discount_amount": _money(product["selling_price"] * quantity * discount_rate),
                    "vat_rate": product["vat_rate"], "unit_cost_snapshot": product["unit_cost"],
                    "price_includes_vat": False,
                })
        rows[Expense].append({
            "id": _id(f"expense:shipping:{current_date}"), "store_id": DEMO_STORE_ID,
            "category": "shipping", "amount": _money(Decimal("2.80") * daily_count),
            "expense_date": current_date, "description": "Synthetic daily shipping charges",
            "created_at": datetime.combine(current_date, time(), tzinfo=timezone.utc),
        })
    fixed_expenses = [
        ("rent", "rent", 0, "1450.00", "Synthetic monthly store rent"),
        ("payroll-first", "employee_costs", 14, "1850.00", "Synthetic first-half payroll"),
        ("payroll-second", "employee_costs", 29, "1850.00", "Synthetic second-half payroll"),
        ("software", "software", 0, "149.00", "Synthetic retail software subscription"),
        ("supplies", "miscellaneous", 11, "87.60", "Synthetic packaging supplies"),
        ("maintenance", "miscellaneous", 23, "65.25", "Synthetic store maintenance"),
        # Reconciles with AdSpend. Aggregation must exclude this ledger category
        # and use AdSpend once, so this row cannot double-count advertising.
        ("advertising-ledger", "advertising", 29, ad_total, "Synthetic ad ledger mirror; canonical costs are AdSpend"),
    ]
    for label, category, offset, amount, description in fixed_expenses:
        expense_date = DEMO_PERIOD_START + timedelta(days=offset)
        rows[Expense].append({
            "id": _id(f"expense:{label}"), "store_id": DEMO_STORE_ID, "category": category,
            "amount": _money(amount), "expense_date": expense_date, "description": description,
            "created_at": datetime.combine(expense_date, time(), tzinfo=timezone.utc),
        })
    return rows


def seed_database(session: Session) -> dict[str, int]:
    """Insert missing demo rows in the caller's transaction, without committing.

    The caller must commit/roll back the entire operation. Conflicting natural
    keys with different IDs fail foreign-key checks instead of being remapped
    onto existing business records. Reserved ID collisions outside the demo
    scope fail explicitly before inserting anything.
    """
    rows = build_seed_data()
    organization = session.get(Organization, DEMO_ORGANIZATION_ID)
    if organization is not None and not organization.is_demo:
        raise ValueError("The reserved demo organization ID belongs to a non-demo organization.")
    store = session.get(Store, DEMO_STORE_ID)
    if store is not None and (
        not store.is_demo or store.organization_id != DEMO_ORGANIZATION_ID
        or store.currency != "USD" or store.timezone != "UTC"
    ):
        raise ValueError("The reserved demo store ID is not the expected USD/UTC synthetic store.")
    for model, values in rows.items():
        if model in (Organization, Store):
            continue
        existing_stores = session.scalars(select(model.store_id).where(model.id.in_([row["id"] for row in values])))
        if any(store_id != DEMO_STORE_ID for store_id in existing_stores):
            raise ValueError(f"A reserved synthetic {model.__tablename__} ID belongs to another store.")
    counts = {}
    for model, values in rows.items():
        statement = insert(model).values(values).on_conflict_do_nothing(index_elements=[model.id]).returning(model.id)
        counts[model.__tablename__] = len(session.scalars(statement).all())
    return counts


def main() -> None:
    from app.db.session import get_engine

    with Session(get_engine()) as session, session.begin():
        counts = seed_database(session)
    print("Synthetic demo seed complete. Inserted rows:")
    for name, count in counts.items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
