from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Muscle(Base):
    __tablename__ = "muscle"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    # recto_femoral -> cuadriceps; las regiones se reportan aparte
    parent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("muscle.id"))
