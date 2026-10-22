from fastapi import FastAPI

app = FastAPI(title="app-fit API")


# PR-02 suma el chequeo de la base de datos.
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
