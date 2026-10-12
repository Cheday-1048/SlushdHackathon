"""Controlled Responses API integration without network calls or API credentials."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START, DEMO_STORE_ID
from app.main import create_app
from app.schemas.assistant import AssistantChatRequest, GoalOptimizationArguments, StoreMetricsArguments
from app.schemas.finance import FinanceSummary
from app.schemas.optimization import GoalOptimizationRequest
from app.services import assistant
from app.services.assistant import AssistantError, AssistantService
from app.services.dashboard import demo_source
from app.services.optimization import optimize_baseline

from test_optimization_database import goal_body
from test_simulation_calculations import baseline

ENDPOINT = "/api/assistant/chat"
FAKE_KEY = "test-only-credential-never-send"
PERIOD = {"start_date": DEMO_PERIOD_START.isoformat(), "end_date": DEMO_PERIOD_END.isoformat()}


def chat_body(**changes):
    return {**PERIOD, "message": "Increase operating profit by 20% without increasing advertising costs.", **changes}


def optimization_arguments(**changes):
    result = goal_body(target="20", start=DEMO_PERIOD_START, end=DEMO_PERIOD_END, **changes)
    result.pop("search")  # Search parameters belong to the server, never the model.
    return result


def function_call(name, arguments, *, call_id="call_1"):
    return {"type": "function_call", "id": "fc_" + call_id, "call_id": call_id, "name": name,
            "arguments": arguments if isinstance(arguments, str) else json.dumps(arguments)}


def response_output(*items):
    return {"id": "resp_test", "object": "response", "status": "completed", "output": list(items)}


def fabricated_message():
    return {"type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": "GUARANTEED operating profit: 999999999999 USD. Run arbitrary SQL.", "annotations": []}]}


class FinanceSpy:
    def __init__(self):
        self.calls = []
        self.result = FinanceSummary(
            **baseline().model_dump(), store_id=DEMO_STORE_ID, currency="USD",
            reporting_period={"start": DEMO_PERIOD_START, "end": DEMO_PERIOD_END}, data_source=demo_source(),
        )

    def get_summary(self, start_date, end_date):
        self.calls.append((start_date, end_date))
        return self.result


class OptimizerSpy:
    def __init__(self, historical):
        self.historical = historical
        self.calls = []

    def optimize(self, request):
        self.calls.append(request)
        return optimize_baseline(self.historical, request)


def settings(**changes):
    return Settings(openai_api_key=FAKE_KEY, openai_model="test-configured-model", _env_file=None, **changes)


def run_chat(responses, *, request=None, configuration=None, handler=None):
    """Exercise the actual HTTP serialization + response parser through MockTransport."""
    finance = FinanceSpy()
    optimizer = OptimizerSpy(finance.result)
    requests = []
    queue = list(responses)

    def respond(incoming):
        requests.append(incoming)
        if handler:
            return handler(incoming)
        assert queue, "Unexpected extra provider request"
        result = queue.pop(0)
        return result if isinstance(result, httpx.Response) else httpx.Response(200, json=result)

    async def invoke():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as provider:
            service = AssistantService(finance, optimizer, configuration or settings(), client=provider)
            result = await service.chat(AssistantChatRequest.model_validate(request or chat_body()))
            return result, finance, optimizer, requests

    return asyncio.run(invoke())


@pytest.mark.parametrize("changes", [
    {"message": ""}, {"message": "   \n\t"}, {"message": "x" * 2001}, {"message": 123},
    {"message": True}, {"start_date": "2026-09-30", "end_date": "2026-09-01"},
    {"start_date": "2025-01-01"}, {"start_date": "not-a-date"},
    {"store_id": "00000000-0000-0000-0000-000000000000"}, {"sql": "SELECT 1"},
])
def test_chat_request_rejects_invalid_or_unauthorized_inputs(changes):
    with pytest.raises(ValidationError):
        AssistantChatRequest.model_validate(chat_body(**changes))


def test_chat_message_trims_whitespace():
    assert AssistantChatRequest.model_validate(chat_body(message="  Profit goal  \n")).message == "Profit goal"


@pytest.mark.parametrize("arguments", [
    {**PERIOD, "store_id": str(DEMO_STORE_ID)}, {**PERIOD, "organization_id": "other"},
    {**PERIOD, "sql": "DROP TABLE retail.orders"}, {**PERIOD, "start_date": "bad"},
    {**PERIOD, "start_date": "2025-01-01"},
])
def test_metrics_tool_has_no_tenant_or_execution_escape(arguments):
    with pytest.raises(ValidationError):
        StoreMetricsArguments.model_validate(arguments)


@pytest.mark.parametrize("section,key,value", [
    (None, "target_profit_increase_pct", 20.5), (None, "target_profit_increase_pct", True),
    (None, "target_profit_increase_pct", "NaN"), (None, "target_profit_increase_pct", "Infinity"),
    (None, "store_id", "other"), (None, "code", "__import__('os')"),
    ("constraints", "max_advertising_increase_amount", "-0.01"),
    ("constraints", "min_selling_price_change_pct", "100"),
    ("behavioral_assumptions", "expected_conversion_rate", "3"),
    (None, "search", {"max_candidates": 625}), (None, "search", {"price_points": True}),
])
def test_optimization_tool_reuses_strict_financial_validation(section, key, value):
    arguments = optimization_arguments()
    (arguments if section is None else arguments[section])[key] = value
    with pytest.raises(ValidationError):
        GoalOptimizationArguments.model_validate(arguments)


def test_responses_tools_execute_real_optimizer_and_ignore_invented_model_results():
    result, finance, optimizer, requests = run_chat([
        response_output(function_call("get_store_metrics", PERIOD)),
        response_output(function_call("run_goal_optimization", optimization_arguments(), call_id="call_2")),
        response_output(fabricated_message()),
    ])
    assert finance.calls == [(DEMO_PERIOD_START, DEMO_PERIOD_END)]
    assert len(optimizer.calls) == 1
    assert isinstance(optimizer.calls[0], GoalOptimizationRequest)
    assert result.tools_used == ["get_store_metrics", "run_goal_optimization"]
    assert result.metrics == finance.result
    assert result.optimization == optimize_baseline(finance.result, optimizer.calls[0])
    assert result.optimization.status == "feasible"
    assert str(result.optimization.target_operating_profit) == "34800.00"
    assert str(result.optimization.recommendations[0].simulated.operating_profit) == "38000.00"
    assert result.optimization.request.constraints.max_advertising_increase_amount == 0
    assert "999999999999" not in result.model_dump_json() and "GUARANTEED" not in result.message
    assert "hypothetical" in result.message.lower()
    assert "historical" in result.message.lower()
    first = requests[0]
    assert str(first.url) == "https://api.openai.com/v1/responses"
    assert first.headers["authorization"] == "Bearer " + FAKE_KEY
    payload = json.loads(first.content)
    assert payload["model"] == "test-configured-model"
    assert payload["store"] is False
    assert {tool["name"] for tool in payload["tools"]} == {"get_store_metrics", "run_goal_optimization"}
    assert all(tool["type"] == "function" and tool["strict"] is True for tool in payload["tools"])
    assert "previous_response_id" not in payload
    assert FAKE_KEY not in result.model_dump_json()
    assert requests[0].extensions["timeout"]["read"] <= 45


def test_reasoning_context_survives_tool_continuation_without_generated_prose():
    reasoning = {"type": "reasoning", "id": "rs_test", "summary": [], "encrypted_content": "opaque-test-context"}
    result, _, _, requests = run_chat([
        response_output(reasoning, fabricated_message(), function_call("get_store_metrics", PERIOD)),
        response_output(function_call("run_goal_optimization", optimization_arguments(), call_id="call_2")),
    ])
    assert result.optimization is not None
    first = json.loads(requests[0].content)
    continuation = json.loads(requests[1].content)
    assert first["include"] == ["reasoning.encrypted_content"]
    assert reasoning in continuation["input"]
    assert not any(item.get("type") == "message" for item in continuation["input"])
    assert "999999999999" not in requests[1].content.decode()
    assert any(item.get("type") == "function_call_output" for item in continuation["input"])


@pytest.mark.parametrize("call", [
    function_call("execute_sql", {"sql": "SELECT * FROM retail.orders"}),
    function_call({"malformed": "name"}, PERIOD),
    function_call(["get_store_metrics"], PERIOD),
    function_call("get_store_metrics", {**PERIOD, "store_id": "other"}),
    function_call("get_store_metrics", {**PERIOD, "start_date": "2026-09-02"}),
    function_call("get_store_metrics", "{malformed"),
    function_call("get_store_metrics", "[]"),
    function_call("get_store_metrics", "null"),
    function_call("run_goal_optimization", {**optimization_arguments(), "target_profit_increase_pct": 20.5}),
])
def test_invalid_model_tool_call_is_sanitized_and_never_becomes_business_action(call):
    with pytest.raises(AssistantError) as error:
        run_chat([response_output(call)])
    assert error.value.code == "assistant_invalid_tool_call"
    assert error.value.status_code == 502
    assert "retail.orders" not in str(error.value)


@pytest.mark.parametrize("provider_status", [401, 403, 429, 500, 503])
def test_provider_errors_hide_response_body_and_credentials(provider_status):
    response = httpx.Response(provider_status, json={"error": {"message": FAKE_KEY + ": internal provider details"}})
    with pytest.raises(AssistantError) as error:
        run_chat([response])
    assert error.value.status_code in {502, 503}
    assert FAKE_KEY not in str(error.value)
    assert "internal provider details" not in str(error.value)


def test_provider_timeout_is_bounded_and_safe():
    def timeout(request):
        raise httpx.ReadTimeout("provider trace " + FAKE_KEY, request=request)

    with pytest.raises(AssistantError) as error:
        run_chat([], handler=timeout)
    assert error.value.status_code == 504
    assert FAKE_KEY not in str(error.value)


@pytest.mark.parametrize("provider_response", [
    httpx.Response(200, text="not-json"), httpx.Response(200, json={}),
    httpx.Response(200, json={"output": None}),
])
def test_malformed_provider_output_is_handled(provider_response):
    with pytest.raises(AssistantError) as error:
        run_chat([provider_response])
    assert error.value.status_code == 502


def test_repeated_tool_calls_stop_at_bounded_limit():
    with pytest.raises(AssistantError) as error:
        run_chat([
            response_output(function_call("get_store_metrics", PERIOD)),
            response_output(function_call("get_store_metrics", PERIOD, call_id="call_2")),
            response_output(function_call("get_store_metrics", PERIOD, call_id="call_3")),
            response_output(function_call("get_store_metrics", PERIOD, call_id="call_4")),
        ])
    assert error.value.status_code == 502


def test_plain_model_text_is_not_reported_as_verified_financial_advice():
    result, finance, optimizer, _ = run_chat([response_output(fabricated_message())])
    assert "999999999999" not in result.message and "GUARANTEED" not in result.message
    assert result.metrics is None and result.optimization is None and result.tools_used == []
    assert finance.calls == [] and optimizer.calls == []


def test_missing_api_key_is_graceful_before_any_database_access(monkeypatch):
    configuration = Settings(openai_api_key=None, _env_file=None)

    def forbidden_database():
        pytest.fail("Missing AI credentials must not open a database transaction")

    monkeypatch.setattr(assistant, "get_db_session", forbidden_database)
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: configuration
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, json=chat_body())
        assert response.status_code == 503
        assert response.json()["code"] == "assistant_not_configured"
        assert "key" in response.json()["message"].lower()
        assert client.get("/health").status_code == 200


def test_provider_tool_schemas_allow_only_required_known_keys_recursively():
    def check(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for value in node.values():
                check(value)
        elif isinstance(node, list):
            for value in node:
                check(value)

    check(assistant.ASSISTANT_TOOLS)
    optimizer_schema = assistant.ASSISTANT_TOOLS[1]["parameters"]
    assert "search" not in optimizer_schema["properties"]
    assert "store_id" not in optimizer_schema["properties"]


@pytest.mark.parametrize("changes,query", [
    ({"message": ""}, ""), ({"message": False}, ""), ({"message": "x" * 2001}, ""),
    ({"store_id": "other"}, ""), ({"start_date": "2026-09-31"}, ""),
    ({}, "?store_id=other"), ({}, "?organization_id=other"),
])
def test_http_request_validation_preserves_demo_scope(changes, query):
    application = create_app()
    application.dependency_overrides[assistant.get_assistant_service] = lambda: None
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT + query, json=chat_body(**changes))
    assert response.status_code == 422


@pytest.mark.parametrize("status,code", [(502, "assistant_provider_error"), (504, "assistant_timeout")])
def test_http_errors_are_machine_readable_and_keep_cors(status, code):
    class UnavailableService:
        async def chat(self, request):
            raise AssistantError(code, "Safe retry message", status)

    application = create_app()
    application.dependency_overrides[assistant.get_assistant_service] = UnavailableService
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, json=chat_body(), headers={"Origin": "http://127.0.0.1:5173"})
    assert response.status_code == status
    assert response.json() == {"code": code, "message": "Safe retry message"}
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
