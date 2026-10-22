from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Muscle


def test_semilla_de_musculos(db: Session) -> None:
    muscles = {m.id: m for m in db.scalars(select(Muscle))}

    assert len(muscles) == 12
    assert muscles["recto_femoral"].parent_id == "cuadriceps"
    assert muscles["pectoral"].parent_id is None
    assert muscles["triceps"].name == "Tríceps"
