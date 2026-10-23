"""Comandos de administración.

    python -m app.cli create-user tu@correo.com
    python -m app.cli set-password tu@correo.com
    python -m app.cli interaction [tu@correo.com]

La contraseña se pide por teclado; para scripts, se puede pasar en APPFIT_PASSWORD.
"""

import argparse
import getpass
import os
import sys
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_engine
from app.models import AppUser
from app.security import hash_password
from app.services.interaction import report, weekly_interaction

MIN_PASSWORD_LENGTH = 10


def _read_password() -> str:
    password = os.environ.get("APPFIT_PASSWORD")
    if password is None:
        password = getpass.getpass("Contraseña: ")
        if getpass.getpass("Repetila: ") != password:
            sys.exit("Las contraseñas no coinciden.")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"La contraseña necesita al menos {MIN_PASSWORD_LENGTH} caracteres.")
    return password


def create_user(db: Session, email: str, password: str) -> AppUser:
    email = email.strip().lower()
    if db.scalar(select(AppUser).where(AppUser.email == email)):
        raise ValueError(f"Ya existe un usuario con el correo {email}.")
    user = AppUser(id=uuid.uuid4(), email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


def set_password(db: Session, email: str, password: str) -> None:
    user = db.scalar(select(AppUser).where(AppUser.email == email.strip().lower()))
    if user is None:
        raise ValueError(f"No hay un usuario con el correo {email}.")
    user.password_hash = hash_password(password)
    db.commit()


def interaction(db: Session, email: str | None) -> str:
    """La mediana semanal del tiempo por serie (T4.1). Sin correo, la del único usuario."""
    users = list(db.scalars(select(AppUser).order_by(AppUser.email)))
    if email is not None:
        users = [u for u in users if u.email == email.strip().lower()]
    if len(users) != 1:
        raise ValueError(
            "No hay un usuario con ese correo." if email else "Hay varios usuarios: pasá el correo."
        )
    return report(weekly_interaction(db, users[0].id))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create-user", "set-password"):
        commands.add_parser(name).add_argument("email")
    commands.add_parser("interaction", help="Mediana semanal del tiempo por serie").add_argument(
        "email", nargs="?"
    )
    args = parser.parse_args(argv)

    if args.command == "interaction":
        with sessionmaker(bind=get_engine())() as db:
            try:
                print(interaction(db, args.email))
            except ValueError as error:
                sys.exit(str(error))
        return

    password = _read_password()
    with sessionmaker(bind=get_engine())() as db:
        try:
            if args.command == "create-user":
                user = create_user(db, args.email, password)
                print(f"Usuario creado: {user.email} ({user.id})")
            else:
                set_password(db, args.email, password)
                print("Contraseña actualizada.")
        except ValueError as error:
            sys.exit(str(error))


if __name__ == "__main__":
    main()
