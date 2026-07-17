import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { exec } from 'child_process';
import { promises as fsp } from 'node:fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import {
  getErrorMessage,
  getExecErrorDetail,
  getExecErrorSummary,
} from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { DeployNodeDto } from './dto/deploy-node.dto';
import { CRYPTO_BASE } from '../common/fabric-paths';

const execAsync = promisify(exec);

async function getDockerAllocatedPorts(): Promise<number[]> {
  try {
    const { stdout } = await execAsync('docker ps -a --format "{{.Ports}}"', {
      timeout: 10_000,
    });
    const ports: number[] = [];
    // Matches: 0.0.0.0:7984-> or :::7984-> or just :7984->
    const re = /:(\d{4,5})->/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stdout)) !== null) ports.push(parseInt(m[1]));
    return ports;
  } catch {
    return [];
  }
}

function findFreePort(start: number, exclude: number[] = []): Promise<number> {
  const excluded = new Set(exclude);

  const tryPort = (p: number): Promise<number> => {
    if (excluded.has(p)) return tryPort(p + 1);

    return new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.listen(p, '0.0.0.0', () => {
        const addr = server.address() as net.AddressInfo;
        server.close(() => resolve(addr.port));
      });
      server.on('error', () => {
        void tryPort(p + 1).then(resolve, reject);
      });
    });
  };

  return tryPort(start);
}

export interface FabricNode {
  id: string;
  nombre: string;
  endpoint: string;
  hostAlias: string;
  activo: boolean;
  cryptoReady?: boolean;
  /** Estado REAL del contenedor según Docker, no según la base de datos. */
  enEjecucion?: boolean;
  prioridad: number;
  creadoEn: Date;
}

/** Fila de `nodos_fabric` tal como la devuelve Postgres (snake_case). */
interface FabricNodeRow {
  id: string;
  nombre: string;
  endpoint: string;
  host_alias: string;
  activo: boolean;
  prioridad: number;
  creado_en: Date;
}

