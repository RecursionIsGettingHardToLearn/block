"""
Entrenamiento del modelo de detección de anomalías en la votación.

Qué hace:
  1. Extrae features desde PostgreSQL (una fila por voto emitido) — usa features.py.
  2. Entrena un Isolation Forest sobre el comportamiento NORMAL.
  3. Valida inyectando anomalías sintéticas y mide la tasa de detección.
  4. Guarda TODO en un único archivo (ml/modelo/modelo.joblib): modelo, escalador,
     columnas y metadatos (fecha, nº de votos, tasa de detección). Un solo archivo
     hace trivial subir/descargar el modelo entrenado.

No necesita datos etiquetados: aprende cómo es un voto normal y marca lo raro.

Uso:
    pip install -r requirements.txt
    python entrenar_anomalias.py
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from features import COLUMNAS_MODELO, conectar, construir_features

MODELO_DIR = Path(__file__).resolve().parent / "modelo"
RUTA_MODELO = MODELO_DIR / "modelo.joblib"
CONTAMINATION = 0.02  # proporción esperada de anomalías; ajústalo a tu criterio


# ─────────────────────────────────────────────────────────────────────────────
# Validación con anomalías sintéticas
# ─────────────────────────────────────────────────────────────────────────────
# No tenemos fraude real, así que fabricamos casos claramente maliciosos y
# comprobamos que el modelo los marca. Esto da un número concreto para la defensa.
def generar_anomalias_sinteticas(n: int = 50) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    filas = []
    for _ in range(n):
        filas.append(
            {
                "hora_del_dia": rng.choice([2, 3, 4]),            # madrugada
                "dia_semana": rng.integers(0, 7),
                "latencia_confirmacion": rng.uniform(300, 900),    # latencia rarísima
                "votos_por_ip": rng.integers(40, 120),             # ballot stuffing
                "votos_por_agente": rng.integers(40, 120),         # mismo dispositivo
                "seg_desde_voto_ip_anterior": rng.uniform(0.2, 2), # ráfaga
                "votos_fallidos": rng.integers(5, 15),
                "intentos_dobles": rng.integers(1, 5),
                "logins_fallidos": rng.integers(5, 20),
                "seg_registro_a_voto": rng.uniform(1, 30),         # registró y votó al toque
            }
        )
    return pd.DataFrame(filas)[COLUMNAS_MODELO]


# ─────────────────────────────────────────────────────────────────────────────
# Entrenamiento (reutilizable: lo llama el CLI y el microservicio)
# ─────────────────────────────────────────────────────────────────────────────
def entrenar() -> dict[str, object]:
    """Entrena el modelo con los datos actuales de la BD, lo valida y lo guarda.
    Devuelve los metadatos (para mostrarlos en la interfaz). Lanza RuntimeError
    si no hay votos con qué entrenar."""
    with conectar() as conn:
        datos = construir_features(conn)

    if datos.empty:
        raise RuntimeError(
            "No hay votos en recibos_voto. Corre seed_massive.ts / "
            "simulate_votes.ts para tener datos con qué entrenar."
        )

    X = datos[COLUMNAS_MODELO].astype(float)

    escalador = StandardScaler()
    X_esc = escalador.fit_transform(X)

    modelo = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        random_state=42,
        n_jobs=-1,
    )
    modelo.fit(X_esc)

    # -- Validación con anomalías sintéticas ----------------------------------
    anomalias = generar_anomalias_sinteticas()
    pred_anom = modelo.predict(escalador.transform(anomalias))  # -1 = anomalía
    detectadas = int((pred_anom == -1).sum())
    tasa = detectadas / len(anomalias)

    pred_normal = modelo.predict(X_esc)
    falsos_positivos = int((pred_normal == -1).sum())

    meta: dict[str, object] = {
        "entrenado": True,
        "entrenadoEn": datetime.now(timezone.utc).isoformat(),
        "nVotos": int(len(X)),
        "tasaDeteccion": round(tasa, 4),
        "falsosPositivosPct": round(falsos_positivos / len(X), 4),
        "contamination": CONTAMINATION,
    }

    # -- Guardado: un único bundle con todo -----------------------------------
    MODELO_DIR.mkdir(exist_ok=True)
    joblib.dump(
        {
            "modelo": modelo,
            "escalador": escalador,
            "columnas": COLUMNAS_MODELO,
            "meta": meta,
        },
        RUTA_MODELO,
    )
    return meta


def main() -> None:
    print("Conectando a la base de datos y entrenando…")
    try:
        meta = entrenar()
    except RuntimeError as err:
        raise SystemExit(str(err))

    print("\n-- Validacion --------------------------------")
    print(f"Votos usados: {meta['nVotos']}")
    print(f"Anomalias sinteticas detectadas: {float(meta['tasaDeteccion']):.0%}")
    print(f"Falsos positivos: {float(meta['falsosPositivosPct']):.1%}")
    print(f"\nModelo guardado en {RUTA_MODELO}")


if __name__ == "__main__":
    main()
