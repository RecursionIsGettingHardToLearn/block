# Despliegue en Azure

Guía para poner Block (frontend, backend y red Hyperledger Fabric) en producción sobre Azure, con integración y despliegue continuos desde GitHub Actions.

---

## 1. Por qué una máquina virtual y no App Service

Conviene entenderlo antes de tocar nada, porque condiciona todo lo demás.

El backend **no es una aplicación web corriente**. Además de atender peticiones HTTP, administra la red Fabric desde dentro: ejecuta `docker exec` para instalar el chaincode y unir peers al canal, `docker run` para levantar peers nuevos, y `docker cp` para inyectarles su material criptográfico. Es decir, **necesita hablar con el demonio de Docker de su propia máquina**.

Eso descarta los servicios gestionados de Azure:

| Servicio | ¿Sirve? | Motivo |
|---|---|---|
| App Service | No | No expone el socket de Docker |
| Container Apps | No | Tampoco lo expone |
| Container Instances | No | No puede ejecutar comandos sobre contenedores hermanos |
| **Máquina virtual Linux** | **Sí** | Docker completo, red Fabric y backend conviviendo |
| AKS (Kubernetes) | Con reservas | Funciona, pero exigiría reescribir los 16 `docker exec` a `kubectl exec` |

Por la misma razón el backend corre **directamente sobre el anfitrión** (como servicio de systemd) y no dentro de un contenedor: su código resuelve rutas relativas a la raíz del repositorio y monta volúmenes por ruta. Encapsularlo obligaría a resolver el desajuste de rutas entre el contenedor y el anfitrión en cada operación, sin ganar nada a cambio.

## 2. Arquitectura desplegada

```
                          Internet
                             │
                     ┌───────▼────────┐
                     │  Caddy  :443   │  TLS automático (Let's Encrypt)
                     └───────┬────────┘
                  ┌──────────┴───────────┐
                  │                      │
              /  → frontend          /api/* → backend :3000
           (estático, dist/)         (NestJS, systemd)
                                          │
                        ┌─────────────────┼──────────────────┐
                        │                 │                  │
                   PostgreSQL      docker.sock         evoting_network
                   (contenedor)   (docker exec/run)          │
                                              ┌──────────────┴───────────────┐
                                              │ orderer · peer0 · peer1 · cli │
                                              │ couchdb0 · couchdb1 · CA      │
                                              └───────────────────────────────┘
```

Frontend y API **comparten origen**: el navegador nunca cruza dominios. Eso elimina de raíz los errores de CORS y el bloqueo por contenido mixto (una página `https` que intenta llamar a una API `http`), que es la forma más habitual de que un despliegue así se rompa.

Solo se abren al exterior los puertos **80 y 443**. La base de datos escucha únicamente en `127.0.0.1`, y los puertos de Fabric (7050, 7051, 7054, 5984) no salen de la máquina.

## 3. Requisitos

- Suscripción de Azure (la de estudiante sirve).
- Azure CLI instalado y sesión iniciada: `az login`.
- Permisos de administración sobre el repositorio en GitHub, para registrar los secretos.

## 4. Despliegue, paso a paso

### 4.1 Crear la infraestructura

Desde tu máquina, en la raíz del repositorio:

```bash
bash deploy/azure-provision.sh
```

Crea el grupo de recursos, la máquina virtual (Ubuntu 22.04, `Standard_B2ms`: 2 vCPU y 8 GB, que es lo mínimo razonable para siete contenedores de Fabric más el resto), el par de claves SSH, el nombre de dominio y las reglas de red. Al terminar imprime el dominio y el comando de acceso.

### 4.2 Aprovisionar el servidor

```bash
DOM=<el-dominio-que-imprimió-el-paso-anterior>
scp -i ~/.ssh/block_azure deploy/vm-bootstrap.sh azureuser@$DOM:~
ssh -i ~/.ssh/block_azure azureuser@$DOM "bash vm-bootstrap.sh $DOM"
```

