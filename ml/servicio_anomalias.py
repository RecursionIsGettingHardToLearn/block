"""
Microservicio de detección de anomalías. El backend NestJS lo consulta (nunca el
navegador directamente).

Endpoints:
  GET  /salud                     -> estado básico + si el modelo está entrenado
  GET  /estado                    -> metadatos del modelo (fecha, nº votos, tasa…)
  POST /entrenar                  -> entrena con los datos actuales, devuelve meta
  POST /modelo   (archivo .joblib)-> reemplaza el modelo activo por uno subido
  GET  /anomalias?eleccion=<id>   -> puntúa los votos y devuelve banderas + motivos
  POST /puntuar  {"votos":[...]}  -> puntúa vectores de features (pruebas)

El modelo, el escalador y sus metadatos viven en un único archivo
(ml/modelo/modelo.joblib), lo que hace trivial subirlo/descargarlo.

Uso:
    uvicorn servicio_anomalias:app --host 0.0.0.0 --port 8100
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel

import entrenar_anomalias
from entrenar_anomalias import RUTA_MODELO
from features import (
    COLUMNAS_MODELO,
    MOTIVOS_LEGIBLES,
    conectar,
    construir_features,
)

# Bundle en memoria (perezoso). Se recarga tras entrenar o subir un modelo.
_bundle: Optional[dict[str, object]] = None


def cargar_bundle() -> dict[str, object]:
    global _bundle
    if _bundle is None:
        if not RUTA_MODELO.exists():
            raise HTTPException(
                status_code=503,
                detail="Modelo no entrenado. Entrena el modelo o sube uno.",
            )
        _bundle = joblib.load(RUTA_MODELO)
    return _bundle


def invalidar_cache() -> None:
    global _bundle
    _bundle = None


def leer_meta() -> dict[str, object]:
    if not RUTA_MODELO.exists():
        return {"entrenado": False}
    try:
        bundle = cargar_bundle()
        meta = bundle.get("meta")
        if isinstance(meta, dict):
            return meta
    except Exception:
        pass
    return {"entrenado": False}


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
    return {"estado": "ok", "modeloEntrenado": RUTA_MODELO.exists()}


@app.get("/estado")
def estado() -> dict[str, object]:
    return leer_meta()


@app.post("/entrenar")
def entrenar() -> dict[str, object]:
    try:
        meta = entrenar_anomalias.entrenar()
    except RuntimeError as err:
        raise HTTPException(status_code=409, detail=str(err))
    invalidar_cache()
    return meta


@app.post("/modelo")
async def subir_modelo(archivo: UploadFile = File(...)) -> dict[str, object]:
    """Reemplaza el modelo activo por uno subido. El archivo debe ser un bundle
    .joblib con las claves 'modelo', 'escalador' y 'columnas' (el mismo formato
    que genera el entrenamiento).

    Aviso: joblib usa pickle; cargar un archivo de una fuente no confiable puede
    ejecutar código. Este endpoint está detrás de autenticación (ADMIN/AUDITOR)
    en el backend justamente por eso — sube solo modelos que tú generaste."""
    contenido = await archivo.read()
    try:
        bundle = joblib.load(io.BytesIO(contenido))
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es un .joblib válido.")

    if not isinstance(bundle, dict) or not {"modelo", "escalador", "columnas"} <= set(bundle):
        raise HTTPException(
            status_code=400,
            detail="El modelo no tiene el formato esperado (modelo/escalador/columnas).",
        )

    RUTA_MODELO.parent.mkdir(exist_ok=True)
    RUTA_MODELO.write_bytes(contenido)
    invalidar_cache()
    return leer_meta()


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
            if col == "seg_desde_voto_ip_anterior":
                if z < -2.5:
                    motivos.append(MOTIVOS_LEGIBLES[col])
            elif abs(z) > 2.5:
                motivos.append(MOTIVOS_LEGIBLES[col])
    return motivos


@app.get("/anomalias")
def anomalias(eleccion: Optional[str] = None) -> dict[str, object]:
    bundle = cargar_bundle()
    modelo = bundle["modelo"]
    escalador = bundle["escalador"]

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

    resultados.sort(key=lambda r: r["score"])  # más anómalo primero
    return {
        "total": len(resultados),
        "anomalas": int((etiquetas == -1).sum()),
        "resultados": resultados,
    }


@app.post("/puntuar")
def puntuar(peticion: Peticion) -> dict[str, list[dict[str, object]]]:
    bundle = cargar_bundle()
    modelo = bundle["modelo"]
    escalador = bundle["escalador"]
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
