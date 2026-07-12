#!/usr/bin/env bash
# ============================================================================
#  azure-provision.sh — Crea la infraestructura en Azure (se ejecuta UNA vez)
#
#  Se ejecuta desde tu máquina, no desde el servidor.
#  Requisitos: Azure CLI instalado y sesión iniciada (`az login`).
#
#  Levanta una sola máquina virtual Linux, porque el backend necesita hablar
#  con el demonio de Docker de su propio anfitrión para gestionar la red
#  Fabric. Por eso App Service, Container Apps y Container Instances no sirven:
#  ninguno expone el socket de Docker.
# ============================================================================
set -euo pipefail

# ─── Parámetros (ajustables por entorno) ────────────────────────────────────
RG="${RG:-rg-block-evoting}"
LOCATION="${LOCATION:-eastus}"
VM_NAME="${VM_NAME:-vm-block}"
VM_SIZE="${VM_SIZE:-Standard_B2ms}"   # 2 vCPU / 8 GB — Fabric levanta 7+ contenedores
ADMIN_USER="${ADMIN_USER:-azureuser}"
DNS_LABEL="${DNS_LABEL:-block-evoting-$RANDOM}"
DISK_SIZE="${DISK_SIZE:-64}"          # 30 GB se queda corto con las imágenes de Fabric
SSH_KEY="${SSH_KEY:-$HOME/.ssh/block_azure}"

echo "==> Grupo de recursos: $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --output none

# ─── Clave SSH ──────────────────────────────────────────────────────────────
if [ ! -f "$SSH_KEY" ]; then
  echo "==> Generando par de claves SSH en $SSH_KEY"
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "block-azure"
fi

# ─── Máquina virtual ────────────────────────────────────────────────────────
echo "==> Creando la máquina virtual $VM_NAME ($VM_SIZE)"
az vm create \
  --resource-group "$RG" \
  --name "$VM_NAME" \
  --image Ubuntu2204 \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --ssh-key-values "${SSH_KEY}.pub" \
  --public-ip-sku Standard \
  --public-ip-address-dns-name "$DNS_LABEL" \
  --os-disk-size-gb "$DISK_SIZE" \
  --output none

# ─── Puertos ────────────────────────────────────────────────────────────────
# Solo se abren 80 y 443. El backend (3000) y los puertos de Fabric (7050,
# 7051, 7054, 5984) quedan cerrados al exterior: el backend se publica a través
# del proxy inverso y la red Fabric solo se habla desde la propia máquina.
echo "==> Abriendo únicamente HTTP y HTTPS"
az vm open-port --resource-group "$RG" --name "$VM_NAME" --port 80  --priority 1001 --output none
az vm open-port --resource-group "$RG" --name "$VM_NAME" --port 443 --priority 1002 --output none

FQDN=$(az vm show -d --resource-group "$RG" --name "$VM_NAME" --query fqdns -o tsv)
IP=$(az vm show -d --resource-group "$RG" --name "$VM_NAME" --query publicIps -o tsv)

cat <<EOF

╔══════════════════════════════════════════════════════════════════════════╗
  Infraestructura lista.

  Dominio : $FQDN
  IP      : $IP
  Acceso  : ssh -i $SSH_KEY $ADMIN_USER@$FQDN

  Siguientes pasos:

  1) Copiar y ejecutar el aprovisionamiento del servidor:
       scp -i $SSH_KEY deploy/vm-bootstrap.sh $ADMIN_USER@$FQDN:~
       ssh -i $SSH_KEY $ADMIN_USER@$FQDN 'bash vm-bootstrap.sh $FQDN'

  2) Registrar estos secretos en GitHub
     (Settings → Secrets and variables → Actions):
       VM_HOST     = $FQDN
       VM_USER     = $ADMIN_USER
       VM_SSH_KEY  = contenido de $SSH_KEY   (la clave privada, completa)
╚══════════════════════════════════════════════════════════════════════════╝
EOF