Este script deja el sistema funcionando de extremo a extremo: instala Docker, Node 22 y Caddy; clona el repositorio; **genera la contraseña de la base y el secreto JWT** y los escribe en `backend/.env` con permisos `600`; levanta PostgreSQL; ejecuta `fabric/network/scripts/setup.sh` (material criptográfico, contenedores, canal y chaincode); compila el backend y lo registra como servicio; compila el frontend y configura Caddy.

Tarda varios minutos: la red Fabric es lo lento.

### 4.3 Registrar los secretos en GitHub

En **Settings → Secrets and variables → Actions**:

| Secreto | Valor |
|---|---|
| `VM_HOST` | El dominio de la máquina virtual |
| `VM_USER` | `azureuser` |
| `VM_SSH_KEY` | Contenido íntegro de `~/.ssh/block_azure` (la clave **privada**) |

Hecho esto, cada `push` a `main` ejecuta CI y, si pasa, despliega solo.

## 5. Los dos flujos de trabajo

**`ci.yml`** — en cada `push` y cada *pull request*. Corre, para backend, frontend y chaincode: ESLint, comprobación de tipos, pruebas unitarias (backend) y compilación. Es la aplicación automática de `ESTANDARES_CODIFICACION.md`.

**`deploy.yml`** — se dispara **solo si CI terminó en verde**, o a mano desde la pestaña *Actions*. Entra por SSH, actualiza el código, recompila backend y frontend, reinicia el servicio y comprueba que sigue vivo; si no, vuelca el registro y falla.

> **La red Fabric no se reinicia en cada despliegue.** Sus contenedores guardan el ledger: rehacerla implicaría regenerar el material criptográfico y **perder los votos ya emitidos**. Solo se rehace a propósito:
>
> ```bash
> ssh azureuser@$DOM 'cd /opt/block && bash fabric/network/scripts/setup.sh'
> ```

## 6. Diagnóstico

```bash
ssh azureuser@$DOM

sudo systemctl status block-backend      # ¿vive el backend?
sudo journalctl -u block-backend -f      # registro en vivo
docker ps                                # ¿están los 7 contenedores de Fabric?
docker logs peer0.ficct.edu.bo --tail 50
sudo journalctl -u caddy -n 30           # TLS y proxy inverso
```

**El certificado tarda en emitirse.** Caddy lo pide a Let's Encrypt en el primer acceso; si el navegador avisa de que el sitio no es seguro, espera un minuto y recarga.

**Si el backend no arranca**, casi siempre es una de dos cosas: no encuentra la base (revisa que el contenedor `block-postgres` esté arriba) o el usuario no está en el grupo `docker` (cierra la sesión SSH y vuelve a entrar, para que el grupo se aplique).

## 7. Si prefieres base de datos gestionada

El despliegue usa PostgreSQL en un contenedor: es lo más simple y la base es pequeña. Para pasar a **Azure Database for PostgreSQL**, ajusta `backend/.env`:

```env
DB_HOST=<tu-servidor>.postgres.database.azure.com
DB_USER=<usuario>
DB_PASSWORD=<contraseña>
DB_SSL=true
```

`DB_SSL=true` **no es opcional** con Azure: el servicio exige TLS y rechaza la conexión sin él. El backend ya lo contempla.

## 8. Costo

`Standard_B2ms` ronda los 30 USD al mes. Con los 100 USD de crédito de Azure for Students alcanza para unos tres meses. Para no gastar crédito mientras no lo usas:

```bash
az vm deallocate --resource-group rg-block-evoting --name vm-block   # detener
az vm start      --resource-group rg-block-evoting --name vm-block   # reanudar
```

Detenida (*deallocated*) no se cobra el cómputo, solo el disco. Al reanudarla, los contenedores vuelven solos y el backend también, porque ambos están configurados para arrancar con el sistema.
