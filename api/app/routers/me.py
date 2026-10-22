import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.deps import CurrentUser

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: uuid.UUID
    email: str


@router.get("/me")
def me(user: CurrentUser) -> MeOut:
    return MeOut(id=user.id, email=user.email)
