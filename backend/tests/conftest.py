"""PostgreSQL integration fixtures that never use the application database.

TEST_DATABASE_URL must explicitly name a local rdl_test_* database with a role
allowed to create databases. Every run creates and drops its own randomly named
database. The database named in the environment is only an administrative entry
point and is never migrated, seeded, truncated, or dropped.
"""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

BACKEND = Path(__file__).resolve().parents[1]


def checked_test_url(value: str):
    url = make_url(value)
    if (
        url.get_backend_name() != "postgresql"
        or url.host not in {"localhost", "127.0.0.1", "::1"}
        or not url.database
        or not url.database.startswith("rdl_test_")
        or set(url.query) - {"sslmode", "sslrootcert"}
    ):
        raise ValueError("TEST_DATABASE_URL must identify a local PostgreSQL rdl_test_* database")
    return url.set(drivername="postgresql+psycopg")


def migration_config(connection):
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.attributes["connection"] = connection
    return config


@pytest.fixture(scope="session")
def postgres_engine():
    value = os.environ.get("TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set TEST_DATABASE_URL to a local rdl_test_* PostgreSQL database to run integration tests")
    # Reject unsafe destinations before making a connection or issuing SQL.
    url = checked_test_url(value)
    database_name = f"rdl_test_{uuid4().hex}"
    # Explicit hostaddr also prevents an inherited PGHOSTADDR from redirecting
    # a URL whose host merely looks local to a remote database server.
    connection_args = {"connect_timeout": 5, "hostaddr": "::1" if url.host == "::1" else "127.0.0.1"}
    admin = create_engine(url, isolation_level="AUTOCOMMIT", poolclass=NullPool, connect_args=connection_args)
    engine = None
    created = False
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        created = True
        engine = create_engine(url.set(database=database_name), poolclass=NullPool, connect_args=connection_args)
        with engine.begin() as connection:
            command.upgrade(migration_config(connection), "head")
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if created:
            # Only the UUID name created immediately above can reach this DDL.
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{database_name}"'))
        admin.dispose()


@pytest.fixture
def db_session(postgres_engine):
    with postgres_engine.connect() as connection:
        transaction = connection.begin()
        with Session(connection) as session:
            yield session
        if transaction.is_active:
            transaction.rollback()


@pytest.fixture
def seeded_session(db_session):
    from app.seed import seed_database

    seed_database(db_session)
    db_session.flush()
    return db_session
