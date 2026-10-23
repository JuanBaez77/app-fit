import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class BrainBundle(Base):
    """Una versión del brain empaquetada (brain/build_bundle.py), subida con upload-bundle."""

    __tablename__ = "brain_bundle"

    # Hash del commit del vault
    version: Mapped[str] = mapped_column(Text, primary_key=True)
    built_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    bytes: Mapped[int | None] = mapped_column(Integer)
    estimated_tokens: Mapped[int | None] = mapped_column(Integer)
    # Nombres de las páginas citables: contra esto se validan las citas
    pages_json: Mapped[list[str]] = mapped_column(JSONB)
    # El XML que va como bloque C (cacheable) del system
    content: Mapped[str] = mapped_column(Text)


class Analysis(Base):
    """Un análisis del brain: lo que se mandó, lo que volvió y con qué versiones."""

    __tablename__ = "analysis"
    __table_args__ = (CheckConstraint("status IN ('ok','fallido')", name="status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    window_from: Mapped[date] = mapped_column(Date)
    window_to: Mapped[date] = mapped_column(Date)
    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routine.id"))
    brain_version: Mapped[str] = mapped_column(ForeignKey("brain_bundle.version"))
    # El que terminó respondiendo (con fallback puede no ser el pedido)
    model: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    # Exactamente lo que se envió, y los alias para leerlo
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    aliases_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # La respuesta validada, sin las citas inexistentes
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Los cambios que no pasaron la validación, con el motivo
    discarded_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    # Solo si falló: el texto crudo y por qué
    raw_response: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_read_tokens: Mapped[int | None] = mapped_column(Integer)

    changes: Mapped[list["AnalysisChange"]] = relationship(
        order_by="AnalysisChange.position", cascade="all, delete-orphan", lazy="selectin"
    )


class AnalysisChange(Base):
    """Un cambio propuesto. Los ids de target_json ya son los reales, no los alias."""

    __tablename__ = "analysis_change"
    __table_args__ = (
        CheckConstraint("basis IN ('evidencia','practica')", name="basis"),
        CheckConstraint(
            "status IN ('pendiente','aceptado','rechazado','obsoleto')", name="change_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    analysis_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("analysis.id"))
    position: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(Text)
    # Ids afectados, valor antes y valor después
    target_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    title: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    expectation: Mapped[str | None] = mapped_column(Text)
    basis: Mapped[str | None] = mapped_column(Text)
    evidence_level: Mapped[int | None] = mapped_column(SmallInteger)
    evidence_links_json: Mapped[list[str] | None] = mapped_column(JSONB)
    # Citas que no existen en el bundle: si hay, el cambio queda "sin respaldo verificable"
    dropped_links_json: Mapped[list[str] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default=text("'pendiente'"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_routine_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine.id"))
