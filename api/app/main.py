from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.deps import DbSession
from app.routers import auth, me

app = FastAPI(title="app-fit API")
app.include_router(auth.router)
app.include_router(me.router)


@app.get("/health")
def health(db: DbSession) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "error", "db": "error"}, status_code=503)
    return JSONResponse({"status": "ok", "db": "ok"})
