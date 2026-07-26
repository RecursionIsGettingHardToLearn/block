# Cómo demostrar que los votos están DE VERDAD en la blockchain

Guía para probar, ante un ingeniero o tribunal, que los votos no están
"inventados" en la base de datos, sino registrados en el ledger de Hyperledger
Fabric. La idea central: **la terminal consulta el ledger crudo de Fabric, sin
pasar por la aplicación**. Si el dato está ahí, es real — no hay forma de que la
app lo "finja".

Datos del entorno (ajusta si cambian):

- Canal: `evoting`
- Chaincode: `evoting-cc`
- Contrato: `FicctVoting`
- Organización (MSP): `FICCTOrgMSP`
- Contenedores: `peer0.ficct.edu.bo`, `peer1.ficct.edu.bo`, `orderer.ficct.edu.bo`, `cli`
- Elección de ejemplo (TEST): `8c9348b6-0463-4a86-823f-21fc13d8c91c`

---

## La idea que convence al ingeniero

Un escéptico dirá: *"esos votos pueden estar solo en tu PostgreSQL; la app los
muestra pero no prueba que estén en la blockchain."* Tiene razón en dudar. La
respuesta es: **consultemos el ledger de Fabric directamente, por fuera de la
app.** Fabric es una base de datos distribuida e inmutable; si el voto está en
su ledger, ninguna aplicación pudo "inventarlo" — tuvo que pasar por el consenso
de los peers y quedar firmado criptográficamente.

Vamos a mostrar tres cosas, cada una más contundente:

1. **El conteo vive en el ledger** (no solo en Postgres).
2. **Cada voto es una transacción real** con su bloque, consultable por su txId.
3. **La cadena de bloques crece** con cada voto y está enlazada por hashes.

---

## Demostración 1 — El conteo está en el ledger de Fabric

Preguntamos al chaincode, directamente por la terminal, cuántos votos tiene la
elección. Este número **sale del ledger de Fabric**, no de la app ni de Postgres.

```bash
docker exec cli peer chaincode query \
  -C evoting \
  -n evoting-cc \
  -c '{"function":"FicctVoting:getResultados","Args":["8c9348b6-0463-4a86-823f-21fc13d8c91c"]}'
```

Esto devuelve el tally (conteo por candidato) tal como está guardado en el
ledger. **Compáralo con lo que muestra la app**: deben coincidir exactamente. Si
la app dice "MAS 32, MENOS 26, MUL 5" y la terminal dice lo mismo, es porque
ambos leen la misma verdad — la blockchain.

> Punto para el ingeniero: "Este comando no toca mi backend ni mi base de datos.
> Le pregunta al chaincode desplegado en los peers. El número viene del ledger."

---

## Demostración 2 — Cada voto es una transacción real en un bloque

Toma cualquier `txId` de la tabla "Transacciones en la blockchain" del panel de
auditoría (o del comprobante de un votante) y consúltalo directamente en el
ledger. Fabric te dirá en qué **bloque** quedó y su contenido.

```bash
# Reemplaza <TX_ID> por un id de transacción real de la tabla de auditoría
docker exec cli peer chaincode query \
  -C evoting \
  -n evoting-cc \
  -c '{"function":"FicctVoting:verificarVoto","Args":["<TX_ID>"]}'
```

Y para ver el **bloque** que contiene esa transacción (esto lee el bloque crudo
del ledger, con su hash):

```bash
docker exec cli peer channel fetch newest /tmp/ultimo.block -c evoting
docker exec cli configtxlator proto_decode \
  --type common.Block --input /tmp/ultimo.block | head -50
```

> Punto para el ingeniero: "Este txId que aparece en el comprobante del votante
> corresponde a una transacción que existe en el bloque N del ledger. No la
> escribí yo en una tabla; la produjo el consenso de Fabric."

---

## Demostración 3 — La cadena crece y está enlazada por hashes

Mostrar la altura de la cadena (cuántos bloques hay). Cada voto añade
transacciones, y los bloques se encadenan: cada uno contiene el hash del
anterior, de modo que **alterar un voto viejo rompería toda la cadena**.

```bash
docker exec cli peer channel getinfo -c evoting
```

Devuelve algo como:

```json
{"height":73,"currentBlockHash":"...","previousBlockHash":"..."}
```

- `height` = número de bloques. Vota una vez más y vuelve a correrlo: **sube**.
- `currentBlockHash` / `previousBlockHash` = el encadenamiento criptográfico.

> Punto para el ingeniero: "La altura sube con cada voto, y cada bloque apunta al
> hash del anterior. Esa es la propiedad de inmutabilidad: no se puede cambiar un
> voto pasado sin recalcular todos los hashes siguientes, lo cual es
> detectable."

---

## El guión de la demo (orden sugerido, 5 minutos)

1. **Muestra la app** — panel de auditoría con los 67 votos y "Integridad
   verificada". Di: *"esto es lo que ve un auditor."*
