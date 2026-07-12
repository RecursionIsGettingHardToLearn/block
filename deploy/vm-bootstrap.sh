#!/usr/bin/env bash
# ============================================================================
#  vm-bootstrap.sh — Prepara el servidor y deja el sistema en marcha
#
#  Se ejecuta DENTRO de la máquina virtual, una sola vez:
#      bash vm-bootstrap.sh <dominio>
#
#  Ejemplo:
#      bash vm-bootstrap.sh block-evoting.eastus.cloudapp.azure.com
# ============================================================================
set -euo pipefail

DOMAIN="${1:?Falta el dominio. Uso: bash vm-bootstrap.sh <dominio>}"
REPO="https://github.com/RecursionIsGettingHardToLearn/block.git"
APP_DIR="/opt/block"
USER_NAME="$(whoami)"

# Base de datos: por omisión se levanta PostgreSQL en un contenedor local.
# Si se pasa DB_HOST por entorno (p. ej. el pooler de Supabase), se usa esa
# base externa y el contenedor local no se crea: ahorra ~400 MB de RAM, que
# es lo que permite que la máquina de 4 GB alcance.
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-evoting}"
DB_SSL="${DB_SSL:-false}"

log() { echo -e "\n\033[0;32m==> $1\033[0m"; }

# ─── 1. Paquetes base ───────────────────────────────────────────────────────
log "Actualizando el sistema"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git jq

# ─── 1b. Swap ───────────────────────────────────────────────────────────────
# En una máquina de 4 GB, la compilación del frontend con la red Fabric ya
# corriendo puede quedarse sin memoria. El swap evita el OOM sin costo extra.
if [ ! -f /swapfile ]; then
  log "Creando 4 GB de swap"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile > /dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

# ─── 2. Docker ──────────────────────────────────────────────────────────────
log "Instalando Docker"
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# El backend ejecuta `docker exec`, `docker run` y `docker cp` para gestionar
# la red Fabric. Sin esto no puede hablar con el demonio.
sudo usermod -aG docker "$USER_NAME"

# Los scripts de la red usan la sintaxis antigua `docker-compose`.
if ! command -v docker-compose &> /dev/null; then
  sudo ln -sf "$(command -v docker)" /usr/local/bin/docker-x
  printf '#!/bin/sh\nexec docker compose "$@"\n' | sudo tee /usr/local/bin/docker-compose > /dev/null
  sudo chmod +x /usr/local/bin/docker-compose
fi

# ─── 3. Node.js 22 ──────────────────────────────────────────────────────────
log "Instalando Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null
sudo apt-get install -y -qq nodejs

# ─── 4. Caddy (proxy inverso con TLS automático) ────────────────────────────
log "Instalando Caddy"
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
  sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq caddy

# ─── 5. Código fuente ───────────────────────────────────────────────────────
log "Clonando el repositorio en $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER_NAME:$USER_NAME" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ─── 6. Entorno del backend ─────────────────────────────────────────────────
log "Generando backend/.env"
if [ "$DB_HOST" = "localhost" ]; then
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
else
  : "${DB_PASSWORD:?Con una base externa hay que pasar DB_PASSWORD por entorno}"
fi
JWT="$(openssl rand -base64 48 | tr -d '\n')"

cat > backend/.env <<EOF
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
DB_SSL=${DB_SSL}

JWT_SECRET=${JWT}
JWT_EXPIRES_IN=8h

PORT=3000
FRONTEND_URL=https://${DOMAIN}

FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.ficct.edu.bo
FABRIC_MSP_ID=FICCTOrgMSP
FABRIC_CHANNEL=evoting
FABRIC_CHAINCODE=evoting-cc
FABRIC_CA_URL=https://localhost:7054
FABRIC_NETWORK_PATH=${APP_DIR}/fabric/network
EOF
chmod 600 backend/.env

# ─── 7. Base de datos ───────────────────────────────────────────────────────
if [ "$DB_HOST" = "localhost" ]; then
  log "Levantando PostgreSQL"
  POSTGRES_PASSWORD="$DB_PASSWORD" docker compose -f deploy/docker-compose.db.yml up -d
  echo "    Esperando a que la base acepte conexiones..."
  for _ in $(seq 1 30); do
    docker exec block-postgres pg_isready -U postgres -q && break
    sleep 2
  done
else
  log "Usando base de datos externa: ${DB_HOST} (no se levanta contenedor local)"
fi

# ─── 8. Red Fabric ──────────────────────────────────────────────────────────
# setup.sh genera el material criptográfico, levanta los contenedores, crea el
# canal y despliega el chaincode. Necesita al grupo docker recién asignado, de
# ahí el `sg docker`.
log "Levantando la red Hyperledger Fabric (tarda varios minutos)"
chmod +x fabric/network/scripts/*.sh
sg docker -c "bash fabric/network/scripts/setup.sh"

# cryptogen corre dentro de Docker como root, así que el material queda
# ilegible para el usuario del servicio; sin esto el backend arranca en
# modo offline con EACCES sobre la clave del Admin.
sudo chown -R "$USER_NAME:$USER_NAME" fabric/network/crypto-material

# ─── 9. Backend ─────────────────────────────────────────────────────────────
log "Compilando el backend"
npm ci --prefix backend
npm run build --prefix backend

log "Registrando el backend como servicio del sistema"
sudo cp deploy/block-backend.service /etc/systemd/system/
sudo sed -i "s|__USER__|${USER_NAME}|g; s|__APP_DIR__|${APP_DIR}|g" \
  /etc/systemd/system/block-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now block-backend

# ─── 10. Frontend ───────────────────────────────────────────────────────────
log "Compilando el frontend"
npm ci --prefix frontend
npm run build --prefix frontend   # usa .env.production => VITE_API_URL=/api

log "Configurando Caddy"
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i "s|__DOMAIN__|${DOMAIN}|g; s|__APP_DIR__|${APP_DIR}|g" /etc/caddy/Caddyfile
sudo chmod -R o+rx "$APP_DIR/frontend/dist"
sudo systemctl reload caddy || sudo systemctl restart caddy

# ─── Resumen ────────────────────────────────────────────────────────────────
cat <<EOF

╔══════════════════════════════════════════════════════════════════════════╗
  Sistema desplegado.

  Aplicación : https://${DOMAIN}
  API        : https://${DOMAIN}/api
  (Caddy emite el certificado TLS solo; el primer acceso puede tardar
   unos segundos mientras Let's Encrypt lo valida.)

  Diagnóstico:
    sudo systemctl status block-backend
    sudo journalctl -u block-backend -f
    docker ps

  La contraseña de la base y el secreto JWT quedaron en backend/.env
  (permisos 600). No están en el repositorio.
╚══════════════════════════════════════════════════════════════════════════╝
EOF
