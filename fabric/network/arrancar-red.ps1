# ============================================================================
#  arrancar-red.ps1 — Levanta la red Fabric SIN perder el ledger.
#
#  El ritual de cada mañana en Windows: al reiniciar Docker Desktop, los
#  contenedores que montan archivos o sockets del host (peers, orderer, cli)
#  quedan con montajes huérfanos de WSL y no vuelven solos. Recrearlos
#  arregla los montajes; los volúmenes con nombre —donde viven los votos—
#  no se tocan.
#
#  NO confundir con restart-network.ps1: ese regenera el material
#  criptográfico y BORRA la cadena. Este solo re-levanta lo que ya existe.
# ============================================================================
Write-Host "Levantando la red Fabric (conserva el ledger)..." -ForegroundColor Cyan
docker compose up -d --force-recreate

Write-Host ""
Write-Host "Contenedores:" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}"

Write-Host ""
Write-Host "Listo. Refresca la app: los nodos se registran solos." -ForegroundColor Green
