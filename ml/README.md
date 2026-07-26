# Detección de anomalías en la votación

Modelo no supervisado (Isolation Forest) que aprende cómo es un voto **normal**
y marca los atípicos: ballot stuffing, ráfagas desde una IP, votos en horario
inusual, intentos fallidos previos, etc. No necesita datos etiquetados como
fraude — no los tenemos.

## Arquitectura

```
PostgreSQL ──> features.py ──> Isolation Forest
                  │                   │
                  │            entrenar_anomalias.py  (entrena y guarda modelo/)
                  │                   │
                  └──> servicio_anomalias.py (FastAPI :8100)
                              │
                              ▲  GET /audit/anomalies  (con JWT + rol AUDITOR)
                       backend NestJS  ──────>  Panel del auditor (frontend)
```

`features.py` es la **única fuente de verdad** de las features: lo usan tanto el
entrenamiento como el servicio, para que el modelo vea exactamente lo mismo al
entrenar y al puntuar. El navegador nunca habla con el microservicio: siempre
pasa por el backend, que añade autenticación.

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

### 1. Entrenar

Necesita votos en la BD (usa `seed_massive.ts` / `simulate_votes.ts` si hace
falta). Luego:

```bash
python entrenar_anomalias.py
```

Extrae las features, entrena el modelo, lo valida con anomalías sintéticas
(imprime la tasa de detección) y lo guarda en `ml/modelo/`.

### 2. Levantar el microservicio

```bash
uvicorn servicio_anomalias:app --host 0.0.0.0 --port 8100
```

Endpoints:

- `GET /salud` → estado y si el modelo está entrenado.
- `GET /anomalias?eleccion=<id>` → todos los votos con su bandera, score y
  motivos, los más anómalos primero. **Esta es la que consume el backend.**
- `POST /puntuar` → puntúa vectores de features ya calculados (pruebas).

### 3. Backend

El backend expone `GET /audit/anomalies?electionId=<id>` (rol ADMIN/AUDITOR),
que hace de proxy al microservicio. Configura la URL si no es la de por defecto:

```
# backend/.env
ANOMALY_SERVICE_URL=http://localhost:8100
```

### 4. Frontend

El **Panel de Auditoría** (`AuditorDashboard`) muestra los votos marcados al
seleccionar una elección. Si el microservicio está caído o el modelo aún no se
entrenó, el resto del panel sigue funcionando y solo aparece un aviso.

## Docker

```bash
docker build -t block-anomalias ./ml
docker run --rm -p 8100:8100 \
  -e DB_HOST=... -e DB_USER=... -e DB_PASSWORD=... -e DB_NAME=... \
  -v "$PWD/ml/modelo:/app/modelo" \
  block-anomalias
```

## Ajustes

- `contamination` en `entrenar_anomalias.py`: proporción esperada de anomalías.
- Umbrales de las anomalías sintéticas (`generar_anomalias_sinteticas`) y de los
  motivos (z-score en `features.py` / `servicio_anomalias.py`): ajústalos a lo
  que consideres sospechoso en tu contexto.

## Nota

El modelo señala **patrones inusuales, no fraude confirmado**. Es una ayuda para
que el auditor revise manualmente, no un veredicto.
