from decimal import Decimal
import socket
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.db import session as database_session
from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_PERIOD_START, DEMO_STORE_ID
from app.db.models import Expense, Product, Store
from app.main import create_app
from app.schemas.common import HealthResponse
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import get_dashboard_service


@pytest.fixture
def summary_data():
    return {
        "revenue": "1200.00", "total_orders": 16, "total_visitors": 400,
        "conversion_rate": "4.00", "total_expenses": "780.00",
        "operating_expenses": "600.00", "advertising_expenditure": "180.00",
        "currency": "USD", "reporting_period": {"start": "2026-09-01", "end": "2026-09-30"},
        "data_source": {"type": "database_demo", "description": "Synthetic PostgreSQL demo store"},
    }


@pytest.fixture
def client(summary_data):
    class StubDashboardService:
        def get_summary(self, start_date=None, end_date=None):
            return DashboardSummary.model_validate(summary_data)

    application = create_app()
    application.dependency_overrides[get_dashboard_service] = StubDashboardService
    # Validation-only products/expenses requests need no live database.
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def database_client(seeded_session):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: seeded_session
    with TestClient(application) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    health = HealthResponse.model_validate(response.json())
    assert health.status == "ok"
    assert health.service == "Retail Decision Lab API"


def test_dashboard_summary_contract(client):
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    summary = DashboardSummary.model_validate(response.json())
    assert summary.data_source.type == "database_demo"
    assert summary.data_source.description
    assert summary.currency == "USD"
    assert summary.reporting_period.start <= summary.reporting_period.end
    assert summary.revenue == Decimal("1200.00")
    assert summary.total_expenses == summary.operating_expenses + summary.advertising_expenditure
    assert all(isinstance(response.json()[name], str) for name in (
        "revenue", "total_expenses", "operating_expenses", "advertising_expenditure", "conversion_rate",
    ))
    assert summary.total_orders == 16
    assert summary.total_visitors == 400
    assert summary.conversion_rate == Decimal(summary.total_orders) / summary.total_visitors * 100


@pytest.mark.parametrize("changes", [
    {"revenue": "-1"},
    {"revenue": "1.001"},
    {"total_expenses": "-1"},
    {"operating_expenses": "-1"},
    {"advertising_expenditure": "-1"},
    {"total_orders": -1},
    {"total_orders": 1.5},
    {"total_visitors": -1},
    {"total_orders": 50000},
    {"conversion_rate": "7"},
    {"conversion_rate": "101"},
    {"currency": "usd"},
    {"reporting_period": {"start": "2026-09-30", "end": "2026-09-01"}},
    {"data_source": {"type": "live", "description": "invalid"}},
])
def test_reject_invalid_responses(summary_data, changes):
    with pytest.raises(ValidationError):
        DashboardSummary.model_validate({**summary_data, **changes})


def test_zero_visitors_is_defined(summary_data):
    summary = DashboardSummary.model_validate({**summary_data, "total_orders": 0, "total_visitors": 0, "conversion_rate": "0"})
    assert summary.conversion_rate == 0


@pytest.mark.parametrize("endpoint", ["/api/dashboard/summary", "/api/expenses"])
@pytest.mark.parametrize("query", [
    "start_date=2026-09-01", "end_date=2026-09-30", "start_date=bad&end_date=bad",
    "start_date=2026-09-30&end_date=2026-09-01",
])
def test_invalid_periods_are_rejected(client, endpoint, query):
    assert client.get(f"{endpoint}?{query}").status_code == 422


@pytest.mark.parametrize("endpoint", ["/api/products", "/api/expenses"])
@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=abc"])
def test_invalid_pagination_is_rejected(client, endpoint, query):
    assert client.get(f"{endpoint}?{query}").status_code == 422


@pytest.mark.parametrize("endpoint", ["/api/dashboard/summary", "/api/products", "/api/expenses"])
@pytest.mark.parametrize("selector", ["store_id", "organization_id"])
def test_arbitrary_tenant_selectors_are_rejected(client, endpoint, selector):
    assert client.get(endpoint, params={selector: str(uuid4())}).status_code == 422


