# CLAUDE.md — Block · Sistema de Voto Electrónico

Guía de proyecto para Claude Code. Este archivo describe el sistema, los comandos disponibles y la tarea de despliegue en Azure que Claude Code puede ejecutar de forma autónoma.

---

## El sistema

**Block** es una plataforma de voto electrónico universitario sobre blockchain, escrita íntegramente en TypeScript:

| Módulo | Tecnología | Ruta |
|---|---|---|
| Backend | NestJS 11 + PostgreSQL | `backend/` |
| Frontend | React 19 + Vite | `frontend/` |
| Red blockchain | Hyperledger Fabric 2.5 | `fabric/network/` |
| Contrato inteligente | TypeScript (Fabric chaincode) | `chaincode/` |

## Comandos esenciales

```bash
# Verificar los tres módulos de una vez (lint + tipos)
npm run verify

# Correr los tests
npm test --prefix backend

# Arrancar en desarrollo
npm run start:dev --prefix backend
npm run dev      --prefix frontend
```

## Estándares de codificación

Ver `ESTANDARES_CODIFICACION.md`. La regla más importante: **`any` está prohibido** en los tres módulos. `npm run verify` debe pasar en verde antes de cualquier commit.

---

## Tarea: desplegar en Azure

> **Cuándo ejecutar esta tarea:** cuando el usuario diga "despliega en Azure", "ejecuta el despliegue" o algo equivalente.
>
> **Tiempo estimado:** 15-20 minutos (la red Fabric es lo lento).

Claude Code ejecuta los pasos en orden. Si alguno falla, detiene el proceso, muestra el error y le pregunta al usuario cómo continuar.

### Paso 0 — Verificar prerrequisitos

Ejecutar cada comprobación y detener si algo falta:

```bash
# Azure CLI
az version --output none 2>&1 || echo "FALTA: instalar Azure CLI — https://aka.ms/install-azure-cli"

# GitHub CLI
gh --version 2>&1 || echo "FALTA: instalar GitHub CLI — https://cli.github.com"

# Sesión activa en Azure
az account show --output table || echo "ACCIÓN: ejecutar 'az login' y volver a pedir el despliegue"

# Sesión activa en GitHub CLI
gh auth status || echo "ACCIÓN: ejecutar 'gh auth login' y volver a pedir el despliegue"

# El usuario tiene ssh-keygen
ssh-keygen --help > /dev/null 2>&1 || echo "FALTA: ssh-keygen no disponible"
```

Si `az account show` o `gh auth status` fallan, **interrumpir aquí** e indicarle al usuario el comando exacto que debe ejecutar antes de continuar.

### Paso 1 — Crear la infraestructura en Azure

```bash
chmod +x deploy/azure-provision.sh
bash deploy/azure-provision.sh
```

El script:
- Crea el grupo de recursos `rg-block-evoting` en `eastus`.
- Lanza una VM Ubuntu 22.04 `Standard_B2ms` (2 vCPU / 8 GB).
- Genera el par de claves SSH en `~/.ssh/block_azure` si no existe.
- Abre solo los puertos 80 y 443.
- Al terminar imprime el **dominio** y la **IP pública**.

Guardar el dominio para los pasos siguientes:

```bash
DOM=$(az vm show -d --resource-group rg-block-evoting --name vm-block --query fqdns -o tsv)
echo "Dominio: $DOM"
```

### Paso 2 — Aprovisionar el servidor

Copiar el script de bootstrap a la VM y ejecutarlo:

```bash
scp -i ~/.ssh/block_azure -o StrictHostKeyChecking=no \
    deploy/vm-bootstrap.sh azureuser@${DOM}:~/vm-bootstrap.sh

ssh -i ~/.ssh/block_azure -o StrictHostKeyChecking=no \
    azureuser@${DOM} "bash vm-bootstrap.sh ${DOM}"
```

Este paso tarda varios minutos porque `setup.sh` genera el material criptográfico, levanta los 7 contenedores de Fabric (orderer, 2 peers, 2 CouchDB, CA y cli), crea el canal y despliega el chaincode.

Cuando `vm-bootstrap.sh` termine se verá:

```
╔══════════════════════════════╗
  Sistema desplegado.
  Aplicación : https://<dominio>
╚══════════════════════════════╝
```

Si el script falla, diagnosticar con:

```bash
ssh -i ~/.ssh/block_azure azureuser@${DOM} \
    "sudo journalctl -u block-backend -n 30 --no-pager; docker ps"
```

### Paso 3 — Registrar los secretos en GitHub

Estos tres secretos son los que activan el workflow `deploy.yml`:

