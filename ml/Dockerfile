# Microservicio de detección de anomalías (FastAPI + scikit-learn).
#
# Build:  docker build -t block-anomalias ./ml
# Run:    docker run --rm -p 8100:8100 \
#             -e DB_HOST=... -e DB_USER=... -e DB_PASSWORD=... -e DB_NAME=... \
#             -v "$PWD/ml/modelo:/app/modelo" \
#             block-anomalias
#
# El volumen monta el modelo entrenado (ml/modelo/). Entrena una vez en el host
# con `python entrenar_anomalias.py` y el contenedor lo carga desde ahí.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY features.py servicio_anomalias.py entrenar_anomalias.py ./

EXPOSE 8100

CMD ["uvicorn", "servicio_anomalias:app", "--host", "0.0.0.0", "--port", "8100"]
