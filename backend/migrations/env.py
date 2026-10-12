from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.core.config import get_settings
from app.db.base import Base
from app.db import models  # noqa: F401: register models in the metadata
from app.db.session import build_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    # Supabase manages other schemas. Autogeneration must never suggest
    # removing tables in public, auth, storage, or other unrelated schemas.
    if type_ == "schema":
        return name == "retail"
    return True


def run_migrations_offline() -> None:
    # A PostgreSQL dialect is sufficient to generate SQL; no credentials are
    # needed or written into generated migration scripts.
    context.configure(
        dialect_name="postgresql", target_metadata=target_metadata,
        literal_binds=True, dialect_opts={"paramstyle": "named"},
        include_schemas=True, include_name=include_name,
        version_table_schema="retail", compare_type=True,
    )
    with context.begin_transaction():
        context.execute("CREATE SCHEMA IF NOT EXISTS retail")
        context.run_migrations()


def migrate_connection(connection) -> None:
    # The version table needs its namespace before Alembic can create it.
    connection.execute(text("CREATE SCHEMA IF NOT EXISTS retail"))
    context.configure(
        connection=connection, target_metadata=target_metadata,
        include_schemas=True, include_name=include_name,
        version_table_schema="retail", compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Tests may supply a connection to a newly-created isolated database and
    # retain ownership of its transaction and lifetime.
    connection = config.attributes.get("connection")
    if connection is not None:
        migrate_connection(connection)
        return
    engine = build_engine(get_settings(), migration=True)
    try:
        with engine.connect() as connection, connection.begin():
            migrate_connection(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