def test_cors_allows_development_origin(client):
    response = client.options("/api/dashboard/summary", headers={
        "Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-credentials" not in response.headers


def test_cors_rejects_other_origin(client):
    response = client.options("/api/dashboard/summary", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", ["*", "http://*.example.com", "http://localhost:5173/path", "http://user:pass@localhost:5173"])
def test_cors_configuration_rejects_unsafe_origins(origin):
    with pytest.raises(ValidationError):
        Settings(cors_origins=[origin], _env_file=None)


def test_errors_hide_internal_details():
    application = create_app()

    def broken_service():
        raise RuntimeError("sensitive internal detail")

    application.dependency_overrides[get_dashboard_service] = broken_service
    with TestClient(application, raise_server_exceptions=False) as test_client:
        response = test_client.get("/api/dashboard/summary", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.status_code == 500
    assert response.json()["code"] == "internal_error"
    assert "sensitive" not in response.text
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_missing_database_is_clear_error_and_health_remains_available(monkeypatch):
    settings = Settings(database_url=None, migration_database_url=None, _env_file=None)
    monkeypatch.setattr(database_session, "get_settings", lambda: settings)
    database_session.get_engine.cache_clear()
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as test_client:
            assert test_client.get("/health").status_code == 200
            for endpoint in ("/api/dashboard/summary", "/api/products", "/api/expenses"):
                response = test_client.get(endpoint)
                assert response.status_code == 503
                assert "database" in response.json()["code"]
                assert response.json()["message"]
                assert "mock" not in response.text.lower()
    finally:
        database_session.get_engine.cache_clear()


def test_unavailable_database_returns_503_without_leaking_connection_details(monkeypatch):
    # Reserve a loopback TCP port without listening so connection refusal is
    # deterministic and never contacts the developer's configured database.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as reserved:
        reserved.bind(("127.0.0.1", 0))
        port = reserved.getsockname()[1]
        settings = Settings(database_url=f"postgresql://test:private-password@127.0.0.1:{port}/unavailable",
                            db_sslmode="disable", db_connect_timeout=1, _env_file=None)
        engine = database_session.build_engine(settings)
        monkeypatch.setattr(database_session, "get_engine", lambda: engine)
        monkeypatch.setattr(database_session, "get_settings", lambda: settings)
        try:
            with TestClient(create_app(), raise_server_exceptions=False) as test_client:
                assert test_client.get("/health").status_code == 200
                for endpoint in ("/api/dashboard/summary", "/api/products", "/api/expenses"):
                    response = test_client.get(endpoint, headers={"Origin": "http://127.0.0.1:5173"})
                    assert response.status_code == 503
                    assert response.json()["code"] == "database_unavailable"
                    assert "private-password" not in response.text
                    assert "postgresql://" not in response.text
                    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
        finally:
            engine.dispose()


def test_database_api_returns_real_data_and_paginated_products(database_client, seeded_session):
    summary_response = database_client.get("/api/dashboard/summary")
    assert summary_response.status_code == 200
    summary = DashboardSummary.model_validate(summary_response.json())
    assert summary.revenue > 0
    assert summary.data_source.type == "database_demo"
    products_response = database_client.get("/api/products?limit=2&offset=1")
    assert products_response.status_code == 200
    body = products_response.json()
    assert body["limit"] == 2 and body["offset"] == 1
    assert 10 <= body["total"] <= 15
    assert len(body["items"]) == 2
    assert body["store_id"] == str(DEMO_STORE_ID)
    for item in body["items"]:
        product = seeded_session.get(Product, UUID(item["id"]))
        assert item["store_id"] == str(DEMO_STORE_ID)
        assert isinstance(item["selling_price"], str)
        assert Decimal(item["selling_price"]) == product.selling_price
    assert database_client.get("/api/products?offset=1000").json()["items"] == []


def test_expenses_api_period_pagination_and_advertising_marker(database_client):
    response = database_client.get("/api/expenses?limit=100")
    assert response.status_code == 200
    body = response.json()
    assert body["reporting_period"] == {"start": "2026-09-01", "end": "2026-09-30"}
    assert body["total"] == len(body["items"]) > 0
    for item in body["items"]:
        assert item["store_id"] == str(DEMO_STORE_ID)
        assert isinstance(item["amount"], str)
        assert item["included_in_operating_expenses"] == (item["category"] != "advertising")
    empty = database_client.get("/api/expenses?start_date=2000-01-01&end_date=2000-01-31").json()
    assert empty["items"] == [] and empty["total"] == 0
    assert empty["reporting_period"] == {"start": "2000-01-01", "end": "2000-01-31"}


def test_dashboard_api_empty_period(database_client):
    response = database_client.get("/api/dashboard/summary?start_date=2000-01-01&end_date=2000-01-31")
    assert response.status_code == 200
    summary = DashboardSummary.model_validate(response.json())
    assert summary.revenue == summary.total_expenses == 0
    assert summary.total_orders == summary.total_visitors == summary.conversion_rate == 0


def test_public_api_scope_is_fixed_to_demo_store(database_client, seeded_session):
    before = {endpoint: database_client.get(endpoint).json() for endpoint in (
        "/api/dashboard/summary", "/api/products", "/api/expenses",
    )}
    other = Store(id=uuid4(), organization_id=DEMO_ORGANIZATION_ID, name="Another synthetic tenant",
                  currency="USD", timezone="UTC", is_demo=False)
    seeded_session.add(other)
    seeded_session.flush()
    seeded_session.add(Product(store_id=other.id, sku="PRIVATE", name="Unrelated tenant product",
                               selling_price=Decimal("999999.99"), unit_cost=Decimal("1.00"),
                               vat_rate=Decimal("0.00"), stock_quantity=100))
    seeded_session.add(Expense(store_id=other.id, category="rent", amount=Decimal("999999.99"),
                               expense_date=DEMO_PERIOD_START, description="Unrelated tenant expense"))
    seeded_session.flush()
    assert {endpoint: database_client.get(endpoint).json() for endpoint in before} == before
