from collections.abc import Callable
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.factories import (
    make_body_weight,
    make_exercise,
    make_routine,
    make_session,
    make_set,
    make_user,
)


def assert_rejected(db: Session, action: Callable[[], object]) -> None:
    with pytest.raises(IntegrityError), db.begin_nested():
        action()


def test_una_sola_rutina_vigente_por_usuario(db: Session) -> None:
    user = make_user(db)
    make_routine(db, user, version=1)
    make_routine(db, user, version=2, status="historica")

    assert_rejected(db, lambda: make_routine(db, user, version=3))


def test_otro_usuario_puede_tener_su_rutina_vigente(db: Session) -> None:
    make_routine(db, make_user(db))
    make_routine(db, make_user(db))


def test_version_repetida(db: Session) -> None:
    user = make_user(db)
    make_routine(db, user, version=1, status="historica")

    assert_rejected(db, lambda: make_routine(db, user, version=1))


def test_factor_solo_admite_1_y_medio(db: Session) -> None:
    user = make_user(db)

    assert_rejected(db, lambda: make_exercise(db, user, muscles={"pectoral": "0.7"}))


@pytest.mark.parametrize(("reps", "rir"), [(0, 2), (8, 6), (8, -1)])
def test_serie_invalida(db: Session, reps: int, rir: int) -> None:
    user = make_user(db)
    exercise = make_exercise(db, user)
    session = make_session(db, user)

    assert_rejected(db, lambda: make_set(db, session, exercise, reps=reps, rir=rir))


def test_serie_sin_rir(db: Session) -> None:
    user = make_user(db)
    make_set(db, make_session(db, user), make_exercise(db, user), rir=None)


def test_un_peso_por_dia_salvo_los_borrados(db: Session) -> None:
    user = make_user(db)
    day = date(2026, 10, 22)
    make_body_weight(db, user, day, deleted=True)
    make_body_weight(db, user, day)

    assert_rejected(db, lambda: make_body_weight(db, user, day, kg="72.5"))
