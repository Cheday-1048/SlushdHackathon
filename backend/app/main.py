import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import analytics, assistant, catalog, dashboard, finance, health, optimization, simulations
from app.core.config import get_settings
from app.db.session import DatabaseError, get_engine
from app.repositories.retail import DemoStoreNotFound
from app.services.simulation_reporting import SimulationValidationError
from app.services.assistant import AssistantError

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        yield
        if get_engine.cache_info().currsize:
            get_engine().dispose()
            get_engine.cache_clear()

    application = FastAPI(title=settings.service_name, version="0.8.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type"],
    )

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Raw JSON numeric overflow can become float('inf') before validation.
        # Keep validation failures JSON-safe without echoing raw input or ctx.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]})

    @application.exception_handler(DatabaseError)
    async def database_error(request: Request, exc: DatabaseError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"code": exc.code, "message": exc.message})

    @application.exception_handler(DemoStoreNotFound)
    async def missing_demo_store(request: Request, exc: DemoStoreNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"code": "demo_store_not_seeded", "message": str(exc)})

    @application.exception_handler(SimulationValidationError)
    async def invalid_simulation(request: Request, exc: SimulationValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"code": "invalid_simulation", "message": str(exc)})

    @application.exception_handler(AssistantError)
    async def assistant_error(request: Request, exc: AssistantError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"code": exc.code, "message": exc.message})

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled API error on %s", request.url.path, exc_info=exc)
        # ServerErrorMiddleware sits outside CORS; preserve exact-origin CORS on 500s.
        origin = request.headers.get("origin")
        headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in settings.cors_origins else {}
        return JSONResponse(status_code=500, content={
            "code": "internal_error",
            "message": "The server could not complete this request. Please retry.",
        }, headers=headers)

    application.include_router(health.router)
    application.include_router(dashboard.router)
    application.include_router(finance.router)
    application.include_router(analytics.router)
    application.include_router(simulations.router)
    application.include_router(optimization.router)
    application.include_router(assistant.router)
    application.include_router(catalog.router)
    return application


app = create_app()
