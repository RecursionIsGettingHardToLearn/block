import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import {
  connect,
  Contract,
  Gateway,
  hash,
  signers,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CRYPTO_BASE } from '../common/fabric-paths';

export type SyncStatus = 'PENDIENTE' | 'CONFIRMADO' | 'FALLIDO';

export interface VoteAsset {
  assetType: 'vote';
  id: string;
  electionId: string;
  candidateId: string;
  timestamp: string;
  txId: string;
}

export interface TallyAsset {
  assetType: 'tally';
  electionId: string;
  results: Record<string, number>;
  lastUpdated: string;
}

export interface VoteReceipt {
  electionId: string;
  txId: string;
  status: SyncStatus;
  channel: string | null;
  createdAt: Date;
  errorMessage: string | null;
}

export interface VoteVerification {
  txId: string;
  electionId: string | null;
  status: SyncStatus | 'NO_ENCONTRADO';
  counted: boolean;
  channel: string | null;
  source: 'FABRIC' | 'LOCAL' | 'DESCONOCIDO';
  message: string;
}

const PEER_ENDPOINT = process.env.FABRIC_PEER_ENDPOINT ?? 'localhost:7051';
const PEER_HOST_ALIAS =
  process.env.FABRIC_PEER_HOST_ALIAS ?? 'peer0.ficct.edu.bo';
const MSP_ID = process.env.FABRIC_MSP_ID ?? 'FICCTOrgMSP';
const CHANNEL_NAME = process.env.FABRIC_CHANNEL ?? 'evoting';
const CHAINCODE_NAME = process.env.FABRIC_CHAINCODE ?? 'evoting-cc';

/** Fila del sondeo de nodos activos usado para decidir a qué peer conectarse. */
interface ActiveNodeRow {
  total: number;
  endpoint: string | null;
  host_alias: string | null;
}

/** Fila con el canal de Fabric asignado a una elección. */
interface ElectionChannelRow {
  canal_fabric: string | null;
}

/** Conteo de votos por candidato (`count` llega como texto desde Postgres). */
interface CandidateTallyRow {
  id: string;
  count: string;
}

/** Conteo de votos blancos y nulos (ambos llegan como texto desde Postgres). */
interface SpecialVotesRow {
  blancos: string;
  nulos: string;
}

