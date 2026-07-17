import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { exec } from 'child_process';
import { promises as fsp } from 'node:fs';
import * as path from 'path';
import { promisify } from 'util';
import { getExecErrorDetail, getExecErrorSummary } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CONFIGTX_PATH, CRYPTO_BASE } from '../common/fabric-paths';

const execAsync = promisify(exec);

const ORDERER_CA =
  '/crypto/ordererOrganizations/ficct.edu.bo/orderers/orderer.ficct.edu.bo/msp/tlscacerts/tlsca.ficct.edu.bo-cert.pem';
const ADMIN_MSP =
  '/crypto/peerOrganizations/ficct.edu.bo/users/Admin@ficct.edu.bo/msp';
const CC_NAME = 'evoting-cc';
const CC_VERSION = '1.0';
const CC_SEQ = '1';

export interface FabricChannel {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creadoEn: Date;
  /** Peers unidos al canal según el propio Fabric (solo los activos responden). */
  peers?: { id: string; nombre: string }[];
}

interface FabricNodeRow {
  id: string;
  nombre: string;
  endpoint: string;
  host_alias: string;
  activo: boolean;
}

/** Fila de `canales_fabric` tal como la devuelve Postgres (snake_case). */
interface FabricChannelRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creado_en: Date;
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<FabricChannel[]> {
    const { rows } = await this.db.query<FabricChannelRow>(
      `SELECT id, nombre, descripcion, activo, creado_en
       FROM canales_fabric
       ORDER BY creado_en ASC`,
    );
    const channels = rows.map((row) => this.map(row));

    // La membresía se le pregunta a Fabric, no a la base: cada peer activo
    // reporta sus propios canales con `peer channel list`. Guardarlo en
    // Postgres duplicaría la verdad y derivaría, como todo lo duplicado.
    const { rows: nodes } = await this.db.query<FabricNodeRow>(
      `SELECT * FROM nodos_fabric WHERE activo = true ORDER BY prioridad ASC`,
    );
    const porCanal = new Map<string, { id: string; nombre: string }[]>();
    await Promise.all(
      nodes.map(async (node) => {
        try {
          for (const canal of await this.listPeerChannels(node)) {
            const lista = porCanal.get(canal) ?? [];
            lista.push({ id: node.id, nombre: node.nombre });
            porCanal.set(canal, lista);
          }
        } catch (err: unknown) {
          // Un peer que no responde no debe tumbar el listado de canales.
          this.logger.warn(
            `No se pudo consultar los canales de ${node.nombre}: ${getExecErrorSummary(err)}`,
          );
        }
      }),
    );
    return channels.map((ch) => ({
      ...ch,
      peers: (porCanal.get(ch.nombre) ?? []).sort((a, b) =>
        a.nombre.localeCompare(b.nombre),
      ),
    }));
  }

  /** Canales a los que un peer ya está unido, según el propio peer. */
  private async listPeerChannels(node: FabricNodeRow): Promise<string[]> {
    const { stdout } = await execAsync(
      `docker exec -e "CORE_PEER_ADDRESS=${this.peerAddress(node)}" -e "CORE_PEER_TLS_ROOTCERT_FILE=${this.peerTlsPath(node)}" -e "CORE_PEER_MSPCONFIGPATH=${ADMIN_MSP}" cli peer channel list`,
      { timeout: 15_000 },
    );
    return this.parseChannelList(stdout);
  }

  /** La salida de `peer channel list`: un encabezado y un canal por línea. */
  private parseChannelList(salida: string): string[] {
    return salida
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !linea.includes('has joined'));
  }

  async createChannel(
    dto: CreateChannelDto,
  ): Promise<{ channel: FabricChannel; logs: string }> {
    const channelName = dto.nombre;

    if (!/^[a-z][a-z0-9-]{2,48}$/.test(channelName)) {
      throw new InternalServerErrorException(
        'Nombre de canal inválido. Usa minúsculas, letras/números/guiones, 3-49 chars, debe empezar con letra.',
      );
    }

    const configtxSrc = CONFIGTX_PATH;
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    const run = this.createRunner(log);

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // 1. Copy configtx.yaml into CLI container
    await run(
      `docker cp "${configtxSrc}" cli:/tmp/configtx.yaml`,
      'Copiando configtx.yaml al CLI',
    );

    // 2. Generate channel transaction inside CLI
    await run(
      `docker exec cli configtxgen -profile EvotingChannel -outputCreateChannelTx /channel-artifacts/${channelName}.tx -channelID ${channelName} -configPath /tmp`,
      'Generando channel transaction',
    );

    // 3. Create channel on orderer
    await run(
      `docker exec cli peer channel create -o orderer.ficct.edu.bo:7050 -c ${channelName} -f /channel-artifacts/${channelName}.tx --tls --cafile ${ORDERER_CA} --outputBlock /channel-artifacts/${channelName}.block`,
      'Creando canal en el orderer',
    );
    await this.ensureChannelBlock(channelName, log);
    await sleep(3000);

    const activeNodes = await this.getActiveNodes();
    if (activeNodes.length === 0) {
      throw new BadRequestException('No hay peers activos para unir al canal');
    }

    const joinedNodes: FabricNodeRow[] = [];
    for (const node of activeNodes) {
      try {
        await this.joinPeerToChannel(channelName, node, log);
        joinedNodes.push(node);
      } catch (err) {
        log(`[WARN] ${node.nombre} omitido: ${this.errorMessage(err)}`);
      }
    }

    if (joinedNodes.length === 0) {
      throw new BadRequestException(
        'No se pudo unir ningún peer al canal. Verifica que los peers activos tengan certificados TLS y estén levantados.',
      );
    }

    log(
      '[INFO] Esperando que los peers inicialicen el ledger del canal (10s)...',
    );
    await sleep(10000);

    await this.deployChaincodeToChannel(channelName, log, joinedNodes);

    // 9. Persist to DB
    const { rows } = await this.db.query<FabricChannelRow>(
      `INSERT INTO canales_fabric (nombre, descripcion)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET activo = true
       RETURNING *`,
      [channelName, dto.descripcion ?? null],
    );

    log('CHANNEL_SUCCESS=true');

    return {
      channel: this.map(rows[0]),
      logs: logs.join('\n'),
    };
  }

  async joinPeer(
    channelName: string,
    nodeId: string,
  ): Promise<{ logs: string }> {
    await this.assertChannelExists(channelName);
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);
    const node = await this.getNodeById(nodeId);
    if (!node.activo)
      throw new BadRequestException(
        'El peer debe estar activo para unirlo al canal',
      );

    await this.ensureChannelBlock(channelName, log);
    await this.joinPeerToChannel(channelName, node, log);
    return { logs: logs.join('\n') };
  }

  async deployChaincode(channelName: string): Promise<{ logs: string }> {
    await this.assertChannelExists(channelName);
    const logs: string[] = [];
    await this.deployChaincodeToChannel(channelName, (msg) => logs.push(msg));
    return { logs: logs.join('\n') };
  }

  private createRunner(log: (msg: string) => void) {
    return async (
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
        const alreadyDone =
          /already exists|already successfully joined|chaincode definition.*exists|committed with|already defined|existing channel|currently at version/i.test(
            detail,
          );
        log(
          `[${optional || alreadyDone ? 'WARN' : 'ERROR'}] ${label}: ${detail}`,
        );
        if (!optional && !alreadyDone)
          throw new InternalServerErrorException(`${label} falló: ${detail}`);
        return '';
      }
    };
  }

  private async assertChannelExists(channelName: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id FROM canales_fabric WHERE nombre = $1`,
      [channelName],
    );
    if (rows.length === 0)
      throw new NotFoundException(`Canal ${channelName} no registrado`);
  }

  private async getActiveNodes(): Promise<FabricNodeRow[]> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT id, nombre, endpoint, host_alias, activo
       FROM nodos_fabric
       WHERE activo = true
       ORDER BY prioridad ASC, creado_en ASC`,
    );
    return rows;
  }

  private async getNodeById(nodeId: string): Promise<FabricNodeRow> {
    const { rows } = await this.db.query<FabricNodeRow>(
      `SELECT id, nombre, endpoint, host_alias, activo FROM nodos_fabric WHERE id = $1`,
      [nodeId],
    );
    if (!rows[0]) throw new NotFoundException('Nodo no encontrado');
    return rows[0];
  }

  private peerAddress(node: FabricNodeRow): string {
    const port = node.endpoint.match(/:(\d+)$/)?.[1];
    return `${node.host_alias}:${port ?? '7051'}`;
  }

  private peerTlsPath(node: FabricNodeRow): string {
    return `/crypto/peerOrganizations/ficct.edu.bo/peers/${node.host_alias}/tls/ca.crt`;
  }

  private async ensureChannelBlock(
    channelName: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const run = this.createRunner(log);
    await run(
      `docker exec cli peer channel fetch 0 /channel-artifacts/${channelName}.block -o orderer.ficct.edu.bo:7050 -c ${channelName} --tls --cafile ${ORDERER_CA}`,
      `Obteniendo bloque génesis del canal ${channelName}`,
      true,
    );
  }

  private async joinPeerToChannel(
    channelName: string,
    node: FabricNodeRow,
    log: (msg: string) => void,
  ): Promise<void> {
    const run = this.createRunner(log);
    await this.assertPeerCryptoReady(node);
    // La verificación de alcance ya pregunta `peer channel list`: se usa esa
    // misma respuesta para no reintentar una unión que Fabric rechazaría con
    // «ledger already exists».
    const yaUnidos = await this.assertPeerReachable(node, log);
    if (yaUnidos.includes(channelName)) {
      log(
        `[OK]   ${node.nombre} ya estaba unido al canal ${channelName}; nada que hacer`,
      );
      return;
    }
    await run(
      `docker exec -e "CORE_PEER_ADDRESS=${this.peerAddress(node)}" -e "CORE_PEER_TLS_ROOTCERT_FILE=${this.peerTlsPath(node)}" -e "CORE_PEER_MSPCONFIGPATH=${ADMIN_MSP}" cli peer channel join -b /channel-artifacts/${channelName}.block`,
      `Uniendo ${node.nombre} al canal ${channelName}`,
    );
  }

  private async deployChaincodeToChannel(
    channelName: string,
    log: (msg: string) => void,
    candidateNodes?: FabricNodeRow[],
  ): Promise<void> {
    const run = this.createRunner(log);
    const allNodes =
      candidateNodes ?? (await this.getCryptoReadyActiveNodes(log));
    if (allNodes.length === 0) {
      throw new BadRequestException(
        'No hay peers activos con certificados TLS para desplegar chaincode',
      );
    }

    const peerEnv = (node: FabricNodeRow) =>
      [
        `-e "CORE_PEER_ADDRESS=${this.peerAddress(node)}"`,
        `-e "CORE_PEER_TLS_ROOTCERT_FILE=${this.peerTlsPath(node)}"`,
        `-e "CORE_PEER_MSPCONFIGPATH=${ADMIN_MSP}"`,
      ].join(' ');

    // Filtrar peers que no estén en el canal (puede ser timing o join fallido)
    const activeNodes: FabricNodeRow[] = [];
    for (const node of allNodes) {
      const channelList = await run(
        `docker exec ${peerEnv(node)} cli peer channel list`,
        `Verificando membresía de ${node.nombre} en ${channelName}`,
        true,
      );
      if (channelList.includes(channelName)) {
        activeNodes.push(node);
      } else if (channelList === '') {
        log(
          `[WARN] ${node.nombre} (${this.peerAddress(node)}) no alcanzable — omitido`,
        );
      } else {
        log(
          `[WARN] ${node.nombre} no está en canal ${channelName} (canales: ${channelList.replace(/\n/g, ', ').trim()}) — omitido`,
        );
      }
    }
    if (activeNodes.length === 0) {
      throw new BadRequestException(
        `Ningún peer está en el canal ${channelName}. El join pudo haber fallado o el peer aún no inicializó el ledger. Reintenta en unos segundos.`,
      );
    }

    const first = activeNodes[0];

    const committed = await run(
      `docker exec ${peerEnv(first)} cli peer lifecycle chaincode querycommitted -C ${channelName} --name ${CC_NAME}`,
      `Verificando chaincode en ${channelName}`,
      true,
    );
    if (committed.includes(CC_NAME)) {
      log(`[OK] ${CC_NAME} ya está confirmado en ${channelName}`);
      return;
    }

    await run(
      `docker exec cli peer lifecycle chaincode package /tmp/${CC_NAME}-${channelName}.tar.gz --path /chaincode --lang node --label ${CC_NAME}_${CC_VERSION}`,
      'Empaquetando chaincode',
      true,
    );

    for (const node of activeNodes) {
      await run(
        `docker exec ${peerEnv(node)} cli peer lifecycle chaincode install /tmp/${CC_NAME}-${channelName}.tar.gz`,
        `Instalando chaincode en ${node.nombre}`,
        true,
      );
    }

    const queryOut = await run(
      `docker exec ${peerEnv(first)} cli peer lifecycle chaincode queryinstalled`,
      'Buscando Package ID',
    );
    const line = queryOut
      .split('\n')
      .find((l) => l.includes(`${CC_NAME}_${CC_VERSION}`));
    const packageId = line?.match(/Package ID: ([^,\s]+)/)?.[1]?.trim();
    if (!packageId) {
      throw new InternalServerErrorException(
        `No se encontró Package ID de ${CC_NAME}_${CC_VERSION}`,
      );
    }

    await run(
      `docker exec ${peerEnv(first)} cli peer lifecycle chaincode approveformyorg -o orderer.ficct.edu.bo:7050 --tls --cafile ${ORDERER_CA} --channelID ${channelName} --name ${CC_NAME} --version ${CC_VERSION} --package-id ${packageId} --sequence ${CC_SEQ}`,
      'Aprobando chaincode en el canal',
    );

    await run(
      `docker exec ${peerEnv(first)} cli peer lifecycle chaincode commit -o orderer.ficct.edu.bo:7050 --tls --cafile ${ORDERER_CA} --channelID ${channelName} --name ${CC_NAME} --version ${CC_VERSION} --sequence ${CC_SEQ} --peerAddresses ${this.peerAddress(first)} --tlsRootCertFiles ${this.peerTlsPath(first)}`,
      'Confirmando chaincode en el canal',
    );
  }

  private map(r: FabricChannelRow): FabricChannel {
    return {
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion ?? null,
      activo: r.activo,
      creadoEn: r.creado_en,
    };
  }

  private async getCryptoReadyActiveNodes(
    log?: (msg: string) => void,
  ): Promise<FabricNodeRow[]> {
    const nodes = await this.getActiveNodes();
    const ready: FabricNodeRow[] = [];

    for (const node of nodes) {
      if (await this.hasPeerCrypto(node)) {
        ready.push(node);
      } else {
        log?.(
          `[WARN] ${node.nombre} omitido: no existe ${this.peerTlsPath(node)} en crypto-material`,
        );
      }
    }

    return ready;
  }

  private peerTlsHostPath(node: FabricNodeRow): string {
    return path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      'ficct.edu.bo',
      'peers',
      node.host_alias,
      'tls',
      'ca.crt',
    );
  }

  private async hasPeerCrypto(node: FabricNodeRow): Promise<boolean> {
    try {
      await fsp.access(this.peerTlsHostPath(node));
      return true;
    } catch {
      return false;
    }
  }

  private async assertPeerCryptoReady(node: FabricNodeRow): Promise<void> {
    if (await this.hasPeerCrypto(node)) return;
    throw new BadRequestException(
      `${node.nombre} no tiene certificados TLS generados (${this.peerTlsPath(node)}). Despliega el peer desde Nodos o corrige su hostAlias.`,
    );
  }

  private async assertPeerReachable(
    node: FabricNodeRow,
    log: (msg: string) => void,
  ): Promise<string[]> {
    const run = this.createRunner(log);
    try {
      const salida = await run(
        `docker exec -e "CORE_PEER_ADDRESS=${this.peerAddress(node)}" -e "CORE_PEER_TLS_ROOTCERT_FILE=${this.peerTlsPath(node)}" -e "CORE_PEER_MSPCONFIGPATH=${ADMIN_MSP}" cli peer channel list`,
        `Verificando TLS/conexión de ${node.nombre}`,
      );
      return this.parseChannelList(salida);
    } catch (err) {
      const msg = this.errorMessage(err);
      if (/unknown authority|certificate|tls/i.test(msg)) {
        throw new BadRequestException(
          `${node.nombre} no pasó la verificación TLS. Revisa que endpoint=${this.peerAddress(node)} sea el puerto del peer y que su certificado haya sido generado con la CA de la red.`,
        );
      }
      throw err;
    }
  }

  private errorMessage(err: unknown): string {
    if (
      err instanceof BadRequestException ||
      err instanceof InternalServerErrorException ||
      err instanceof NotFoundException
    ) {
      const response = err.getResponse();
      if (typeof response === 'string') return response;
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = response.message;
        return Array.isArray(message) ? message.join(', ') : String(message);
      }
    }

    return err instanceof Error ? err.message : String(err);
  }
}
