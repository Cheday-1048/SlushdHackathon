import pytest
from pydantic import ValidationError
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db import session as database_session
from app.db.session import DatabaseError, build_engine, connection_url


def test_environment_url_and_secret_redaction(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:super-secret@localhost/retail")
    settings = Settings(_env_file=None)
    assert settings.database_url.get_secret_value().endswith("@localhost/retail")
    assert "super-secret" not in repr(settings)
    assert "super-secret" not in settings.model_dump_json()
    assert settings.db_sslmode == "require"


@pytest.mark.parametrize("value", [None, ""])
def test_missing_connection_never_falls_back_to_mock(value):
    settings = Settings(database_url=value, _env_file=None)
    with pytest.raises(DatabaseError, match="DATABASE_URL") as error:
        connection_url(settings)
    assert error.value.code == "database_not_configured"


@pytest.mark.parametrize("url", [
    "sqlite:///retail.db", "mysql://user:secret@localhost/retail", "not-a-url",
    "postgresql://user:secret@host.example/retail?sslmode=disable",
    "postgresql://user:secret@host.example/retail?sslmode=prefer",
    "postgresql://user:secret@localhost/retail?host=host.example&sslmode=disable",
    "postgresql://user:secret@localhost/retail?hostaddr=203.0.113.1&sslmode=disable",
    "postgresql://user:secret@localhost/retail?port=6543",
    "postgresql://user:secret@localhost/retail?dbname=other",
    "postgresql://user:secret@localhost/retail?service=remote",
])
def test_invalid_or_insecure_remote_connection_is_rejected(url):
    with pytest.raises(DatabaseError) as error:
        connection_url(Settings(database_url=url, _env_file=None))
    assert error.value.code == "database_configuration_error"
    assert "secret" not in str(error.value)


def test_remote_connection_cannot_disable_ssl_in_settings():
    with pytest.raises(DatabaseError):
        connection_url(Settings(database_url="postgresql://user:secret@host.example/retail", db_sslmode="disable", _env_file=None))


def test_encoded_password_is_preserved_and_psycopg_selected():
    url = connection_url(Settings(database_url="postgresql://user:a%40b%25c@localhost/retail", _env_file=None))
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "a@b%c"


@pytest.mark.parametrize("mode", ["direct", "session", "transaction"])
def test_pooling_ssl_and_prepared_statement_configuration(monkeypatch, mode):
    captured = {}

    def capture_engine(url, **kwargs):
        captured.update(url=url, **kwargs)
        return "engine-placeholder"

    monkeypatch.setattr(database_session, "create_engine", capture_engine)
    settings = Settings(database_url="postgresql://user:secret@host.example/retail", db_pool_mode=mode, _env_file=None)
    assert build_engine(settings) == "engine-placeholder"
    assert captured["connect_args"]["sslmode"] == "require"
    assert captured["connect_args"]["prepare_threshold"] is None
    assert captured["pool_pre_ping"] is True
    assert captured["hide_parameters"] is True
    if mode == "transaction":
        assert captured["poolclass"] is NullPool
        assert "pool_size" not in captured
    else:
        assert captured["pool_size"] == 5
        assert captured["max_overflow"] == 0


def test_local_development_can_explicitly_disable_ssl(monkeypatch):
    captured = {}

    def capture_engine(url, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(database_session, "create_engine", capture_engine)
    build_engine(Settings(database_url="postgresql://user:secret@127.0.0.1/retail?sslmode=disable", _env_file=None))
    assert captured["connect_args"]["sslmode"] == "disable"


def test_transaction_mode_requires_separate_migration_connection():
    settings = Settings(database_url="postgresql://user:secret@host.example:6543/retail", db_pool_mode="transaction", _env_file=None)
    with pytest.raises(DatabaseError, match="MIGRATION_DATABASE_URL"):
        connection_url(settings, migration=True)
    settings = Settings(database_url="postgresql://user:secret@host.example:6543/retail", db_pool_mode="transaction",
                        migration_database_url="postgresql://user:secret@host.example:5432/retail", _env_file=None)
    assert connection_url(settings, migration=True).port == 5432


@pytest.mark.parametrize("overrides", [
    {"db_pool_mode": "invalid"}, {"db_pool_size": 0}, {"db_pool_size": 21},
    {"db_max_overflow": -1}, {"db_connect_timeout": 0}, {"db_statement_timeout_ms": 0},
])
def test_pool_and_timeout_settings_are_bounded(overrides):
    with pytest.raises(ValidationError):
        Settings(**overrides, _env_file=None)
