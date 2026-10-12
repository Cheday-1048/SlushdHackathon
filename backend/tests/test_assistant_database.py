"""Assistant orchestration against existing services and disposable PostgreSQL."""

import asyncio
import json
import re

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import session as database_session
from app.db.base import Base
from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START
from app.main import create_app
from app.schemas.assistant import AssistantChatRequest
from app.schemas.optimization import GoalOptimizationRequest
from app.seed import seed_database
from app.services import assistant
from app.services.assistant import AssistantService
from app.services.financial_reporting import FinanceService
from app.services.optimization import GoalOptimizationService

from test_assistant import ENDPOINT, chat_body, fabricated_message, function_call, response_output, settings
from test_finance_database import DAY, add_refund, add_sale, finance_case, finance_store
from test_optimization_database import goal_body
from test_simulation_database import business_fingerprint


def provider_queue(period, arguments):
    arguments = {key: value for key, value in arguments.items() if key != "search"}
    queue = [
        response_output(function_call("get_store_metrics", period)),
        response_output(function_call("run_goal_optimization", arguments, call_id="call_2")),
        response_output(fabricated_message()),
    ]
    requests = []

    def respond(request):
        requests.append(request)
        assert queue, "Assistant exceeded expected provider turn count"
        return httpx.Response(200, json=queue.pop(0))

    return httpx.MockTransport(respond), requests


def invoke_database_chat(session, body, arguments):
    period = {name: body[name] for name in ("start_date", "end_date")}
    transport, requests = provider_queue(period, arguments)

    async def invoke():
        async with httpx.AsyncClient(transport=transport) as client:
            service = AssistantService(FinanceService(session), GoalOptimizationService(session), settings(), client=client)
            return await service.chat(AssistantChatRequest.model_validate(body))

    return asyncio.run(invoke()), requests


def test_assistant_routes_validated_goal_into_existing_optimizer_without_writes(db_session, finance_case, monkeypatch):
    period = {"start_date": DAY.isoformat(), "end_date": DAY.isoformat()}
    arguments = goal_body(target="20")
    before = business_fingerprint(db_session)
    optimizer_calls = []
    original = GoalOptimizationService.optimize

    def track(service, request):
        optimizer_calls.append(request)
        return original(service, request)

    monkeypatch.setattr(GoalOptimizationService, "optimize", track)
    result, requests = invoke_database_chat(db_session, chat_body(**period), arguments)
    assert len(optimizer_calls) == 1
    assert optimizer_calls[0].model_dump() == GoalOptimizationRequest.model_validate(arguments).model_dump()
    assert result.metrics.operating_profit == 70
    assert result.optimization.target_operating_profit == 84
    assert str(result.optimization.recommendations[0].simulated.operating_profit) == "92.50"
    assert result.optimization == original(GoalOptimizationService(db_session), optimizer_calls[0])
    assert result.optimization.baseline == result.metrics
    assert business_fingerprint(db_session) == before
    # Actual financial output was returned through the Responses function-output protocol.
    payload = json.loads(requests[1].content)
    outputs = [item for item in payload["input"] if item.get("type") == "function_call_output"]
    assert outputs and outputs[0]["call_id"] == "call_1"
    assert "70.00" in outputs[0]["output"]


@pytest.mark.parametrize("flag", ["organization", "store"])
def test_assistant_metrics_retain_both_demo_authorization_checks(db_session, finance_case, flag):
    from app.repositories.retail import DemoStoreNotFound

    getattr(finance_case, flag).is_demo = False
    db_session.flush()
    with pytest.raises(DemoStoreNotFound):
        invoke_database_chat(db_session, chat_body(start_date=DAY.isoformat(), end_date=DAY.isoformat()), goal_body())


def test_assistant_unachievable_goal_is_calculated_and_explicit(db_session, finance_case):
    result, _ = invoke_database_chat(
        db_session, chat_body(start_date=DAY.isoformat(), end_date=DAY.isoformat()), goal_body(target="100"),
    )
    assert result.optimization.status == "target_not_achievable"
    assert result.optimization.target_operating_profit == 140
    assert result.optimization.recommendations == []
    assert "none of the" in result.message.lower() and "met the goal" in result.message.lower()
    assert "999999999999" not in result.message


def test_assistant_uses_actual_read_only_repeatable_read_transaction(postgres_engine, monkeypatch):
    assert re.fullmatch(r"rdl_test_[0-9a-f]{32}", postgres_engine.url.database)
    with Session(postgres_engine) as session, session.begin():
        assert all(session.scalar(select(table.c.id).limit(1)) is None for table in Base.metadata.sorted_tables)
        seed_database(session)
    with Session(postgres_engine) as session:
        before = business_fingerprint(session)

    period = {"start_date": DEMO_PERIOD_START.isoformat(), "end_date": DEMO_PERIOD_END.isoformat()}
    transport, _ = provider_queue(period, goal_body(target="20", start=DEMO_PERIOD_START, end=DEMO_PERIOD_END))
    original_client = httpx.AsyncClient
    states, statements = [], []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())
        if statement.startswith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"):
            cursor.execute("SHOW transaction_read_only")
            read_only = cursor.fetchone()[0]
            cursor.execute("SHOW transaction_isolation")
            states.append((read_only, cursor.fetchone()[0]))

    monkeypatch.setattr(database_session, "get_engine", lambda: postgres_engine)
    monkeypatch.setattr(assistant.httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs))
    event.listen(postgres_engine, "after_cursor_execute", capture)
    try:
        application = create_app()
        application.dependency_overrides[get_settings] = lambda: settings()
        with TestClient(application, raise_server_exceptions=False) as client:
            response = client.post(ENDPOINT, json=chat_body())
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["metrics"]["revenue"] == "29371.63"
        assert result["optimization"]["status"] == "feasible"
        assert states == [("on", "repeatable read")]
        assert statements and set(statements) <= {"SET", "SELECT"}
        with Session(postgres_engine) as session:
            assert business_fingerprint(session) == before
    finally:
        event.remove(postgres_engine, "after_cursor_execute", capture)
        with postgres_engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))
