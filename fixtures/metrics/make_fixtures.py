"""Genera los fixtures dorados de métricas (fixtures/metrics/*.json).

    py fixtures/metrics/make_fixtures.py

Los usan las dos implementaciones de las métricas: la de la web (TypeScript, sin red) y la de la
API (Python, para el análisis del brain). Si las dos dan lo mismo con estos fixtures, no
divergen. El catálogo y la rutina copian api/seeds/; un test de la API verifica que coincidan.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent

# Factores del conteo fraccional (api/seeds/catalogo.yaml)
CATALOG = {
    "press-banca-barra": {"pectoral": 1, "deltoides_anterior": 0.5, "triceps": 0.5},
    "press-inclinado-mancuernas": {"pectoral": 1, "deltoides_anterior": 0.5, "triceps": 0.5},
    "press-inclinado-barra": {"pectoral": 1, "deltoides_anterior": 0.5, "triceps": 0.5},
    "cruces-polea": {"pectoral": 1},
    "remo-t": {"espalda": 1, "biceps": 0.5, "deltoides_posterior": 0.5},
    "remo-sentado-polea": {"espalda": 1, "biceps": 0.5, "deltoides_posterior": 0.5},
    "jalon-pecho": {"espalda": 1, "biceps": 0.5},
    "dominadas": {"espalda": 1, "biceps": 0.5},
    "elevaciones-laterales": {"deltoides_lateral": 1},
    "elevaciones-laterales-polea": {"deltoides_lateral": 1},
    "aperturas-invertidas-polea": {"deltoides_posterior": 1},
    "extension-triceps-cabeza": {"triceps": 1},
    "curl-mancuernas": {"biceps": 1},
    "curl-barra-polea": {"biceps": 1},
    "prensa": {"cuadriceps": 1, "gluteos": 0.5},
    "sentadilla": {"cuadriceps": 1, "gluteos": 0.5},
    "extension-cuadriceps": {"cuadriceps": 1, "recto_femoral": 1},
    "curl-femoral-acostado": {"isquiotibiales": 1},
    "peso-muerto-rumano": {"isquiotibiales": 1, "gluteos": 0.5},
    "elevacion-talones-pie": {"pantorrillas": 1},
}
NO_E1RM = {"dominadas"}

# Series de la rutina desde la semana 3 (api/seeds/rutina-2026-10-20.yaml), lunes a viernes
WEEK_3 = {
    "2026-11-02": [("press-banca-barra", 3), ("remo-t", 3), ("press-inclinado-mancuernas", 3),
                   ("jalon-pecho", 2), ("elevaciones-laterales", 3),
                   ("extension-triceps-cabeza", 3), ("curl-mancuernas", 2)],
    "2026-11-03": [("prensa", 3), ("extension-cuadriceps", 3), ("curl-femoral-acostado", 3),
                   ("peso-muerto-rumano", 3), ("elevacion-talones-pie", 5)],
    "2026-11-04": [("press-inclinado-barra", 3), ("cruces-polea", 3),
                   ("elevaciones-laterales", 5), ("extension-triceps-cabeza", 3)],
    "2026-11-05": [("dominadas", 3), ("remo-sentado-polea", 2),
                   ("aperturas-invertidas-polea", 4), ("elevaciones-laterales-polea", 4),
                   ("curl-barra-polea", 3)],
    "2026-11-06": [("sentadilla", 3), ("extension-cuadriceps", 2),
                   ("curl-femoral-acostado", 4), ("elevacion-talones-pie", 5)],
}


def exercises() -> list[dict[str, object]]:
    return [
        {
            "id": key,
            "e1rm_eligible": key not in NO_E1RM,
            "muscles": [{"muscle_id": m, "factor": f} for m, f in muscles.items()],
        }
        for key, muscles in CATALOG.items()
    ]


def session(session_id: str, date: str, deleted: bool = False) -> dict[str, object]:
    return {"id": session_id, "date": date, "deleted_at": "2026-11-08T12:00:00Z" if deleted else None}


def set_row(n: int, session_id: str, exercise: str, number: int, weight: float = 50,
            reps: int = 10, deleted: bool = False) -> dict[str, object]:
    return {
        "id": f"set-{n}",
        "session_id": session_id,
        "exercise_id": exercise,
        "set_number": number,
        "weight_kg": weight,
        "reps": reps,
        "rir": 1,
        "deleted_at": "2026-11-08T12:00:00Z" if deleted else None,
    }


def routine_week() -> dict[str, object]:
    sessions, sets = [], []
    for date, items in WEEK_3.items():
        sessions.append(session(f"s-{date}", date))
        for exercise, count in items:
            for number in range(1, count + 1):
                sets.append(set_row(len(sets) + 1, f"s-{date}", exercise, number))
    direct = {"pectoral": 12, "deltoides_lateral": 12, "deltoides_posterior": 4,
              "deltoides_anterior": 0, "espalda": 10, "triceps": 6, "biceps": 5,
              "cuadriceps": 11, "recto_femoral": 5, "isquiotibiales": 10, "gluteos": 0,
              "pantorrillas": 10}
    fractional = {"pectoral": 12, "deltoides_lateral": 12, "deltoides_posterior": 6.5,
                  "deltoides_anterior": 4.5, "espalda": 10, "triceps": 10.5, "biceps": 10,
                  "cuadriceps": 11, "recto_femoral": 5, "isquiotibiales": 10, "gluteos": 4.5,
                  "pantorrillas": 10}
    return {
        "description": "Una semana completa de la rutina v1 desde la semana 3: tiene que dar la "
        "tabla de volumen de rutina-2026-10-20 (y el recto femoral, 5).",
        "exercises": exercises(),
        "sessions": sessions,
        "sets": sets,
        "expected": {
            "weekly_volume": [
                {
                    "week_start": "2026-11-02",
                    "muscles": {m: {"direct": direct[m], "fractional": fractional[m]}
                                for m in fractional},
                }
            ]
        },
    }


def edges() -> dict[str, object]:
    sessions = [
        session("domingo", "2026-11-08"),  # cierra la semana del lunes 2
        session("lunes", "2026-11-09"),  # abre la semana siguiente
        session("borrada", "2026-11-04", deleted=True),
    ]
    sets = [
        set_row(1, "domingo", "press-banca-barra", 1),
        set_row(2, "domingo", "press-banca-barra", 2, deleted=True),
        set_row(3, "borrada", "cruces-polea", 1),
        set_row(4, "lunes", "remo-t", 1),
        set_row(5, "lunes", "remo-t", 2),
    ]
    return {
        "description": "Semanas de lunes a domingo; las series y las sesiones borradas no cuentan; "
        "un músculo sin series en la semana no aparece.",
        "exercises": exercises(),
        "sessions": sessions,
        "sets": sets,
        "expected": {
            "weekly_volume": [
                {
                    "week_start": "2026-11-02",
                    "muscles": {
                        "pectoral": {"direct": 1, "fractional": 1},
                        "deltoides_anterior": {"direct": 0, "fractional": 0.5},
                        "triceps": {"direct": 0, "fractional": 0.5},
                    },
                },
                {
                    "week_start": "2026-11-09",
                    "muscles": {
                        "espalda": {"direct": 2, "fractional": 2},
                        "biceps": {"direct": 0, "fractional": 1},
                        "deltoides_posterior": {"direct": 0, "fractional": 1},
                    },
                },
            ]
        },
    }


def one_rm() -> dict[str, object]:
    sessions = [session("s1", "2026-11-02"), session("s2", "2026-11-05")]
    sets = [
        set_row(1, "s1", "press-banca-barra", 1, 80, 8),
        set_row(2, "s1", "press-banca-barra", 2, 80, 9),
        set_row(3, "s2", "press-banca-barra", 1, 100, 1),
        set_row(4, "s2", "press-banca-barra", 2, 70, 15),
        set_row(5, "s2", "press-banca-barra", 3, 90, 5, deleted=True),
        set_row(6, "s1", "dominadas", 1, 10, 8),
        set_row(7, "s1", "curl-mancuernas", 1, 14, 13),
    ]
    return {
        "description": "1RM estimado con Epley (peso × (1 + reps / 30)), solo con 12 repeticiones "
        "o menos y en ejercicios que lo admiten. La mejor marca ignora lo borrado.",
        "exercises": exercises(),
        "sessions": sessions,
        "sets": sets,
        "expected": {
            "e1rm_by_set": {
                "set-1": 101.3333, "set-2": 104.0, "set-3": 103.3333, "set-4": None,
                "set-5": 105.0, "set-6": None, "set-7": None,
            },
            "best_e1rm": {"press-banca-barra": 104.0, "dominadas": None, "curl-mancuernas": None},
        },
    }


if __name__ == "__main__":
    for name, data in {"rutina-semana-3": routine_week(), "bordes-semana": edges(),
                       "1rm-estimado": one_rm()}.items():
        target = HERE / f"{name}.json"
        target.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(target)