@Injectable()
export class FabricService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabricService.name);
  private gateway: Gateway | null = null;
  private grpcClient: grpc.Client | null = null;
  private contracts = new Map<string, Contract>();

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.reconnect();
    } catch (err) {
      this.logger.warn(
        `Fabric no disponible al arrancar (modo offline): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.gateway?.close();
    this.grpcClient?.close();
  }

  async reconnect(): Promise<void> {
    this.gateway?.close();
    this.grpcClient?.close();
    this.gateway = null;
    this.grpcClient = null;
    this.contracts.clear();

    // Intenta el primer peer activo de la DB; si todos están inactivos, Fabric queda offline.
    let endpoint = PEER_ENDPOINT;
    let hostAlias = PEER_HOST_ALIAS;
    let nodesConfigured = false;
    try {
      const { rows } = await this.db.query<ActiveNodeRow>(
        `SELECT
           COUNT(*)::int AS total,
           (
             SELECT endpoint
             FROM nodos_fabric
             WHERE activo = true
             ORDER BY prioridad ASC, creado_en ASC
             LIMIT 1
           ) AS endpoint,
           (
             SELECT host_alias
             FROM nodos_fabric
             WHERE activo = true
             ORDER BY prioridad ASC, creado_en ASC
             LIMIT 1
           ) AS host_alias
         FROM nodos_fabric`,
      );
      nodesConfigured = Number(rows[0]?.total ?? 0) > 0;
      if (rows[0]?.endpoint && rows[0]?.host_alias) {
        endpoint = rows[0].endpoint;
        hostAlias = rows[0].host_alias;
      } else if (nodesConfigured) {
        this.logger.warn(
          'Fabric desconectado: no hay nodos activos configurados',
        );
        return;
      }
    } catch {
      // tabla aún no existe o DB offline → usa env vars
    }

    await this.connectToFabric(endpoint, hostAlias);
    this.logger.log(`Fabric conectado → ${endpoint} (${hostAlias})`);
  }

  private async connectToFabric(
    peerEndpoint = PEER_ENDPOINT,
    peerHostAlias = PEER_HOST_ALIAS,
  ): Promise<void> {
    const peerOrgPath = path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      'ficct.edu.bo',
    );
    const tlsCertPath = path.join(
      peerOrgPath,
      'peers',
      'peer0.ficct.edu.bo',
      'tls',
      'ca.crt',
    );
    const adminCertDir = path.join(
      peerOrgPath,
      'users',
      'Admin@ficct.edu.bo',
      'msp',
      'signcerts',
    );
    const adminKeyDir = path.join(
      peerOrgPath,
      'users',
      'Admin@ficct.edu.bo',
      'msp',
      'keystore',
    );

    const tlsCert = await fs.readFile(tlsCertPath);
    const certFiles = await fs.readdir(adminCertDir);
    if (certFiles.length === 0)
      throw new Error('No certificate found in admin signcerts');
    const adminCert = await fs.readFile(path.join(adminCertDir, certFiles[0]));
    const keyFiles = await fs.readdir(adminKeyDir);
    if (keyFiles.length === 0)
      throw new Error('No private key found in admin keystore');
    const adminKey = await fs.readFile(path.join(adminKeyDir, keyFiles[0]));
    const privateKey = crypto.createPrivateKey(adminKey);

    this.grpcClient = new grpc.Client(
      peerEndpoint,
      grpc.credentials.createSsl(tlsCert),
      { 'grpc.ssl_target_name_override': peerHostAlias },
    );

    this.gateway = connect({
      client: this.grpcClient,
      identity: { mspId: MSP_ID, credentials: adminCert },
      signer: signers.newPrivateKeySigner(privateKey),
      hash: hash.sha256,
    });

    // Prime the default channel eagerly so getContract() keeps working
    this.contracts.set(
      CHANNEL_NAME,
      this.gateway
        .getNetwork(CHANNEL_NAME)
        .getContract(CHAINCODE_NAME, 'FicctVoting'),
    );
  }

  private getContractForChannel(channelName: string): Contract {
    if (!this.gateway) {
      throw new ServiceUnavailableException(
        'Red Fabric no disponible. Ejecuta fabric/network/scripts/setup.sh',
      );
    }
    if (!this.contracts.has(channelName)) {
      this.contracts.set(
        channelName,
        this.gateway
          .getNetwork(channelName)
          .getContract(CHAINCODE_NAME, 'FicctVoting'),
      );
    }
    return this.contracts.get(channelName)!;
  }

  async getElectionChannel(electionId: string): Promise<string> {
    try {
      const { rows } = await this.db.query<ElectionChannelRow>(
        `SELECT canal_fabric FROM elecciones WHERE id = $1`,
        [electionId],
      );
      return rows[0]?.canal_fabric ?? CHANNEL_NAME;
    } catch {
      return CHANNEL_NAME;
    }
  }

  async initEleccion(electionId: string): Promise<void> {
    const channel = await this.getElectionChannel(electionId);
    const contract = this.getContractForChannel(channel);
    try {
      await contract.submitTransaction('initEleccion', electionId);
    } catch (err) {
      throw new Error(this.formatFabricError(err, channel));
    }
    this.logger.log(
      `Election initialized on ledger — electionId: ${electionId}`,
    );
  }

  async createLocalVoteReceipt(
    electionId: string,
  ): Promise<{ txId: string; voteId: string; channel: string }> {
    const channel = await this.getElectionChannel(electionId);
    return {
      txId: `LOCAL-${randomUUID()}`,
      voteId: randomUUID(),
      channel,
    };
  }

  async emitirVoto(
    _userId: string,
    electionId: string,
    candidateId: string,
  ): Promise<{ txId: string; voteId: string; channel: string }> {
    await this.assertElectionCanReceiveVote(electionId, candidateId);

    const voteId = randomUUID();
    const channel = await this.getElectionChannel(electionId);
    const contract = this.getContractForChannel(channel);

    const proposal = contract.newProposal('emitirVoto', {
      arguments: [voteId, electionId, candidateId],
    });
    let transaction;
    try {
      transaction = await proposal.endorse();
    } catch (err) {
      throw new Error(this.formatFabricError(err, channel));
    }
    const txId = transaction.getTransactionId();

    try {
      await transaction.submit();
    } catch (err) {
      throw new Error(this.formatFabricError(err, channel));
    }

    this.logger.log(`Vote committed — channel: ${channel}, txId: ${txId}`);
    return { txId, voteId, channel };
  }

  private formatFabricError(err: unknown, channel: string): string {
    const base = err instanceof Error ? err.message : String(err);
    const details = (err as { details?: unknown })?.details;

    if (Array.isArray(details)) {
      const messages = details
        .map((detail) => {
          if (detail && typeof detail === 'object' && 'message' in detail) {
            return String((detail as { message: unknown }).message);
          }
          return String(detail);
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return `Canal ${channel}: ${messages.join(' | ')}`;
      }
    }

    return `Canal ${channel}: ${base}`;
  }

  private async assertElectionCanReceiveVote(
    electionId: string,
    candidateId: string,
  ): Promise<void> {
    const electionRes = await this.db.query<{
      estado: string;
      fecha_inicio: Date;
      fecha_fin: Date;
    }>(`SELECT estado, fecha_inicio, fecha_fin FROM elecciones WHERE id = $1`, [
      electionId,
    ]);

    const election = electionRes.rows[0];
    if (!election)
      throw new NotFoundException(`Elección ${electionId} no encontrada`);

    const now = new Date();
    if (election.estado !== 'ACTIVA') {
      throw new BadRequestException(
        `La elección no está activa (estado: ${election.estado})`,
      );
    }
    if (new Date(election.fecha_inicio) > now) {
      throw new BadRequestException('La elección todavía no inició');
    }
    if (new Date(election.fecha_fin) < now) {
      throw new BadRequestException('La elección ya terminó');
    }

    if (candidateId === 'votos_blancos' || candidateId === 'votos_nulos')
      return;

    const candidateRes = await this.db.query<{ id: string }>(
      `SELECT id FROM candidatos WHERE id = $1 AND id_eleccion = $2`,
      [candidateId, electionId],
    );
    if (!candidateRes.rows[0]) {
      throw new BadRequestException(
        'El candidato no pertenece a esta elección',
      );
    }
  }

  async getResultados(electionId: string): Promise<TallyAsset> {
    // Obtener los conteos reales desde la base de datos (Sincronizado con Blockchain)
    const resultsRes = await this.db.query<CandidateTallyRow>(
      `SELECT c.id, COUNT(rv.id_candidato) as count
       FROM candidatos c
       LEFT JOIN recibos_voto rv ON c.id = rv.id_candidato AND rv.estado = 'CONFIRMADO'
       WHERE c.id_eleccion = $1
       GROUP BY c.id`,
      [electionId],
    );

    const results: Record<string, number> = {};
    resultsRes.rows.forEach((row) => {
      results[row.id] = parseInt(row.count, 10);
    });

    // Contar votos blancos y nulos desde la base de datos
    const blancosNulosRes = await this.db.query<SpecialVotesRow>(
      `SELECT
         COUNT(*) FILTER (WHERE tipo_voto_especial = 'votos_blancos') as blancos,
         COUNT(*) FILTER (WHERE tipo_voto_especial = 'votos_nulos') as nulos
       FROM recibos_voto
       WHERE id_eleccion = $1 AND estado = 'CONFIRMADO'`,
      [electionId],
    );

    results['votos_blancos'] = parseInt(
      blancosNulosRes.rows[0]?.blancos || '0',
      10,
    );
    results['votos_nulos'] = parseInt(
      blancosNulosRes.rows[0]?.nulos || '0',
      10,
    );

    return {
      assetType: 'tally',
      electionId,
      results,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getUserReceipts(userId: string): Promise<VoteReceipt[]> {
    const { rows } = await this.db.query<{
      id_eleccion: string;
      id_transaccion: string;
      estado: SyncStatus;
      canal_fabric: string | null;
      creado_en: Date;
      mensaje_error: string | null;
    }>(
      `SELECT id_eleccion, id_transaccion, estado, canal_fabric, creado_en, mensaje_error
       FROM recibos_voto
       WHERE id_usuario = $1 AND estado = 'CONFIRMADO' AND id_transaccion IS NOT NULL
       ORDER BY creado_en DESC`,
      [userId],
    );

    return rows.map((row) => ({
      electionId: row.id_eleccion,
      txId: row.id_transaccion,
      status: row.estado,
      channel: row.canal_fabric,
      createdAt: row.creado_en,
      errorMessage: row.mensaje_error,
    }));
  }

  async verificarVoto(txId: string): Promise<VoteVerification> {
    const receiptRes = await this.db.query<{
      id_eleccion: string;
      estado: SyncStatus;
      canal_fabric: string | null;
      mensaje_error: string | null;
    }>(
      `SELECT id_eleccion, estado, canal_fabric, mensaje_error
       FROM recibos_voto
       WHERE id_transaccion = $1
       LIMIT 1`,
      [txId],
    );

    const receipt = receiptRes.rows[0];
    if (receipt?.estado === 'CONFIRMADO' && txId.startsWith('LOCAL-')) {
      return {
        txId,
        electionId: receipt.id_eleccion,
        status: receipt.estado,
        counted: true,
        channel: receipt.canal_fabric,
        source: 'LOCAL',
        message: 'Voto contado en modo contingencia local',
      };
    }

    // Resolve the channel this txId was submitted on via recibos_voto
    const channel = receipt?.canal_fabric ?? CHANNEL_NAME;

    try {
      const result = await this.getContractForChannel(
        channel,
      ).evaluateTransaction('verificarVoto', txId);
      const vote = JSON.parse(
        Buffer.from(result).toString('utf8'),
      ) as VoteAsset;
      return {
        txId,
        electionId: vote.electionId,
        status: receipt?.estado ?? 'CONFIRMADO',
        counted: receipt?.estado === 'CONFIRMADO' || !receipt,
        channel,
        source: 'FABRIC',
        message: 'Voto encontrado en Fabric',
      };
    } catch {
      if (receipt) {
        return {
          txId,
          electionId: receipt.id_eleccion,
          status: receipt.estado,
          counted: receipt.estado === 'CONFIRMADO',
          channel,
          source: 'LOCAL',
          message:
            receipt.mensaje_error ?? 'Recibo encontrado en base de datos local',
        };
      }
      return {
        txId,
        electionId: null,
        status: 'NO_ENCONTRADO',
        counted: false,
        channel,
        source: 'DESCONOCIDO',
        message: `Transacción ${txId} no encontrada`,
      };
    }
  }

  async cerrarEleccion(electionId: string): Promise<void> {
    const channel = await this.getElectionChannel(electionId);
    try {
      await this.getContractForChannel(channel).submitTransaction(
        'cerrarEleccion',
        electionId,
      );
    } catch (err) {
      throw new Error(this.formatFabricError(err, channel));
    }
    this.logger.log(`Election closed on ledger — electionId: ${electionId}`);
  }

  async saveSyncLog(data: {
    userId: string;
    electionId: string;
    candidateId?: string;
    voteId: string | null;
    txId: string | null;
    status: SyncStatus;
    errorMessage: string | null;
    canal?: string;
  }): Promise<void> {
    // Handle special candidate IDs (votos_blancos, votos_nulos) - not UUIDs
    const isSpecialCandidate =
      data.candidateId === 'votos_blancos' ||
      data.candidateId === 'votos_nulos';
    const candidateIdValue =
      data.status === 'CONFIRMADO' && !isSpecialCandidate
        ? data.candidateId
        : null;
    const tipoVotoEspecial = isSpecialCandidate ? data.candidateId : null;

    this.logger.log(
      `saveSyncLog: candidateId=${data.candidateId}, isSpecial=${isSpecialCandidate}, tipoVotoEspecial=${tipoVotoEspecial}`,
    );

    await this.db.query(
      `INSERT INTO recibos_voto
         (id_usuario, id_eleccion, id_voto, id_candidato, id_transaccion, tipo_voto_especial, estado, mensaje_error, canal_fabric)
       VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7::estado_sincronizacion, $8, $9)
       ON CONFLICT (id_eleccion, id_usuario)
       DO UPDATE SET
         id_transaccion     = EXCLUDED.id_transaccion,
         id_candidato       = EXCLUDED.id_candidato,
         tipo_voto_especial = EXCLUDED.tipo_voto_especial,
         estado             = EXCLUDED.estado,
         mensaje_error      = EXCLUDED.mensaje_error,
         canal_fabric       = EXCLUDED.canal_fabric,
         confirmado_en      = CASE WHEN EXCLUDED.estado = 'CONFIRMADO' THEN NOW() ELSE NULL END`,
      [
        data.userId,
        data.electionId,
        data.voteId ?? randomUUID(),
        candidateIdValue,
        data.txId,
        tipoVotoEspecial,
        data.status,
        data.errorMessage,
        data.canal ?? CHANNEL_NAME,
      ],
    );
  }
}
