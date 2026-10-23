from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://appfit:appfit@localhost:5432/appfit"

    # Autenticación. En producción JWT_SECRET tiene que venir del entorno.
    jwt_secret: str = "dev-secret-cambiar-en-produccion"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    # La cookie del refresh solo viaja a los endpoints de auth (detrás de nginx: /api/auth)
    cookie_path: str = "/api/auth"
    cookie_secure: bool = True
    login_max_failures: int = 5
    login_window_minutes: int = 15

    # Análisis del brain. Sin key, POST /analyses responde 503 sin llamar a la API
    anthropic_api_key: str | None = None
    brain_model: str = "claude-opus-5-5"
    brain_effort: str = "high"


@lru_cache
def get_settings() -> Settings:
    return Settings()
