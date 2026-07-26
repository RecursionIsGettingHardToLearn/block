# Detección de anomalías en la votación (módulo IA)

Modelo no supervisado (Isolation Forest) que aprende cómo es un voto **normal**
y marca los atípicos: ballot stuffing, ráfagas desde una IP, votos en horario
inusual, intentos fallidos previos, etc. No necesita datos etiquetados como
fraude — no los tenemos.

## Arquitectura

```
PostgreSQL ──> features.py ──> Isolation Forest
                  │                   │
                  │            entrenar_anomalias.py  (entrena y guarda modelo/modelo.joblib)
                  │                   │
                  └──> servicio_anomalias.py (FastAPI :8100)
                              │
                              ▲  /ai/*  (con JWT + rol ADMIN/AUDITOR)
                       backend NestJS  ──────>  Sección "IA" (frontend)
```

`features.py` es la **única fuente de verdad** de las features: lo usan tanto el
entrenamiento como el servicio, para que el modelo vea exactamente lo mismo al
entrenar y al puntuar. El navegador nunca habla con el microservicio: siempre
pasa por el backend, que añade autenticación.

El modelo, el escalador y sus metadatos (fecha, nº de votos, tasa de detección)
viven en un **único archivo** `ml/modelo/modelo.joblib`, lo que hace trivial
subirlo o descargarlo desde la interfaz.

## Puesta en marcha

```bash
cd ml
python -m venv .venv
.venv/Scripts/Activate.ps1      # Windows PowerShell
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
```

Las credenciales de la BD se leen de `backend/.env` (o de variables de entorno),
igual que `db_config.ts`.

### 1. Levantar el microservicio

```bash
uvicorn servicio_anomalias:app --host 0.0.0.0 --port 8100
```

### 2. Entrenar

Se puede entrenar de dos formas:

- **Desde la interfaz:** en la sección "IA" (menú de admin o auditor), botón
  "Entrenar modelo". Requiere votos en la BD (usa `seed_massive.ts` /
  `simulate_votes.ts` si hace falta).
- **Desde la terminal:** `python entrenar_anomalias.py`.

Cualquiera de las dos extrae las features, entrena el modelo, lo valida con
anomalías sintéticas (imprime/devuelve la tasa de detección) y lo guarda en
`ml/modelo/modelo.joblib`.

## Endpoints del microservicio

- `GET /salud` → estado básico + si el modelo está entrenado.
- `GET /estado` → metadatos del modelo (fecha, nº votos, tasa de detección…).
- `POST /entrenar` → entrena con los datos actuales, devuelve los metadatos.
- `POST /modelo` (archivo `.joblib`) → reemplaza el modelo activo por uno subido.
- `GET /anomalias?eleccion=<id>` → todos los votos con su bandera, score y
  motivos, los más anómalos primero.
- `POST /puntuar` → puntúa vectores de features ya calculados (pruebas).

El backend los expone bajo `/ai/*` (rol ADMIN/AUDITOR): `GET /ai/status`,
`POST /ai/train`, `POST /ai/upload`, `GET /ai/anomalies`.

Configura la URL del microservicio si no es la de por defecto:

```
# backend/.env
ANOMALY_SERVICE_URL=http://localhost:8100
```

## Docker

```bash
docker build -t block-anomalias ./ml
docker run --rm -p 8100:8100 \
  -e DB_HOST=... -e DB_USER=... -e DB_PASSWORD=... -e DB_NAME=... \
  -v "$PWD/ml/modelo:/app/modelo" \
  block-anomalias
```

## Ajustes

- `CONTAMINATION` en `entrenar_anomalias.py`: proporción esperada de anomalías.
- Umbrales de las anomalías sintéticas (`generar_anomalias_sinteticas`) y de los
  motivos (z-score en `servicio_anomalias.py`): ajústalos a lo que consideres
  sospechoso en tu contexto.

## Notas

- El modelo señala **patrones inusuales, no fraude confirmado**. Es una ayuda
  para que el auditor revise manualmente, no un veredicto.
- `POST /modelo` carga un `.joblib` con `joblib`/pickle, que puede ejecutar
  código al deserializar. Por eso está detrás de autenticación en el backend —
  sube solo modelos que tú mismo generaste.
