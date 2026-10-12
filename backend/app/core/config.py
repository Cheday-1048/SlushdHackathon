from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RDL_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    service_name: str = "Retail Decision Lab API"
    database_url: SecretStr | None = Field(default=None, validation_alias="DATABASE_URL")
    migration_database_url: SecretStr | None = Field(default=None, validation_alias="MIGRATION_DATABASE_URL")
    openai_api_key: SecretStr | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini", validation_alias="OPENAI_MODEL", min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")
    assistant_request_timeout_seconds: float = Field(default=15, ge=1, le=30)
    assistant_total_timeout_seconds: float = Field(default=45, ge=1, le=60)
    db_pool_mode: Literal["direct", "session", "transaction"] = "session"
    db_sslmode: Literal["disable", "require", "verify-ca", "verify-full"] = "require"
    db_ssl_root_cert: Path | None = None
    db_pool_size: int = Field(default=5, ge=1, le=20)
    db_max_overflow: int = Field(default=0, ge=0, le=20)
    db_pool_timeout: int = Field(default=3, ge=1, le=30)
    db_connect_timeout: int = Field(default=3, ge=1, le=30)
    db_statement_timeout_ms: int = Field(default=5000, ge=100, le=30000)
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

    @field_validator("database_url", "migration_database_url", "openai_api_key", mode="before")
    @classmethod
    def empty_url_is_unconfigured(cls, value):
        return None if value == "" else value

    @field_validator("cors_origins")
    @classmethod
    def exact_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            parsed = urlsplit(origin)
            if (
                "*" in origin
                or parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("CORS origins must be exact HTTP(S) origins without paths or wildcards")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