/** Campos de `docker inspect` que necesita este servicio. */
interface DockerContainerInfo {
  Config?: {
    Env?: string[];
    Labels?: Record<string, string>;
  };
  State?: {
    Running?: boolean;
  };
}

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(private readonly db: DatabaseService) {}

  async getNextFreePort(): Promise<{
    port: number;
    endpoint: string;
    hostAlias: string;
    nombre: string;
  }> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT endpoint FROM nodos_fabric ORDER BY creado_en ASC`,
    );
    const usedPorts = rows
      .map((row) => {
        const match = /:(\d+)$/.exec(row.endpoint);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((port) => port > 0);

    const dockerPorts = await getDockerAllocatedPorts();
    const excluded = [
      ...new Set([
        ...usedPorts,
        ...dockerPorts,
        7050,
        7051,
        7052,
        7054,
        8051,
        8052,
        17050,
      ]),
    ];
    const port = await findFreePort(9051, excluded);
    const n = rows.length + 2;
    return {
      port,
      endpoint: `localhost:${port}`,
      hostAlias: `peer${n}.ficct.edu.bo`,
      nombre: `peer${n}`,
    };
  }

  /**
   * Lista los nodos sincronizando el registro con la realidad de Docker.
   *
   * 1. Descubre los contenedores `fabric-peer` que están corriendo y registra
   *    los que no figuren en `nodos_fabric` (sin tocar los ya registrados, de
   *    modo que el encendido/apagado del administrador se respeta).
   * 2. Devuelve cada nodo con `enEjecucion`: el estado REAL del contenedor.
   *    La tabla dejaba de reflejar la realidad cuando la red se levantaba por
   *    fuera de la interfaz (setup.sh, docker compose) o cuando se borraban
   *    los registros: los contenedores seguían ahí pero la página decía que
   *    no había nodos.
   *
   * `discovered` permite al controlador reconectar Fabric solo cuando
   * apareció algo nuevo, en lugar de reconectar en cada refresco.
   */
  async findAll(): Promise<{ nodes: FabricNode[]; discovered: number }> {
    const running = await this.discoverRunningPeers();

    const { rows: existing } = await this.db.query<FabricNodeRow>(
      `SELECT host_alias FROM nodos_fabric`,
    );
    const known = new Set(existing.map((r) => r.host_alias));

    let discovered = 0;
    for (const containerName of running) {
      if (!known.has(containerName)) {
        discovered += await this.registerDiscoveredPeer(containerName);
      }
    }

    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT id, nombre, endpoint, host_alias, activo, prioridad, creado_en
       FROM nodos_fabric
       ORDER BY prioridad ASC, creado_en ASC`,
    );
    const nodes = await Promise.all(
      rows.map(async (row) => ({
        ...this.map(row),
        cryptoReady: await this.hasPeerCrypto(row.host_alias),
        enEjecucion: running.has(row.host_alias),
      })),
    );
    return { nodes, discovered };
  }

  /** Nombres de los contenedores de peers de Fabric que están corriendo. */
  private async discoverRunningPeers(): Promise<Set<string>> {
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.Names}}\t{{.Image}}"',
        { timeout: 10_000 },
      );
      const names = stdout
        .split('\n')
        .map((line) => line.split('\t'))
        .filter(([, image]) => image?.includes('fabric-peer'))
        .map(([name]) => name.trim());
      return new Set(names);
    } catch (err: unknown) {
      // Sin Docker no hay descubrimiento, pero la lista registrada sigue
      // funcionando: se degrada, no se rompe.
      this.logger.warn(
        `No se pudo consultar Docker: ${getExecErrorSummary(err)}`,
      );
      return new Set();
    }
  }

  /**
   * Registra un peer descubierto en Docker que no figura en la base. El
   * endpoint sale de la variable CORE_PEER_ADDRESS del propio contenedor.
   * Devuelve cuántas filas insertó (0 si ya existía por nombre o si el
   * contenedor no expone su dirección).
   */
  private async registerDiscoveredPeer(containerName: string): Promise<number> {
    const info = await this.inspectContainer(containerName);
    const address = info?.Config?.Env?.find((e) =>
      e.startsWith('CORE_PEER_ADDRESS='),
    );
    const port = address?.split('=')[1]?.split(':')[1];
    if (!port) {
      this.logger.warn(
        `${containerName} corre pero no expone CORE_PEER_ADDRESS; no se registra`,
      );
      return 0;
    }
    const nombre = containerName.split('.')[0];
    try {
      const { rows } = await this.db.query<{ id: string }>(
        `INSERT INTO nodos_fabric (nombre, endpoint, host_alias, activo)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (nombre) DO NOTHING
         RETURNING id`,
        [nombre, `localhost:${port}`, containerName],
      );
      if (rows.length) {
        this.logger.log(
          `Peer descubierto en Docker y registrado: ${containerName} (localhost:${port})`,
        );
      }
      return rows.length;
    } catch (err: unknown) {
      // Un fallo al registrar (p. ej. una base cuyo esquema derivó del de
      // database.sql) no debe tumbar el listado completo de nodos: se avisa
      // con una pista accionable y la página sigue mostrando lo registrado.
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      const hint =
        code === '42P10'
          ? ' — a la tabla nodos_fabric le falta la restricción UNIQUE (nombre) que declara database.sql; ejecutar: ALTER TABLE nodos_fabric ADD CONSTRAINT nodos_fabric_nombre_key UNIQUE (nombre);'
          : '';
      this.logger.warn(
        `No se pudo registrar ${containerName}: ${getErrorMessage(err)}${hint}`,
      );
      return 0;
    }
  }

  async findFirstActive(): Promise<{
    endpoint: string;
    hostAlias: string;
  } | null> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT endpoint, host_alias
       FROM nodos_fabric
       WHERE activo = true
       ORDER BY prioridad ASC, creado_en ASC
       LIMIT 1`,
    );
    return rows.length > 0
      ? { endpoint: rows[0].endpoint, hostAlias: rows[0].host_alias }
      : null;
  }

  async create(dto: CreateNodeDto): Promise<FabricNode> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `INSERT INTO nodos_fabric (nombre, endpoint, host_alias, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (nombre) DO UPDATE
         SET endpoint   = EXCLUDED.endpoint,
             host_alias = EXCLUDED.host_alias,
             activo     = EXCLUDED.activo
       RETURNING *`,
      [dto.nombre, dto.endpoint, dto.hostAlias, dto.activo ?? true],
    );
    return this.map(rows[0]);
  }

  async toggle(id: string): Promise<{ node: FabricNode; logs: string }> {
    const { rows: cur } = await this.db.query<FabricNodeRow>(
      `SELECT * FROM nodos_fabric WHERE id = $1`,
      [id],
    );
    if (!cur.length) throw new NotFoundException('Nodo no encontrado');

    const current = this.map(cur[0]);
    const action = current.activo ? 'stop' : 'start';
    const peerCtr = current.hostAlias;
    const couchCtr = await this.resolveCouchContainer(peerCtr, current.nombre);
    const lines: string[] = [
      `[INFO] Ejecutando: docker ${action} en ${current.nombre}`,
    ];

    // Al encender, el CouchDB va primero (el peer lo necesita para arrancar);
    // al apagar, el peer va primero para que no pierda su base bajo los pies.
    const order =
      action === 'start' ? [couchCtr, peerCtr] : [peerCtr, couchCtr];

    let peerOk = false;
    for (const ctr of order) {
      try {
        const { stdout } = await execAsync(`docker ${action} ${ctr}`, {
          timeout: 30_000,
        });
        lines.push(`[OK]   ${ctr}: ${stdout.trim() || 'done'}`);
        if (ctr === peerCtr) peerOk = true;
      } catch (err: unknown) {
        lines.push(`[WARN] ${ctr}: ${getExecErrorSummary(err)}`);
      }
    }

    // El estado en la base solo cambia si el peer obedeció de verdad. Antes se
    // volteaba siempre, y la tabla mostraba ACTIVO con el contenedor caído.
    if (!peerOk) {
      lines.push(
        `[ERROR] El peer no respondió a docker ${action}; el estado en la base se mantiene en ${current.activo ? 'ACTIVO' : 'INACTIVO'}.`,
      );
      const info = await this.inspectContainer(peerCtr);
      current.enEjecucion = info?.State?.Running ?? false;
      return { node: current, logs: lines.join('\n') };
    }

    const { rows } = await this.db.query<FabricNodeRow>(
      `UPDATE nodos_fabric SET activo = NOT activo WHERE id = $1 RETURNING *`,
      [id],
    );

    lines.push(
      `[INFO] Estado en DB → ${rows[0].activo ? 'ACTIVO' : 'INACTIVO'}`,
    );
    const node = this.map(rows[0]);
    node.enEjecucion = action === 'start';
    return { node, logs: lines.join('\n') };
  }

  async remove(id: string): Promise<void> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT * FROM nodos_fabric WHERE id = $1`,
      [id],
    );
    // Borrar un id inexistente sigue siendo un no-op, como hasta ahora.
    if (rows.length) {
      await this.cleanupContainers(this.map(rows[0]));
    }
    await this.db.query(`DELETE FROM nodos_fabric WHERE id = $1`, [id]);
  }

  /**
   * Elimina los contenedores de un peer desplegado dinámicamente al borrarlo
   * del registro. Antes, borrar la fila los dejaba corriendo huérfanos.
   *
   * Los peers base del docker-compose NO se tocan: llevan la etiqueta
   * `com.docker.compose.project` y son responsabilidad del compose, no de este
   * servicio. Borrarlos del registro solo los des-registra.
   */
  private async cleanupContainers(node: FabricNode): Promise<void> {
    const info = await this.inspectContainer(node.hostAlias);
    if (!info) return; // el contenedor ya no existe: nada que limpiar

    if (info.Config?.Labels?.['com.docker.compose.project']) {
      this.logger.log(
        `${node.hostAlias} pertenece al docker-compose; se des-registra sin eliminar sus contenedores`,
      );
      return;
    }

    // Resolver el CouchDB ANTES de eliminar el peer: el nombre sale del
    // entorno del propio contenedor del peer.
    const couchCtr = await this.resolveCouchContainer(
      node.hostAlias,
      node.nombre,
    );
    for (const ctr of [node.hostAlias, couchCtr]) {
      try {
        // -f detiene y elimina; -v descarta sus volúmenes anónimos.
        await execAsync(`docker rm -fv ${ctr}`, { timeout: 30_000 });
        this.logger.log(`Contenedor ${ctr} eliminado junto con el nodo`);
      } catch (err: unknown) {
        this.logger.warn(
          `No se pudo eliminar ${ctr}: ${getExecErrorSummary(err)}`,
        );
      }
    }
  }

  /**
   * Devuelve el nombre real del contenedor CouchDB de un peer, leyéndolo de la
   * variable CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS del propio
   * contenedor: en la red de Docker, el host de esa dirección ES el nombre del
   * contenedor. Así funciona igual para los peers base del compose (couchdb0,
   * couchdb1) y para los desplegados dinámicamente (couchdb-<nombre>), que era
   * el desajuste que hacía fallar el encendido de peer0 y peer1.
   */
  private async resolveCouchContainer(
    peerCtr: string,
    nombre: string,
  ): Promise<string> {
    const info = await this.inspectContainer(peerCtr);
    const address = info?.Config?.Env?.find((e) =>
      e.startsWith('CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS='),
    );
    const host = address?.split('=')[1]?.split(':')[0];
    // Sin contenedor que consultar, se cae a la convención de los dinámicos.
    return host || `couchdb-${nombre}`;
  }

  /** `docker inspect` tipado; `null` si el contenedor no existe. */
  private async inspectContainer(
    name: string,
  ): Promise<DockerContainerInfo | null> {
    try {
      const { stdout } = await execAsync(`docker inspect ${name}`, {
        timeout: 10_000,
      });
      const parsed = JSON.parse(stdout) as DockerContainerInfo[];
      return parsed[0] ?? null;
    } catch {
      return null;
    }
  }

  async deployPeer(
    dto: DeployNodeDto,
  ): Promise<{ node: FabricNode; logs: string }> {
    const peerName = dto.nombre;
    const dockerPorts = await getDockerAllocatedPorts();
    const peerPort = await findFreePort(9051, dockerPorts);
    const couchPort = await findFreePort(7984, [...dockerPorts, peerPort]);
    const opsPort = await findFreePort(10000, [
      ...dockerPorts,
      peerPort,
      couchPort,
    ]);
    const ccPort = peerPort + 1;

    const ORG = 'ficct.edu.bo';
    const MSP = 'FICCTOrgMSP';
    const CHAN = 'evoting';
    const CC = 'evoting-cc';
    const CCv = '1.0';

    const peerDir = path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      ORG,
      'peers',
      `${peerName}.${ORG}`,
    );
    const mspDir = path.join(peerDir, 'msp');
    const tlsDir = path.join(peerDir, 'tls');

    // Paths inside CLI container (crypto-material mounted as /crypto)
    const cOrg = `/crypto/peerOrganizations/${ORG}`;
    const cPeer = `${cOrg}/peers/${peerName}.${ORG}`;
    const adminMsp = `${cOrg}/users/Admin@${ORG}/msp`;

    const logs: string[] = [];
    const log = (m: string) => logs.push(m);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const run = async (
      cmd: string,
      label: string,
      optional = false,
    ): Promise<string> => {
      log(`[RUN] ${label}`);
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120_000 });
        if (stdout.trim()) log(stdout.trim());
        if (stderr.trim()) log(`[stderr] ${stderr.trim()}`);
        return stdout;
      } catch (err: unknown) {
        const detail = getExecErrorDetail(err);
        log(`[${optional ? 'WARN' : 'ERROR'}] ${label}: ${detail}`);
        if (!optional)
          throw new InternalServerErrorException(`${label} falló: ${detail}`);
        return '';
      }
    };

    log(`[INFO] Desplegando ${peerName}.${ORG} → puerto ${peerPort}`);

    // ── 0. Verificar que no existe ───────────────────────────────────────────
    try {
      await fsp.access(mspDir);
      throw new InternalServerErrorException(
        `Ya existe crypto para ${peerName}. Usa otro nombre.`,
      );
    } catch (err: unknown) {
      if (err instanceof InternalServerErrorException) throw err;
    }

    // ── 1. Crear estructura de directorios ───────────────────────────────────
    log('[INFO] Creando estructura de directorios...');
    for (const sub of [
      'msp/cacerts',
      'msp/signcerts',
      'msp/keystore',
      'msp/tlscacerts',
      'msp/admincerts',
      'tls',
    ]) {
      await fsp.mkdir(path.join(peerDir, sub), { recursive: true });
    }

    // ── 2. config.yaml ───────────────────────────────────────────────────────
    await fsp.writeFile(
      path.join(mspDir, 'config.yaml'),
      [
        'NodeOUs:',
        '  Enable: true',
        '  ClientOUIdentifier:',
        `    Certificate: cacerts/ca.${ORG}-cert.pem`,
        '    OrganizationalUnitIdentifier: client',
        '  PeerOUIdentifier:',
        `    Certificate: cacerts/ca.${ORG}-cert.pem`,
        '    OrganizationalUnitIdentifier: peer',
        '  AdminOUIdentifier:',
        `    Certificate: cacerts/ca.${ORG}-cert.pem`,
        '    OrganizationalUnitIdentifier: admin',
        '  OrdererOUIdentifier:',
        `    Certificate: cacerts/ca.${ORG}-cert.pem`,
        '    OrganizationalUnitIdentifier: orderer',
      ].join('\n'),
    );

    // ── 3. Script de certificados (escrito en tmpdir sin espacios) ───────────
    // El script se ejecuta DENTRO del CLI container donde openssl está disponible
    // y /crypto apunta al crypto-material del host.
    const scriptContent = `#!/bin/bash
set -e
PEER_DIR="${cPeer}"
CA_CERT="${cOrg}/ca/ca.${ORG}-cert.pem"
CA_KEY="${cOrg}/ca/priv_sk"
TLS_CA="${cOrg}/tlsca/tlsca.${ORG}-cert.pem"
TLS_KEY="${cOrg}/tlsca/priv_sk"
echo "[CERT] Generando clave MSP..."
openssl ecparam -name prime256v1 -genkey -noout -out "$PEER_DIR/msp/keystore/priv_sk"
echo "[CERT] Generando CSR MSP..."
openssl req -new -key "$PEER_DIR/msp/keystore/priv_sk" -out /tmp/${peerName}-msp.csr \\
  -subj "/C=US/ST=California/L=San Francisco/O=${ORG}/OU=peer/CN=${peerName}.${ORG}"
cat > /tmp/${peerName}-msp.ext <<'EXTEOF'
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always,issuer
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
EXTEOF
echo "[CERT] Firmando certificado MSP..."
openssl x509 -req -in /tmp/${peerName}-msp.csr -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \\
  -out "$PEER_DIR/msp/signcerts/${peerName}.${ORG}-cert.pem" -days 3650 -sha256 -extfile /tmp/${peerName}-msp.ext
cp "$CA_CERT" "$PEER_DIR/msp/cacerts/ca.${ORG}-cert.pem"
cp "$TLS_CA"  "$PEER_DIR/msp/tlscacerts/tlsca.${ORG}-cert.pem"
echo "[CERT] Generando clave TLS..."
openssl ecparam -name prime256v1 -genkey -noout -out "$PEER_DIR/tls/server.key"
echo "[CERT] Generando CSR TLS..."
openssl req -new -key "$PEER_DIR/tls/server.key" -out /tmp/${peerName}-tls.csr \\
  -subj "/C=US/ST=California/L=San Francisco/O=${ORG}/CN=${peerName}.${ORG}"
cat > /tmp/${peerName}-tls.ext <<'EXTEOF'
subjectAltName=DNS:${peerName}.${ORG},DNS:localhost,IP:127.0.0.1
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always,issuer
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth,clientAuth
EXTEOF
echo "[CERT] Firmando certificado TLS..."
openssl x509 -req -in /tmp/${peerName}-tls.csr -CA "$TLS_CA" -CAkey "$TLS_KEY" -CAcreateserial \\
  -out "$PEER_DIR/tls/server.crt" -days 3650 -sha256 -extfile /tmp/${peerName}-tls.ext
cp "$TLS_CA" "$PEER_DIR/tls/ca.crt"
echo "[CERT] Certificados generados"
`;

    // os.tmpdir() no tiene espacios en Windows (C:\Users\...\AppData\Local\Temp)
    const tmpScript = path.join(os.tmpdir(), `deploy-${peerName}.sh`);
    const tmpScriptFwd = tmpScript.replace(/\\/g, '/');
    await fsp.writeFile(tmpScript, scriptContent);

    // ── 4. Copiar script al CLI y ejecutar ───────────────────────────────────
    await run(
      `docker cp "${tmpScriptFwd}" cli:/tmp/deploy-${peerName}.sh`,
      'Copiando script al CLI',
    );
    await run(
      `docker exec cli bash /tmp/deploy-${peerName}.sh`,
      'Generando certificados (openssl en CLI)',
    );
    await fsp.unlink(tmpScript).catch(() => {});

    log('[INFO] Certificados generados');

    // ── 5. Iniciar CouchDB ───────────────────────────────────────────────────
    await run(
      `docker run -d --name couchdb-${peerName} --network evoting_network -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=adminpw -p ${couchPort}:5984 couchdb:3.3.3`,
      `Iniciando CouchDB (puerto ${couchPort})`,
    );
    await sleep(5000);

    // ── 6. Iniciar Peer ──────────────────────────────────────────────────────
    const toFwd = (p: string) => p.replace(/\\/g, '/');
    await run(
      [
        'docker run -d',
        `--name "${peerName}.${ORG}"`,
        `--hostname "${peerName}.${ORG}"`,
        '--network evoting_network',
        `-p ${peerPort}:${peerPort}`,
        `-p ${opsPort}:${opsPort}`,
        '-e CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock',
        '-e CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=evoting_network',
        '-e FABRIC_CFG_PATH=/etc/hyperledger/fabric',
        '-e FABRIC_LOGGING_SPEC=INFO',
        '-e CORE_PEER_TLS_ENABLED=true',
        '-e CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt',
        '-e CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key',
        '-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt',
        `-e "CORE_PEER_ID=${peerName}.${ORG}"`,
        `-e "CORE_PEER_ADDRESS=${peerName}.${ORG}:${peerPort}"`,
        `-e "CORE_PEER_LISTENADDRESS=0.0.0.0:${peerPort}"`,
        `-e "CORE_PEER_CHAINCODEADDRESS=${peerName}.${ORG}:${ccPort}"`,
        `-e "CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:${ccPort}"`,
        `-e "CORE_PEER_GOSSIP_BOOTSTRAP=peer0.${ORG}:7051"`,
        `-e "CORE_PEER_GOSSIP_EXTERNALENDPOINT=${peerName}.${ORG}:${peerPort}"`,
        `-e "CORE_PEER_LOCALMSPID=${MSP}"`,
        '-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp',
        '-e CORE_LEDGER_STATE_STATEDATABASE=CouchDB',
        `-e "CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb-${peerName}:5984"`,
        '-e CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin',
        '-e CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw',
        `-e "CORE_OPERATIONS_LISTENADDRESS=0.0.0.0:${opsPort}"`,
        '-v /var/run/docker.sock:/host/var/run/docker.sock',
        `-v "${toFwd(mspDir)}:/etc/hyperledger/fabric/msp"`,
        `-v "${toFwd(tlsDir)}:/etc/hyperledger/fabric/tls"`,
        'hyperledger/fabric-peer:2.5',
      ].join(' '),
      `Iniciando peer ${peerName} (puerto ${peerPort})`,
    );

    log(`[INFO] Esperando que ${peerName} inicie (15s)...`);
    await sleep(15000);

    // ── 7. Verificar estado ──────────────────────────────────────────────────
    const psOut = await run(
      `docker ps --filter "name=${peerName}.${ORG}" --format "{{.Status}}"`,
      'Verificando estado del peer',
      true,
    );
    if (!psOut.includes('Up')) {
      log(
        `[WARN] ${peerName} puede no estar corriendo. Verifica: docker logs ${peerName}.${ORG}`,
      );
    }

    // ── 8. Unir al canal ─────────────────────────────────────────────────────
    await run(
      `docker exec -e "CORE_PEER_ADDRESS=${peerName}.${ORG}:${peerPort}" -e "CORE_PEER_TLS_ROOTCERT_FILE=${cPeer}/tls/ca.crt" -e "CORE_PEER_MSPCONFIGPATH=${adminMsp}" cli peer channel join -b /channel-artifacts/${CHAN}.block`,
      `Uniendo ${peerName} al canal ${CHAN}`,
    );

    // ── 9. Instalar chaincode ────────────────────────────────────────────────
    await run(
      `docker exec cli peer lifecycle chaincode package /tmp/${CC}_${peerName}.tar.gz --path /chaincode --lang node --label ${CC}_${CCv}`,
      'Empaquetando chaincode',
      true,
    );
    await run(
      `docker exec -e "CORE_PEER_ADDRESS=${peerName}.${ORG}:${peerPort}" -e "CORE_PEER_TLS_ROOTCERT_FILE=${cPeer}/tls/ca.crt" -e "CORE_PEER_MSPCONFIGPATH=${adminMsp}" cli peer lifecycle chaincode install /tmp/${CC}_${peerName}.tar.gz`,
      `Instalando chaincode en ${peerName}`,
      true,
    );

    log(`PEER_ENDPOINT=localhost:${peerPort}`);
    log(`PEER_HOST_ALIAS=${peerName}.${ORG}`);
    log(`[INFO] ¡${peerName} desplegado exitosamente!`);

    const node = await this.create({
      nombre: peerName,
      endpoint: `localhost:${peerPort}`,
      hostAlias: `${peerName}.${ORG}`,
      activo: true,
    });

    return { node, logs: logs.join('\n') };
  }

  private map(r: FabricNodeRow): FabricNode {
    return {
      id: r.id,
      nombre: r.nombre,
      endpoint: r.endpoint,
      hostAlias: r.host_alias,
      activo: r.activo,
      prioridad: r.prioridad,
      creadoEn: r.creado_en,
    };
  }

  private async hasPeerCrypto(hostAlias: string): Promise<boolean> {
    const tlsCa = path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      'ficct.edu.bo',
      'peers',
      hostAlias,
      'tls',
      'ca.crt',
    );

    try {
      await fsp.access(tlsCa);
      return true;
    } catch {
      return false;
    }
  }
}
