import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.assistant import AssistantChatRequest, AssistantChatResponse
from app.schemas.common import ErrorResponse
from app.schemas.simulation import SimulationQuery
from app.services.assistant import AssistantService, get_assistant_service

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantChatResponse, responses={
    status: {"model": ErrorResponse} for status in (404, 500, 502, 503, 504)
}, description="Stateless AI interpretation with two validated read-only demo-store tools. "
    "Financial answers are authored from existing service results; model prose is never displayed. "
    "No store selector, record changes, conversation persistence, or real-world experiments.")
def chat(request: AssistantChatRequest,
         service: Annotated[AssistantService, Depends(get_assistant_service)],
         query: Annotated[SimulationQuery, Query()]) -> AssistantChatResponse:
    # Run in FastAPI's worker pool: existing synchronous SQLAlchemy reads never
    # block the application's event loop. Network calls retain async deadlines.
    return asyncio.run(service.chat(request))
