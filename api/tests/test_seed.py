from collections import defaultdict
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AppUser, Exercise, Routine, UserProfile

# Tabla de la rutina-2026-10-20 (series fraccionales desde la semana 3), más el recto femoral:
# "5 de ellas son extensiones"
EXPECTED_WEEKLY = {
    "pectoral": 12,
    "deltoides_lateral": 12,
    "deltoides_posterior": 6.5,
    "deltoides_anterior": 4.5,
    "espalda": 10,
    "triceps": 10.5,
    "biceps": 10,
    "cuadriceps": 11,
    "isquiotibiales": 10,
    "gluteos": 4.5,
    "pantorrillas": 10,
    "recto_femoral": 5,
}


def weekly_volume(db: Session, routine: Routine, ramp: bool) -> dict[str, Decimal]:
    volume: dict[str, Decimal] = defaultdict(Decimal)
    for day in routine.days:
        for item in day.exercises:
            sets = item.ramp_sets if ramp and item.ramp_sets else item.target_sets
            exercise = db.get(Exercise, item.exercise_id)
            assert exercise is not None
            for muscle in exercise.muscles:
                volume[muscle.muscle_id] += sets * muscle.factor
    return volume


def test_importa_la_rutina_v1(client: TestClient, auth: dict[str, str], db: Session) -> None:
    response = client.post("/routines/import", headers=auth)

    assert response.status_code == 201
    routine = response.json()
    assert routine["version"] == 1
    assert routine["status"] == "vigente"
    assert routine["source"] == "importada"
    assert routine["review_on"] == "2026-11-17"
    assert [(d["name"], d["weekday"]) for d in routine["days"]] == [
        ("Torso", 1),
        ("Pierna A", 2),
        ("Empuje", 3),
        ("Tirón", 4),
        ("Pierna B", 5),
    ]
    assert len(routine["days"][0]["exercises"]) == 7
    banca = routine["days"][0]["exercises"][0]
    assert (banca["target_sets"], banca["reps_min"], banca["reps_max"]) == (3, 6, 10)
    assert (banca["rest_min_sec"], banca["rest_max_sec"]) == (120, 180)
    triceps = next(t for t in routine["muscle_targets"] if t["muscle_id"] == "triceps")
    assert (triceps["target_sets"], triceps["fractional_target"]) == (6, 10.5)


def test_importar_dos_veces_no_duplica(
    client: TestClient, auth: dict[str, str], db: Session, user: AppUser
) -> None:
    first = client.post("/routines/import", headers=auth).json()
    second = client.post("/routines/import", headers=auth)

    assert second.status_code == 200
    assert second.json()["id"] == first["id"]
    assert db.scalar(select(func.count()).select_from(Routine)) == 1
    assert db.scalar(select(func.count()).where(Exercise.user_id == user.id)) == 20


def test_crea_el_perfil_sin_datos_personales(
    client: TestClient, auth: dict[str, str], db: Session, user: AppUser
) -> None:
    client.post("/routines/import", headers=auth)

    profile = db.get(UserProfile, user.id)
    assert profile is not None
    assert profile.weight_step_kg == Decimal("2.5")
    assert profile.phase == "definicion"
    assert profile.send_discomfort_to_ai is False
    assert profile.priority_muscles == ["pectoral", "deltoides_lateral"]


def test_el_volumen_de_la_semilla_coincide_con_la_tabla_de_la_rutina(
    client: TestClient, auth: dict[str, str], db: Session
) -> None:
    client.post("/routines/import", headers=auth)
    routine = db.scalar(select(Routine))
    assert routine is not None

    assert weekly_volume(db, routine, ramp=False) == EXPECTED_WEEKLY
    for target in routine.muscle_targets:
        assert target.fractional_target == EXPECTED_WEEKLY[target.muscle_id]


def test_semanas_1_y_2_con_la_rampa(client: TestClient, auth: dict[str, str], db: Session) -> None:
    client.post("/routines/import", headers=auth)
    routine = db.scalar(select(Routine))
    assert routine is not None

    volume = weekly_volume(db, routine, ramp=True)

    assert volume["pectoral"] == volume["deltoides_lateral"] == 10


def test_rutina_actual(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/routines/current", headers=auth).status_code == 404

    created = client.post("/routines/import", headers=auth).json()

    assert client.get("/routines/current", headers=auth).json()["id"] == created["id"]


def test_importar_requiere_login(client: TestClient) -> None:
    assert client.post("/routines/import").status_code == 401
