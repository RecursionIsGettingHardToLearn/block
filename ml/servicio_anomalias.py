"""
Microservicio de scoring de anomalías. El backend NestJS lo consulta (nunca el
navegador directamente).

Carga el modelo entrenado y expone:

  GET  /salud
       -> {"estado": "ok", "modeloEntrenado": bool}

  GET  /anomalias?eleccion=<id>
       Extrae features de la BD, puntúa TODOS los votos (de esa elección si se
       pasa `eleccion`, o de todas si no) y devuelve los resultados ordenados
       del más anómalo al menos. Cada voto trae su bandera, su score y los
       motivos por los que se marcó. Esta es la ruta que usa el panel de auditor.

  POST /puntuar   body: {"votos": [{...features...}, ...]}
       Puntúa vectores de features ya calculados (útil para pruebas puntuales).

Cuanto más negativo el score, más anómalo.

Uso:
    pip install -r requirements.txt
    uvicorn servicio_anomalias:app --host 0.0.0.0 --port 8100
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from features import (
    COLUMNAS_ID,
    COLUMNAS_MODELO,
    MOTIVOS_LEGIBLES,
    conectar,
    construir_features,
)

MODELO_DIR = Path(__file__).resolve().parent / "modelo"

# El modelo puede no existir todavía (si aún no se ha entrenado). Se carga de
# forma perezosa para que el servicio arranque igual y responda un error claro.
_modelo = None
_escalador = None


def cargar_modelo() -> tuple[object, object]:
    global _modelo, _escalador
    if _modelo is None or _escalador is None:
        ruta_modelo = MODELO_DIR / "isolation_forest.joblib"
        ruta_escalador = MODELO_DIR / "escalador.joblib"
        if not ruta_modelo.exists() or not ruta_escalador.exists():
            raise HTTPException(
                status_code=503,
                detail="Modelo no entrenado. Corre 'python entrenar_anomalias.py' primero.",
            )
        _modelo = joblib.load(ruta_modelo)
        _escalador = joblib.load(ruta_escalador)
    return _modelo, _escalador


def modelo_entrenado() -> bool:
    return (MODELO_DIR / "isolation_forest.joblib").exists()


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
def salud() -> dict[str, object]:
    return {"estado": "ok", "modeloEntrenado": modelo_entrenado()}


def _motivos(fila: pd.Series, media: pd.Series, desv: pd.Series) -> list[str]:
    """Features que se desvían mucho de lo normal (z-score > 2.5), traducidas a
    texto. Explica por qué el modelo marcó este voto."""
    motivos: list[str] = []
    for col in COLUMNAS_MODELO:
        if col not in MOTIVOS_LEGIBLES:
            continue
        sigma = desv[col]
        if sigma and sigma > 0:
            z = (fila[col] - media[col]) / sigma
            # Solo direcciones "hacia arriba" salvo la ráfaga (hacia abajo = rápido).
            if col == "seg_desde_voto_ip_anterior":
                if z < -2.5:
                    motivos.append(MOTIVOS_LEGIBLES[col])
            elif abs(z) > 2.5:
                motivos.append(MOTIVOS_LEGIBLES[col])
    return motivos


@app.get("/anomalias")
def anomalias(eleccion: Optional[str] = None) -> dict[str, object]:
    modelo, escalador = cargar_modelo()

    with conectar() as conn:
        datos = construir_features(conn)

    if datos.empty:
        return {"total": 0, "anomalas": 0, "resultados": []}

    if eleccion:
        datos = datos[datos["id_eleccion"].astype(str) == str(eleccion)]
        if datos.empty:
            return {"total": 0, "anomalas": 0, "resultados": []}

    X = datos[COLUMNAS_MODELO].astype(float)
    X_esc = escalador.transform(X)
    scores = modelo.score_samples(X_esc)   # más negativo = más anómalo
    etiquetas = modelo.predict(X_esc)      # -1 anómalo, 1 normal

    media = X.mean()
    desv = X.std(ddof=0)

    datos = datos.reset_index(drop=True)
    resultados = []
    for i in range(len(datos)):
        es_anomalia = bool(etiquetas[i] == -1)
        fila = datos.iloc[i]
        resultados.append(
            {
                "id": str(fila["id"]),
                "idUsuario": str(fila["id_usuario"]),
                "idEleccion": str(fila["id_eleccion"]),
                "creadoEn": pd.Timestamp(fila["creado_en"]).isoformat(),
                "direccionIp": None if pd.isna(fila["direccion_ip"]) else str(fila["direccion_ip"]),
                "anomalia": es_anomalia,
                "score": round(float(scores[i]), 4),
                "motivos": _motivos(X.iloc[i], media, desv) if es_anomalia else [],
            }
        )

    # Más anómalo primero.
    resultados.sort(key=lambda r: r["score"])
    return {
        "total": len(resultados),
        "anomalas": int((etiquetas == -1).sum()),
        "resultados": resultados,
    }


@app.post("/puntuar")
def puntuar(peticion: Peticion) -> dict[str, list[dict[str, object]]]:
    modelo, escalador = cargar_modelo()
    X = np.array(
        [[getattr(v, c) for c in COLUMNAS_MODELO] for v in peticion.votos],
        dtype=float,
    )
    X_esc = escalador.transform(X)
    scores = modelo.score_samples(X_esc)
    etiquetas = modelo.predict(X_esc)
    return {
        "resultados": [
            {"anomalia": bool(e == -1), "score": round(float(s), 4)}
            for e, s in zip(etiquetas, scores)
        ]
    }
