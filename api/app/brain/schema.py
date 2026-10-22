"""Formato de salida del brain (diseño, sección 5).

El esquema se manda como JSON Schema en output_config.format, así que la API garantiza la
forma. Las reglas de contenido (citas que existan, ids reales, valores posibles) las valida la
app después (PR-26). Por eso acá no hay restricciones numéricas: solo tipos y enumeraciones.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Basis = Literal["evidencia", "practica"]

ChangeType = Literal[
    "set_sets",
    "set_rep_range",
    "set_rir",
    "set_rest",
    "swap_exercise",
    "add_exercise",
    "remove_exercise",
    "set_muscle_target",
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ExerciseAssessment(Strict):
    exercise_id: str
    status: Literal["progresa", "mantiene", "estancado", "retrocede", "sin_datos"]
    comment: str
    basis: Basis
    evidence_links: list[str]


class MuscleAssessment(Strict):
    muscle_id: str
    verdict: Literal["por_debajo", "en_rango", "por_encima", "sin_objetivo"]
    comment: str
    evidence_links: list[str]


class Alert(Strict):
    kind: Literal["sobreentrenamiento", "musculo_descuidado", "datos", "seguridad", "otro"]
    severity: Literal["info", "aviso", "importante"]
    text: str


class NewExerciseMuscle(Strict):
    muscle_id: str
    factor: float


class NewExercise(Strict):
    name: str
    kind: Literal["multiarticular", "aislamiento"]
    muscles: list[NewExerciseMuscle]


class ChangeTarget(Strict):
    """Un solo objeto para todos los tipos de cambio; cada tipo usa algunos campos (tabla del
    prompt). from y to son un número o un rango [min, max] según el tipo."""

    routine_day_exercise_id: str | None = None
    routine_day_id: str | None = None
    muscle_id: str | None = None
    from_: float | list[float] | None = Field(default=None, alias="from")
    to: float | list[float] | None = None
    to_exercise_id: str | None = None
    new_exercise: NewExercise | None = None
    exercise_id: str | None = None
    position: int | None = None
    sets: int | None = None
    reps: list[int] | None = None
    rir: list[int] | None = None
    rest_s: list[int] | None = None
    range: list[float] | None = None


class Change(Strict):
    type: ChangeType
    target: ChangeTarget
    title: str
    rationale: str
    expectation: str
    basis: Basis
    evidence_level: int | None = None
    evidence_links: list[str]


class AnalysisOut(Strict):
    summary: str
    confidence: Literal["alta", "media", "baja"]
    confidence_reason: str
    exercise_assessments: list[ExerciseAssessment]
    muscle_assessments: list[MuscleAssessment]
    alerts: list[Alert]
    changes: list[Change]
    data_gaps: list[str]
    notes: list[str]


def output_schema() -> dict[str, Any]:
    """El JSON Schema para output_config.format, con los nombres del JSON (from, no from_)."""
    return AnalysisOut.model_json_schema(by_alias=True)


def evidence_links(analysis: AnalysisOut) -> set[str]:
    """Todas las páginas que cita el análisis."""
    links: set[str] = set()
    for assessment in analysis.exercise_assessments:
        links.update(assessment.evidence_links)
    for muscle in analysis.muscle_assessments:
        links.update(muscle.evidence_links)
    for change in analysis.changes:
        links.update(change.evidence_links)
    return links