2. **Abre la terminal** — corre la **Demostración 1** (conteo desde el ledger).
   Señala que el número coincide con la app. Di: *"pero no me crean a mí ni a mi
   app; preguntémosle a la blockchain directamente."*
3. **Toma un txId** del comprobante de un votante y corre la **Demostración 2**.
   Di: *"este voto concreto existe en el ledger, en un bloque real."*
4. **Corre la Demostración 3** (altura de la cadena). Emite un voto nuevo desde
   la app y vuelve a correrla para que vean **la altura subir en vivo**. Di:
   *"cada voto es un bloque nuevo, encadenado e inmutable."*
5. **Cierre**: *"la app es solo una ventana; la verdad vive en el ledger de
   Fabric, que es distribuido, firmado e inmutable. Los votos son reales."*

---

## Si un comando falla

- **"container cli is not running"** → la red Fabric no está levantada. Corre
  `arrancar-red.ps1` primero.
- **"cannot find chaincode"** → confirma el nombre con
  `docker exec cli peer lifecycle chaincode querycommitted -C evoting`.
- **El nombre del contrato** en `-c` es `FicctVoting:funcion`. Si tu versión no
  usa el prefijo del contrato, prueba solo `"function":"funcion"`.
- **TLS**: si tu red exige TLS en las consultas, agrega las flags
  `--tls --cafile <ruta_ca_orderer>` (revisa tu `docker-compose.yml`).

---

## Por qué esto es "real" y no se puede fingir

- La app podría, en teoría, mostrar cualquier número. **La terminal no** — habla
  con el chaincode desplegado en los peers, que solo responde con lo que está en
  el ledger.
- El ledger de Fabric es **append-only** (solo se agrega) y cada bloque está
  firmado y encadenado por hash. Un voto en el ledger tuvo que ser endosado por
  los peers y ordenado por el orderer: no hay un `INSERT` que lo falsifique.
- El **txId** del comprobante del votante es el mismo que aparece en el ledger.
  Esa correspondencia, verificable por cualquiera, es la prueba de que el voto
  del ciudadano quedó registrado en la cadena.

---

## Comandos para Windows 11 (PowerShell) — paso a paso

Ejecutar desde **PowerShell** en tu PC, con la red Fabric levantada
(`arrancar-red.ps1`). La imagen del `cli` es `hyperledger/fabric-tools:2.5`, que
incluye `peer` y `configtxlator`, así que estos comandos funcionan tal cual.

### 0. Verificar que la red corre

```powershell
docker ps
```

Deben aparecer: `cli`, `peer0.ficct.edu.bo`, `peer1.ficct.edu.bo`,
`orderer.ficct.edu.bo`, `ca.ficct.edu.bo`, `couchdb0`, `couchdb1`.

### 1. Altura de la cadena (número de bloques)

```powershell
docker exec cli peer channel getinfo -c evoting
```

Devuelve `{"height":N,...}`. Vota desde la app y vuelve a correrlo: **N sube**.

### 2. Conteo de votos leído del ledger

En PowerShell las comillas dobles internas se escapan con `\"`:

```powershell
docker exec cli peer chaincode query -C evoting -n evoting-cc -c '{\"function\":\"FicctVoting:getResultados\",\"Args\":[\"8c9348b6-0463-4a86-823f-21fc13d8c91c\"]}'
```

El resultado debe coincidir con lo que muestra la app.

### 3. Verificar un voto concreto por su txId

Toma un txId de la tabla de auditoría o del comprobante de un votante:

```powershell
docker exec cli peer chaincode query -C evoting -n evoting-cc -c '{\"function\":\"FicctVoting:verificarVoto\",\"Args\":[\"PEGA_AQUI_EL_TXID\"]}'
```

### 4. Descargar el último bloque y leerlo

```powershell
docker exec cli peer channel fetch newest /tmp/ultimo.block -c evoting
docker exec cli configtxlator proto_decode --type common.Block --input /tmp/ultimo.block
```

El segundo comando imprime el bloque en JSON: verás su número, el hash del
bloque anterior (`previous_hash`) y las transacciones que contiene. Esa es la
prueba cruda de que el voto vive en un bloque encadenado.

### Notas para Windows

- Si un comando con comillas da error de sintaxis, prueba a envolver todo el
  `-c '...'` en comillas simples (como arriba) y escapar solo las dobles
  internas con `\"`.
- Alternativa sin escapes: abre una shell dentro del cli y ahí usa comillas
  normales:
  ```powershell
  docker exec -it cli bash
  # ya dentro del contenedor (comillas normales de Linux):
  peer channel getinfo -c evoting
  peer chaincode query -C evoting -n evoting-cc -c '{"function":"FicctVoting:getResultados","Args":["8c9348b6-0463-4a86-823f-21fc13d8c91c"]}'
  exit
  ```
- Docker Desktop debe estar corriendo (el icono de la ballena activo).
