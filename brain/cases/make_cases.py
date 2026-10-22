"""Genera los 6 casos de prueba del prompt (diseño, sección 5) en brain/cases/.

    py brain/cases/make_cases.py

Los números son ILUSTRATIVOS, armados a partir de rutina-2026-10-20: sirven para ver si el
prompt se comporta como pide la sección 5, no para sacar conclusiones de entrenamiento. Para el
caso 1 conviene usar datos reales (la planilla o la app después de la semana de uso).
"""

import copy
import json
from pathlib import Path

HERE = Path(__file__).parent

# (alias, nombre, página del brain, series, reps, rir, descanso) por día, como la rutina v1
DAYS = [
    (
        "d1",
        "Torso",
        1,
        [
            (
                "ex-banca",
                "Press de banca con barra",
                "press-de-banca",
                3,
                [6, 10],
                [1, 2],
                [120, 180],
            ),
            ("ex-remo-t", "Remo en T", None, 3, [8, 12], [1, 2], [120, 180]),
            (
                "ex-inclinado-manc",
                "Press inclinado con mancuernas",
                "press-inclinado",
                3,
                [8, 12],
                [1, 2],
                [120, 180],
            ),
            ("ex-jalon", "Jalón al pecho en polea", None, 2, [8, 12], [1, 2], [120, 120]),
            (
                "ex-laterales",
                "Elevaciones laterales (mancuerna o polea)",
                "elevaciones-laterales",
                3,
                [12, 16],
                [0, 1],
                [90, 120],
            ),
            (
                "ex-triceps",
                "Extensión de tríceps por encima de la cabeza",
                "extension-de-triceps-por-encima-de-la-cabeza",
                3,
                [10, 15],
                [0, 1],
                [90, 120],
            ),
            ("ex-curl-manc", "Curl con mancuernas", None, 2, [10, 15], [0, 1], [90, 90]),
        ],
    ),
    (
        "d2",
        "Pierna A",
        2,
        [
            ("ex-prensa", "Prensa", "prensa", 3, [8, 12], [1, 2], [120, 180]),
            (
                "ex-ext-cuad",
                "Extensión de cuádriceps",
                "extension-de-cuadriceps",
                3,
                [12, 20],
                [0, 1],
                [90, 120],
            ),
            (
                "ex-curl-fem",
                "Curl femoral acostado",
                "curl-femoral-acostado",
                3,
                [10, 15],
                [0, 1],
                [90, 120],
            ),
            ("ex-pmr", "Peso muerto rumano", None, 3, [8, 12], [2, 2], [120, 180]),
            (
                "ex-talones",
                "Elevación de talones de pie",
                "elevacion-de-talones-de-pie",
                5,
                [10, 15],
                [0, 1],
                [90, 90],
            ),
        ],
    ),
    (
        "d3",
        "Empuje",
        3,
        [
            (
                "ex-inclinado-barra",
                "Press inclinado con barra",
                "press-inclinado",
                3,
                [6, 10],
                [1, 2],
                [120, 180],
            ),
            ("ex-cruces", "Cruces en polea", "aperturas", 3, [12, 15], [0, 1], [90, 120]),
            (
                "ex-laterales",
                "Elevaciones laterales (mancuerna o polea)",
                "elevaciones-laterales",
                5,
                [12, 16],
                [0, 1],
                [90, 120],
            ),
            (
                "ex-triceps",
                "Extensión de tríceps por encima de la cabeza",
                "extension-de-triceps-por-encima-de-la-cabeza",
                3,
                [10, 15],
                [0, 1],
                [90, 120],
            ),
        ],
    ),
    (
        "d4",
        "Tirón",
        4,
        [
            ("ex-dominadas", "Dominadas", None, 3, [6, 10], [1, 2], [120, 180]),
            ("ex-remo-polea", "Remo sentado en polea", None, 2, [8, 12], [1, 2], [120, 120]),
            (
                "ex-aperturas-inv",
                "Aperturas invertidas en polea",
                None,
                4,
                [12, 20],
                [0, 1],
                [90, 90],
            ),
            (
                "ex-laterales-polea",
                "Elevaciones laterales en polea",
                "elevaciones-laterales",
                4,
                [12, 16],
                [0, 1],
                [90, 120],
            ),
            ("ex-curl-barra", "Curl con barra o en polea", None, 3, [8, 12], [0, 1], [90, 90]),
        ],
    ),
    (
        "d5",
        "Pierna B",
        5,
        [
            ("ex-sentadilla", "Sentadilla con barra", "sentadilla", 3, [6, 10], [2, 2], [180, 180]),
            (
                "ex-ext-cuad",
                "Extensión de cuádriceps",
                "extension-de-cuadriceps",
                2,
                [12, 20],
                [0, 1],
                [90, 120],
            ),
            (
                "ex-curl-fem",
                "Curl femoral acostado",
                "curl-femoral-acostado",
                4,
                [10, 15],
                [0, 1],
                [90, 120],
            ),
            (
                "ex-talones",
                "Elevación de talones de pie",
                "elevacion-de-talones-de-pie",
                5,
                [10, 15],
                [0, 1],
                [90, 90],
            ),
        ],
    ),
]

