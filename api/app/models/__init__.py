# Importar todos los modelos acá para que Alembic y los tests vean la metadata completa.
from app.models.catalog import Muscle
from app.models.user import AppUser, RefreshToken

__all__ = ["AppUser", "Muscle", "RefreshToken"]
