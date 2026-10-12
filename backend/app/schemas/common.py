from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = Field(min_length=1)


class ErrorResponse(BaseModel):
    code: str
    message: str