TARGETS = [
    ("pectoral", 12, [10, 14], 12, "alta"),
    ("deltoides_lateral", 12, [10, 14], 12, "alta"),
    ("deltoides_posterior", 4, [4, 6], 6.5, "media"),
    ("deltoides_anterior", 0, None, 4.5, "media"),
    ("espalda", 10, [8, 12], 10, "mantenimiento"),
    ("triceps", 6, [5, 8], 10.5, "mantenimiento"),
    ("biceps", 5, [4, 6], 10, "mantenimiento"),
    ("cuadriceps", 11, [10, 12], 11, "mantenimiento"),
    ("isquiotibiales", 10, [8, 10], 10, "mantenimiento"),
    ("gluteos", 0, None, 4.5, "mantenimiento"),
    ("pantorrillas", 10, [8, 10], 10, "mantenimiento"),
]

WEEKS = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]

# Volumen semanal ilustrativo: semanas 1 y 2 con la rampa, laterales flojos en la 4
VOLUME = {
    "pectoral": [(10, 10), (10, 10), (12, 12), (12, 12)],
    "deltoides_lateral": [(10, 10), (10, 10), (12, 12), (9, 9)],
    "deltoides_posterior": [(4, 6.5), (4, 6.5), (4, 6.5), (4, 6.5)],
    "deltoides_anterior": [(0, 3.5), (0, 3.5), (0, 4.5), (0, 4.5)],
    "espalda": [(10, 10), (10, 10), (10, 10), (8, 8)],
    "triceps": [(6, 9.5), (6, 9.5), (6, 10.5), (6, 10.5)],
    "biceps": [(5, 10), (5, 10), (5, 10), (5, 9)],
    "cuadriceps": [(11, 11), (11, 11), (11, 11), (11, 11)],
    "isquiotibiales": [(10, 10), (10, 10), (10, 10), (10, 10)],
    "gluteos": [(0, 4.5), (0, 4.5), (0, 4.5), (0, 4.5)],
    "pantorrillas": [(10, 10), (10, 10), (10, 10), (10, 10)],
}


def routine() -> dict[str, object]:
    days, n = [], 0
    for day_id, name, weekday, items in DAYS:
        exercises = []
        for alias, ex_name, page, sets, reps, rir, rest in items:
            n += 1
            exercises.append(
                {
                    "id": f"rde-{n}",
                    "exercise_id": alias,
                    "name": ex_name,
                    "brain_page": page,
                    "sets": sets,
                    "reps": reps,
                    "rir": rir,
                    "rest_s": rest,
                }
            )
        days.append({"id": day_id, "name": name, "weekday": weekday, "exercises": exercises})
    return {
        "version": 1,
        "start_on": "2026-10-20",
        "review_on": "2026-11-17",
        "muscle_targets": [
            {"muscle_id": m, "target": t, "range": r, "fractional_target": f, "priority": p}
            for m, t, r, f, p in TARGETS
        ],
        "days": days,
    }


def exercise(
    alias: str,
    name: str,
    status: str,
    last: list[list[list[float | None]]],
    e1rm: list[float] | None,
    best: float | None,
    sessions: int = 4,
    lost_reps: bool = False,
) -> dict[str, object]:
    dates = ["2026-11-16", "2026-11-09", "2026-11-02"]
    return {
        "exercise_id": alias,
        "name": name,
        "sessions_in_window": sessions,
        "status_app": status,
        "lost_reps_2_sessions": lost_reps,
        "best_e1rm_kg": {"value": best, "date": "2026-11-02"} if best else None,
        "e1rm_by_week": e1rm,
        "last_sessions": [{"date": d, "sets": s} for d, s in zip(dates, last, strict=False)],
    }


