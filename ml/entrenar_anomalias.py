"""
Entrenamiento del modelo de detección de anomalías en la votación.

Qué hace, en orden:
  1. Extrae features desde PostgreSQL (una fila por voto emitido).
  2. Entrena un Isolation Forest sobre el comportamiento NORMAL.
  3. Valida inyectando anomalías sintéticas y mide la tasa de detección.
  4. Guarda el modelo + el escalador en disco (ml/modelo/).

No necesita datos etiquetados: aprende cómo es un voto normal y marca lo raro.

Uso:
    pip install -r requirements.txt
    python entrenar_anomalias.py

Lee las credenciales de la BD desde variables de entorno o desde backend/.env,
igual que db_config.ts (una sola fuente de verdad).
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


# ─────────────────────────────────────────────────────────────────────────────
# 1. Conexión a la BD (misma prioridad que db_config.ts: env > backend/.env)
# ─────────────────────────────────────────────────────────────────────────────
def leer_backend_env() -> dict[str, str]:
    ruta = Path(__file__).resolve().parent.parent / "backend" / ".env"
    valores: dict[str, str] = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", linea)
            if m:
                valores[m.group(1)] = m.group(2).strip("\"'")
    return valores


def conectar() -> psycopg2.extensions.connection:
    env = leer_backend_env()

    def leer(clave: str, por_defecto: str) -> str:
        return os.environ.get(clave) or env.get(clave) or por_defecto

    return psycopg2.connect(
        host=leer("DB_HOST", "localhost"),
        port=int(leer("DB_PORT", "5432")),
        user=leer("DB_USER", "postgres"),
        password=leer("DB_PASSWORD", ""),
        dbname=leer("DB_NAME", "evoting_db"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. Extracción de features — una fila por voto emitido
# ─────────────────────────────────────────────────────────────────────────────
# La IP y el agente de usuario se toman del evento VOTO_EMITIDO correspondiente
# (recibos_voto no los guarda; eventos_auditoria sí).
SQL_VOTOS = """
SELECT
    r.id,
    r.id_usuario,
    r.id_eleccion,
    r.creado_en,
    r.confirmado_en,
    ea.direccion_ip,
    ea.agente_usuario
FROM recibos_voto r
LEFT JOIN LATERAL (
    SELECT e.direccion_ip, e.agente_usuario
    FROM eventos_auditoria e
    WHERE e.id_usuario = r.id_usuario
      AND e.accion = 'VOTO_EMITIDO'
    ORDER BY e.creado_en DESC
    LIMIT 1
) ea ON TRUE
ORDER BY r.creado_en;
"""

# Conteos por usuario de señales de riesgo (intentos fallidos, votos dobles, etc.)
SQL_SENALES = """
SELECT
    id_usuario,
    COUNT(*) FILTER (WHERE accion = 'VOTO_FALLIDO')          AS votos_fallidos,
    COUNT(*) FILTER (WHERE accion = 'INTENTO_VOTO_DOBLE')    AS intentos_dobles,
    COUNT(*) FILTER (WHERE accion = 'INICIO_SESION_FALLIDO') AS logins_fallidos
FROM eventos_auditoria
WHERE id_usuario IS NOT NULL
GROUP BY id_usuario;
"""

# Tiempo entre el registro en el padrón y la emisión del voto (segundos).
SQL_PADRON = """
SELECT
    id_usuario,
    id_eleccion,
    EXTRACT(EPOCH FROM (votado_en - inscrito_en)) AS seg_registro_a_voto