```bash
# Clave privada completa (el workflow entra por SSH con ella)
gh secret set VM_SSH_KEY  < ~/.ssh/block_azure

# Dominio de la máquina virtual
gh secret set VM_HOST  --body "${DOM}"

# Usuario de la VM (siempre azureuser cuando se crea con el script)
gh secret set VM_USER  --body "azureuser"
```

Verificar que los tres quedaron registrados:

```bash
gh secret list | grep -E "VM_HOST|VM_USER|VM_SSH_KEY"
```

### Paso 4 — Lanzar el primer despliegue

El workflow ya se dispara automáticamente con cada push. Para forzarlo ahora:

```bash
gh workflow run deploy.yml
sleep 10
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

### Paso 5 — Verificar que todo funciona

```bash
# El backend responde
curl -sf "https://${DOM}/api" > /dev/null \
  && echo "✔ API responde" \
  || echo "✗ La API no responde aún (puede que el certificado TLS tarde 1-2 min)"

# El frontend carga
curl -sf "https://${DOM}" > /dev/null \
  && echo "✔ Frontend accesible" \
  || echo "✗ El frontend no responde"

# Los contenedores de Fabric están corriendo
ssh -i ~/.ssh/block_azure azureuser@${DOM} \
    "docker ps --format '{{.Names}}\t{{.Status}}'"
```

Si el navegador avisa de un certificado inválido los primeros segundos, es normal: Caddy negocia con Let's Encrypt en el primer acceso. Esperar un minuto y recargar.

### Paso 6 — Reportar el resultado

Al terminar, mostrar al usuario un resumen con:

- URL de la aplicación: `https://${DOM}`
- URL de la API: `https://${DOM}/api`
- Los 5 contenedores de Fabric que deben estar `Up`
- El estado del servicio backend: `sudo systemctl is-active block-backend`
- Recordatorio: **revocar el token de GitHub** que está en el historial del chat (`github_pat_11BAUU…`).

---

## Tarea: actualizar el despliegue

Cuando el usuario diga "actualiza el servidor" o "redespliega":

```bash
gh workflow run deploy.yml
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

El workflow se encarga del resto. La red Fabric **no** se reinicia (sus contenedores guardan el ledger).

## Tarea: reiniciar la red Fabric desde cero

⚠️ Esto **borra todos los votos** almacenados en el ledger. Solo hacerlo si el usuario lo pide explícitamente y confirma que lo entiende.

```bash
DOM=$(gh secret list --json name,value 2>/dev/null | python3 -c "import sys,json;[print(s['value']) for s in json.load(sys.stdin) if s['name']=='VM_HOST']" 2>/dev/null \
  || az vm show -d --resource-group rg-block-evoting --name vm-block --query fqdns -o tsv)

ssh -i ~/.ssh/block_azure azureuser@${DOM} \
    "cd /opt/block && bash fabric/network/scripts/teardown.sh && bash fabric/network/scripts/setup.sh"
```

## Tarea: apagar la VM para no gastar crédito

```bash
az vm deallocate --resource-group rg-block-evoting --name vm-block
echo "VM detenida. Para reanudar: az vm start --resource-group rg-block-evoting --name vm-block"
```

Detenida (*deallocated*) no cobra cómputo, solo el disco (~1 USD/mes).

## Tarea: destruir toda la infraestructura

```bash
az group delete --name rg-block-evoting --yes --no-wait
gh secret delete VM_HOST && gh secret delete VM_USER && gh secret delete VM_SSH_KEY
rm -f ~/.ssh/block_azure ~/.ssh/block_azure.pub
echo "Infraestructura eliminada."
```

---

## Arquitectura de red en la VM

```
Internet : 443
     │
  Caddy (TLS automático — Let's Encrypt)
     ├── /api/*  →  backend NestJS :3000  (systemd)
     │                    │
     │          docker.sock del anfitrión
     │                    │
     │            evoting_network
     │     orderer · peer0 · peer1 · CA
     │     couchdb0 · couchdb1 · cli
     │
     └── /*      →  frontend (estático, dist/)
                        │
                  PostgreSQL :5432
                  (solo 127.0.0.1)
```

Solo los puertos **80 y 443** están abiertos al exterior. La base de datos y los puertos de Fabric son internos.

## Diagnóstico rápido

```bash
# Ver logs del backend en vivo
ssh -i ~/.ssh/block_azure azureuser@${DOM} "sudo journalctl -u block-backend -f"

# Estado de los contenedores
ssh -i ~/.ssh/block_azure azureuser@${DOM} "docker ps"

# Logs de un peer
ssh -i ~/.ssh/block_azure azureuser@${DOM} "docker logs peer0.ficct.edu.bo --tail 30"
```
