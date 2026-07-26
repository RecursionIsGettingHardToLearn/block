"""
Microservicio de scoring. Carga el modelo entrenado y expone un endpoint que
el backend NestJS puede consultar para puntuar votos (individuales o en lote).

Uso:
    pip install -r requirements.txt
    uvicorn servicio_anomalias:app --host 0.0.0.0 --port 8100

Endpoint:
    POST /puntuar   body: {"votos": [{...features...}, ...]}
    ->  {"resultados": [{"anomalia": bool, "score": float}, ...]}

Cuanto más negativo el score, más anómalo. anomalia=True cuando el modelo lo
marca como atípico.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

MODELO_DIR = Path(__file__).resolve().parent / "modelo"
COLUMNAS = (MODELO_DIR / "columnas.txt").read_text(encoding="utf-8").splitlines()

modelo = joblib.load(MODELO_DIR / "isolation_forest.joblib")
escalador = joblib.load(MODELO_DIR / "escalador.joblib")

app = FastAPI(title="Block · Detección de anomalías")


class Voto(BaseModel):
    hora_del_dia: float
    dia_semana: float
    latencia_confirmacion: float
    votos_por_ip: float
    votos_por_agente: float
    seg_desde_voto_ip_anterior: float
    votos_fallidos: float
    intentos_dobles: float
    logins_fallidos: float
    seg_registro_a_voto: float


class Peticion(BaseModel):
    votos: list[Voto]


@app.get("/salud")
def salud() -> dict[str, str]:
    return {"estado": "ok"}


@app.post("/puntuar")
def puntuar(peticion: Peticion) -> dict[str, list[dict[str, float | bool]]]:
    X = np.array([[getattr(v, c) for c in COLUMNAS] for v in peticion.votos], dtype=float)
    X_esc = escalador.transform(X)
    scores = modelo.score_samples(X_esc)          # más negativo = más anómalo
    etiquetas = modelo.predict(X_esc)             # -1 anómalo, 1 normal
    return {
        "resultados": [
            {"anomalia": bool(e == -1), "score": float(s)}
            for e, s in zip(etiquetas, scores)
        ]
    }
