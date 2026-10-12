"""Backend-only PostgreSQL connections; never fall back to fixtures or SQLite."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings


class DatabaseError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def connection_url(settings: Settings, *, migration: bool = False) -> URL:
    secret = (settings.migration_database_url or settings.database_url) if migration else settings.database_url
    if secret is None:
        raise DatabaseError("database_not_configured", "DATABASE_URL is not configured. Configure the backend database, run migrations and seed the demo store.")
    try:
        url = make_url(secret.get_secret_value())
        if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"} or not url.host or not url.database:
            raise ValueError
        if {"host", "hostaddr", "port", "dbname", "service"}.intersection(url.query):
            raise ValueError
        url = url.set(drivername="postgresql+psycopg")
        sslmode = url.query.get("sslmode", settings.db_sslmode)
        if sslmode not in {"disable", "require", "verify-ca", "verify-full"}:
            raise ValueError
        if sslmode == "disable" and url.host not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError
    except (ValueError, SQLAlchemyError):
        raise DatabaseError("database_configuration_error", "Use a valid PostgreSQL URL. Remote database connections require SSL (require or verify-full).") from None
    if migration and (url.port == 6543 or (settings.db_pool_mode == "transaction" and settings.migration_database_url is None)):
        raise DatabaseError("database_configuration_error", "Migrations require MIGRATION_DATABASE_URL pointing to a direct or session connection, not a transaction pooler.")
    return url


def build_engine(settings: Settings, *, migration: bool = False) -> Engine:
    url = connection_url(settings, migration=migration)
    connect_args: dict = {
        "connect_timeout": settings.db_connect_timeout,
        "sslmode": url.query.get("sslmode", settings.db_sslmode),
        # Supabase transaction poolers do not support prepared statements.
        "prepare_threshold": None,
    }
    if settings.db_ssl_root_cert:
        connect_args["sslrootcert"] = str(settings.db_ssl_root_cert)
    options: dict = {"connect_args": connect_args, "pool_pre_ping": True, "hide_parameters": True}
    if migration or settings.db_pool_mode == "transaction":
        options["poolclass"] = NullPool
    else:
        options.update(pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow,
                       pool_timeout=settings.db_pool_timeout, pool_recycle=300)
    return create_engine(url, **options)


@lru_cache
def get_engine() -> Engine:
    return build_engine(get_settings())


def get_db_session() -> Iterator[Session]:
    try:
        with Session(get_engine()) as session, session.begin():
            # All dashboard/list queries share one consistent snapshot. No session
            # state or server-side cursors need to survive a pooled transaction.
            session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            session.execute(text("SELECT set_config('statement_timeout', :timeout, true)"),
                            {"timeout": str(get_settings().db_statement_timeout_ms)})
            yield session
    except SQLAlchemyError:
        raise DatabaseError("database_unavailable", "The database is unavailable or its schema is not ready. Check the connection and migrations, then retry.") from None
