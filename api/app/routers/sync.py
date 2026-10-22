from fastapi import APIRouter
from pydantic import AwareDatetime

from app.deps import CurrentUser, DbSession
from app.schemas_sync import PullOut, PushIn, PushOut
from app.services import sync

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/push")
def push(body: PushIn, user: CurrentUser, db: DbSession) -> PushOut:
    return sync.push(db, user, body)


@router.get("/pull")
def pull(user: CurrentUser, db: DbSession, since: AwareDatetime | None = None) -> PullOut:
    """Sin since devuelve todo (primer uso o dispositivo nuevo)."""
    return sync.pull(db, user, since)