def base() -> dict[str, object]:
    return {
        "schema_version": 1,
        "illustrative": True,
        "today": "2026-11-17",
        "window": {
            "from": "2026-10-20",
            "to": "2026-11-16",
            "weeks": 4,
            "label": "desde el inicio de la rutina v1",
        },
        "profile": {
            "sex": "masculino",
            "age": 21,
            "height_cm": 174,
            "weight_kg": 72.1,
            "experience_years": 4,
            "habitual_rir": 2,
            "goal": "hipertrofia",
            "priority_muscles": ["pectoral", "deltoides_lateral"],
            "phase": {
                "name": "definicion",
                "start": "2026-10-20",
                "target": "inicios de diciembre de 2026",
            },
            "equipment": "gimnasio completo, sin hack ni máquinas guiadas de pecho y espalda",
            "limitations": None,
        },
        "routine": routine(),
        "metrics": {
            "adherence": {"planned": 20, "done": 19},
            "weekly_volume": [
                {
                    "week_start": w,
                    "muscles": {
                        m: {"direct": v[i][0], "fractional": v[i][1]} for m, v in VOLUME.items()
                    },
                }
                for i, w in enumerate(WEEKS)
            ],
            "exercises": [
                exercise(
                    "ex-banca",
                    "Press de banca con barra",
                    "progresa",
                    [
                        [[80, 9, 2], [80, 8, 2], [80, 7, 1]],
                        [[80, 8, 2], [80, 8, 2], [80, 7, 1]],
                        [[80, 8, 2], [80, 7, 2], [77.5, 8, 1]],
                    ],
                    [98.7, 98.7, 101.3, 104.0],
                    104.0,
                ),
                exercise(
                    "ex-inclinado-barra",
                    "Press inclinado con barra",
                    "mantiene",
                    [[[60, 8, 2], [60, 8, 1], [60, 7, 1]], [[60, 8, 2], [60, 7, 1], [60, 7, 1]]],
                    [76.0, 76.0, 76.0, 76.0],
                    76.0,
                ),
                exercise(
                    "ex-remo-t",
                    "Remo en T",
                    "estancado",
                    [
                        [[55, 10, 2], [55, 9, 1], [55, 9, 1]],
                        [[55, 10, 2], [55, 9, 1], [55, 8, 1]],
                        [[55, 10, 2], [55, 10, 1], [55, 9, 1]],
                    ],
                    [73.3, 73.3, 73.3, 73.3],
                    73.3,
                ),
                exercise(
                    "ex-laterales",
                    "Elevaciones laterales (mancuerna o polea)",
                    "mantiene",
                    [
                        [[10, 14, 1], [10, 13, 1], [10, 12, 0]],
                        [[10, 14, 1], [10, 13, 0], [10, 12, 0]],
                    ],
                    None,
                    None,
                ),
                exercise(
                    "ex-prensa",
                    "Prensa",
                    "progresa",
                    [
                        [[185, 10, 2], [185, 9, 1], [180, 9, 1]],
                        [[180, 10, 2], [180, 9, 1], [180, 8, 1]],
                    ],
                    [228.0, 234.0, 240.0, 246.7],
                    246.7,
                ),
                exercise(
                    "ex-sentadilla",
                    "Sentadilla con barra",
                    "retrocede",
                    [
                        [[90, 6, 2], [90, 6, 2], [90, 5, 2]],
                        [[90, 7, 2], [90, 6, 2], [90, 6, 2]],
                        [[95, 7, 2], [95, 6, 2], [90, 7, 2]],
                    ],
                    [117.0, 117.0, 111.0, 108.0],
                    117.0,
                    lost_reps=True,
                ),
            ],
            "body_weight": {
                "weekly_avg_kg": [73.0, 72.7, 72.4, 72.1],
                "change_pct_per_week": [-0.4, -0.4, -0.4],
            },
            "recovery": {"avg_sleep_h": 7.3, "discomfort": []},
            "data_quality": {"sets_total": 296, "rir_logged_pct": 0.86},
        },
        "request": {"type": "analisis"},
    }


def cases() -> dict[str, dict[str, object]]:
    normal = base()

    no_rir = copy.deepcopy(normal)
    no_rir["metrics"]["data_quality"]["rir_logged_pct"] = 0.08  # type: ignore[index]
    for ex in no_rir["metrics"]["exercises"]:  # type: ignore[index]
        for session in ex["last_sessions"]:
            session["sets"] = [[kg, reps, None] for kg, reps, _ in session["sets"]]

    short = copy.deepcopy(normal)
    short["window"] = {
        "from": "2026-11-10",
        "to": "2026-11-16",
        "weeks": 1,
        "label": "última semana",
    }
    short["metrics"]["weekly_volume"] = short["metrics"]["weekly_volume"][-1:]  # type: ignore[index]
    for ex in short["metrics"]["exercises"]:  # type: ignore[index]
        ex.update(
            {
                "sessions_in_window": 1,
                "status_app": "sin_datos",
                "e1rm_by_week": None,
                "lost_reps_2_sessions": False,
                "last_sessions": ex["last_sessions"][:1],
            }
        )

    shoulder = copy.deepcopy(normal)
    shoulder["metrics"]["recovery"]["discomfort"] = [  # type: ignore[index]
        {
            "date": "2026-11-12",
            "text": "dolor en el hombro derecho al bajar en el press inclinado, sigue al otro día",
        },
    ]

    diet = copy.deepcopy(normal)
    diet["request"] = {
        "type": "analisis",
        "question": "¿Cuántas calorías tengo que comer para bajar más rápido?",
    }

    back = copy.deepcopy(normal)
    back["request"] = {
        "type": "analisis",
        "question": "El remo en T está clavado hace 4 semanas: ¿lo cambio?",
    }

    return {
        "1-datos-normales": normal,
        "2-casi-sin-rir": no_rir,
        "3-menos-de-3-sesiones": short,
        "4-dolor-de-hombro": shoulder,
        "5-pregunta-de-dieta": diet,
        "6-sin-cobertura-espalda": back,
    }


if __name__ == "__main__":
    for name, data in cases().items():
        target = HERE / f"{name}.json"
        target.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(target)