FROM padron_electoral
WHERE voto_emitido = TRUE AND votado_en IS NOT NULL;
"""

# Nombres de las columnas que entran al modelo (orden fijo → reproducible).
COLUMNAS_MODELO = [
    "hora_del_dia",
    "dia_semana",
    "latencia_confirmacion",
    "votos_por_ip",
    "votos_por_agente",
    "seg_desde_voto_ip_anterior",
    "votos_fallidos",
    "intentos_dobles",
    "logins_fallidos",
    "seg_registro_a_voto",
]


def construir_features(conn) -> pd.DataFrame:
    votos = pd.read_sql(SQL_VOTOS, conn)
    senales = pd.read_sql(SQL_SENALES, conn)
    padron = pd.read_sql(SQL_PADRON, conn)

    if votos.empty:
        raise SystemExit(
            "No hay votos en recibos_voto. Corre primero seed_massive.ts / "
            "simulate_votes.ts para tener datos con qué entrenar."
        )

    votos["creado_en"] = pd.to_datetime(votos["creado_en"], utc=True)
    votos["confirmado_en"] = pd.to_datetime(votos["confirmado_en"], utc=True)

    # -- Features temporales --------------------------------------------------
    votos["hora_del_dia"] = votos["creado_en"].dt.hour
    votos["dia_semana"] = votos["creado_en"].dt.dayofweek
    votos["latencia_confirmacion"] = (
        votos["confirmado_en"] - votos["creado_en"]
    ).dt.total_seconds()

    # -- Frecuencia por IP y por dispositivo ----------------------------------
    votos["votos_por_ip"] = votos.groupby(
        ["id_eleccion", "direccion_ip"]
    )["id"].transform("count")
    votos["votos_por_agente"] = votos.groupby(
        ["id_eleccion", "agente_usuario"]
    )["id"].transform("count")

    # -- Ráfaga: segundos desde el voto anterior de la MISMA IP ---------------
    votos = votos.sort_values("creado_en")
    votos["seg_desde_voto_ip_anterior"] = (
        votos.groupby(["id_eleccion", "direccion_ip"])["creado_en"]
        .diff()
        .dt.total_seconds()
    )

    # -- Señales de riesgo por usuario ----------------------------------------
    votos = votos.merge(senales, on="id_usuario", how="left")
    votos = votos.merge(padron, on=["id_usuario", "id_eleccion"], how="left")

    # Rellenar nulos con valores neutros (sin señal = 0; sin voto previo = grande)
    votos["seg_desde_voto_ip_anterior"] = votos["seg_desde_voto_ip_anterior"].fillna(1e6)
    votos["latencia_confirmacion"] = votos["latencia_confirmacion"].fillna(
        votos["latencia_confirmacion"].median()
    )
    votos["seg_registro_a_voto"] = votos["seg_registro_a_voto"].fillna(1e6)
    for col in ["votos_fallidos", "intentos_dobles", "logins_fallidos"]:
        votos[col] = votos[col].fillna(0)

    return votos


# ─────────────────────────────────────────────────────────────────────────────
# 3. Validación con anomalías sintéticas
# ─────────────────────────────────────────────────────────────────────────────
# No tenemos fraude real, así que fabricamos casos claramente maliciosos y
# comprobamos que el modelo los marca. Esto da un número concreto para la defensa.
def generar_anomalias_sinteticas(base: pd.DataFrame, n: int = 50) -> pd.DataFrame:
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
# 4. Entrenamiento
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    print("Conectando a la base de datos…")
    with conectar() as conn:
        datos = construir_features(conn)

    X = datos[COLUMNAS_MODELO].astype(float)
    print(f"Votos para entrenar: {len(X)}  |  features: {len(COLUMNAS_MODELO)}")

    escalador = StandardScaler()
    X_esc = escalador.fit_transform(X)

    modelo = IsolationForest(
        n_estimators=200,
        contamination=0.02,   # ~2% esperado de anomalías; ajústalo a tu criterio
        random_state=42,
        n_jobs=-1,
    )
    modelo.fit(X_esc)

    # -- Validación -----------------------------------------------------------
    anomalias = generar_anomalias_sinteticas(X)
    pred_anom = modelo.predict(escalador.transform(anomalias))  # -1 = anomalía
    detectadas = int((pred_anom == -1).sum())
    tasa = detectadas / len(anomalias)

    pred_normal = modelo.predict(X_esc)
    falsos_positivos = int((pred_normal == -1).sum())

    print("\n── Validación ─────────────────────────────")
    print(f"Anomalías sintéticas detectadas: {detectadas}/{len(anomalias)} "
          f"({tasa:.0%})")
    print(f"Falsos positivos sobre votos reales: {falsos_positivos}/{len(X)} "
          f"({falsos_positivos/len(X):.1%})")

    # -- Guardado -------------------------------------------------------------
    salida = Path(__file__).resolve().parent / "modelo"
    salida.mkdir(exist_ok=True)
    joblib.dump(modelo, salida / "isolation_forest.joblib")
    joblib.dump(escalador, salida / "escalador.joblib")
    (salida / "columnas.txt").write_text("\n".join(COLUMNAS_MODELO), encoding="utf-8")
    print(f"\nModelo guardado en {salida}/")


if __name__ == "__main__":
    main()
