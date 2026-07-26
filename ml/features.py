"""
Extracción de features — ÚNICA fuente de verdad.

Tanto el entrenamiento (entrenar_anomalias.py) como el servicio de scoring
(servicio_anomalias.py) importan de aquí. Es deliberado: si las features se
calcularan distinto al entrenar y al puntuar, el modelo recibiría datos que no
reconoce y las predicciones serían basura. Manteniéndolas en un solo lugar,
entrenamiento y producción ven exactamente lo mismo.

Lee las credenciales de la BD desde variables de entorno o desde backend/.env,
igual que db_config.ts.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pandas as pd
import psycopg2


# ─────────────────────────────────────────────────────────────────────────────
# Conexión a la BD (misma prioridad que db_config.ts: env > backend/.env)
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
# Consultas SQL
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

# Columnas identificatorias que acompañan a las features (para reportar el voto).
COLUMNAS_ID = ["id", "id_usuario", "id_eleccion", "creado_en", "direccion_ip"]

# Etiqueta legible por feature, para explicar POR QUÉ se marcó un voto.
MOTIVOS_LEGIBLES: dict[str, str] = {
    "hora_del_dia": "voto emitido en horario inusual",
    "latencia_confirmacion": "latencia de confirmación anómala",
    "votos_por_ip": "muchos votos desde la misma IP",
    "votos_por_agente": "muchos votos desde el mismo dispositivo",
    "seg_desde_voto_ip_anterior": "votos en ráfaga desde la misma IP",
    "votos_fallidos": "intentos de voto fallidos previos",
    "intentos_dobles": "intentos de voto doble",
    "logins_fallidos": "inicios de sesión fallidos previos",
    "seg_registro_a_voto": "registró y votó casi de inmediato",
}


def construir_features(conn) -> pd.DataFrame:
    """Devuelve un DataFrame con una fila por voto: columnas identificatorias
    (COLUMNAS_ID) + las 10 features del modelo (COLUMNAS_MODELO)."""
    votos = pd.read_sql(SQL_VOTOS, conn)
    senales = pd.read_sql(SQL_SENALES, conn)
    padron = pd.read_sql(SQL_PADRON, conn)

    if votos.empty:
        return votos

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
