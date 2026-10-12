import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import analytics, catalog, dashboard, finance, health
from app.core.config import get_settings
from app.db.session import DatabaseError, get_engine
from app.repositories.retail import DemoStoreNotFound

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        yield
        if get_engine.cache_info().currsize:
            get_engine().dispose()
            get_engine.cache_clear()

    application = FastAPI(title=settings.service_name, version="0.4.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )

    @application.exception_handler(DatabaseError)
    async def database_error(request: Request, exc: DatabaseError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"code": exc.code, "message": exc.message})

    @application.exception_handler(DemoStoreNotFound)
    async def missing_demo_store(request: Request, exc: DemoStoreNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"code": "demo_store_not_seeded", "message": str(exc)})

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
    application.include_router(catalog.router)
    return application


app = create_app()
