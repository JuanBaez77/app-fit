"""app_user y muscle, con la semilla de músculos

Revision ID: 0001
Revises:
Create Date: 2026-10-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MUSCLES = [
    ("pectoral", "Pectoral", None),
    ("deltoides_anterior", "Deltoides anterior", None),
    ("deltoides_lateral", "Deltoides lateral", None),
    ("deltoides_posterior", "Deltoides posterior", None),
    ("espalda", "Espalda", None),
    ("triceps", "Tríceps", None),
    ("biceps", "Bíceps", None),
    ("cuadriceps", "Cuádriceps", None),
    ("recto_femoral", "Recto femoral", "cuadriceps"),
    ("isquiotibiales", "Isquiotibiales", None),
    ("gluteos", "Glúteos", None),
    ("pantorrillas", "Pantorrillas", None),
]


def upgrade() -> None:
    op.create_table(
        "app_user",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    muscle = op.create_table(
        "muscle",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("parent_id", sa.Text(), sa.ForeignKey("muscle.id")),
    )
    op.bulk_insert(
        muscle,
        [{"id": id_, "name": name, "parent_id": parent} for id_, name, parent in MUSCLES],
    )


def downgrade() -> None:
    op.drop_table("muscle")
    op.drop_table("app_user")
