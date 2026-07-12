import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import { getCaErrorMessage, getErrorMessage } from '../common/errors';
import { RegisterIdentityDto } from './dto/register-identity.dto';

const CA_URL = process.env.FABRIC_CA_URL ?? 'https://localhost:7054';
const CRYPTO_BASE =
  process.env.FABRIC_CRYPTO_PATH ??
  path.resolve(__dirname, '../../../../fabric/network/crypto-material');

const CA_TLS_CERT = path.resolve(
  __dirname,
  '../../../../fabric/network/fabric-ca/ficct/tls-cert.pem',
);

const ADMIN_CERT_DIR = path.join(
  CRYPTO_BASE,
  'peerOrganizations/ficct.edu.bo/users/Admin@ficct.edu.bo/msp/signcerts',
);
const ADMIN_KEY_DIR = path.join(
  CRYPTO_BASE,
  'peerOrganizations/ficct.edu.bo/users/Admin@ficct.edu.bo/msp/keystore',
);

/** Envoltorio estándar de toda respuesta de la API REST de Fabric CA. */
interface CaEnvelope<T> {
  success: boolean;
  result: T;
  errors?: { code?: number; message?: string }[];
}

/** Campos que devuelve `/api/v1/cainfo` (nombres en PascalCase, como la CA). */
interface CaInfoResult {
  CAName?: string;
  CAChain?: string;
  IssuerPublicKey?: string;
  Version?: string;
}

export interface CaInfo {
  caName: string;
  caChain: string;
  issuerPublicKey: string;
  version: string;
}

export interface FabricIdentity {
  id: string;
  type: string;
  affiliation: string;
  maxEnrollments: number;
  attrs: { name: string; value: string; ecert: boolean }[];
}

export interface FabricCertificate {
  id: string;
  serial: string;
  pem: string;
  notAfter: string;
  notBefore: string;
  revoked: boolean;
}

@Injectable()
export class CaService {
  private readonly logger = new Logger(CaService.name);
  private http: AxiosInstance | null = null;

  private async getHttp(): Promise<AxiosInstance> {
    if (this.http) return this.http;
    let caCert: Buffer | undefined;
    try {
      caCert = await fs.readFile(CA_TLS_CERT);
    } catch {
      /* skip */
    }
    this.http = axios.create({
      baseURL: CA_URL,
      timeout: 8_000,
      httpsAgent: new https.Agent({ ca: caCert, rejectUnauthorized: !!caCert }),
    });
    return this.http;
  }

  async getInfo(): Promise<CaInfo> {
    try {
      const http = await this.getHttp();
      const res = await http.get<CaEnvelope<CaInfoResult>>('/api/v1/cainfo');
      const r: CaInfoResult = res.data?.result ?? {};
      return {
        caName: r.CAName ?? 'ca-ficct',
        caChain: r.CAChain ?? '',
        issuerPublicKey: r.IssuerPublicKey ?? '',
        version: r.Version ?? '',
      };
    } catch (err: unknown) {
      this.logger.error(`CA info failed: ${getErrorMessage(err)}`);
      throw new ServiceUnavailableException(
        'CA no disponible — asegúrate de que el contenedor ca.ficct.edu.bo esté corriendo',
      );
    }
  }

  // ── Identities: leídas del crypto-material del sistema de archivos ──────────
  // La Fabric CA requiere que el token de autenticación use un cert emitido por
  // esa misma CA (no por cryptogen). Como la red usa cryptogen, leemos las
  // identidades directamente del directorio crypto-material.
  async listIdentities(): Promise<FabricIdentity[]> {
    const result: FabricIdentity[] = [];
    const peerOrgDir = path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      'ficct.edu.bo',
    );
    const ordererOrgDir = path.join(
      CRYPTO_BASE,
      'ordererOrganizations',
      'ficct.edu.bo',
    );

    const add = (id: string, type: string, maxE = -1) =>
      result.push({
        id,
        type,
        affiliation: 'ficct.edu.bo',
        maxEnrollments: maxE,
        attrs: [],
      });

    // Users (Admin + User1)
    try {
      const users = await fs.readdir(path.join(peerOrgDir, 'users'));
      for (const u of users) add(u, u.startsWith('Admin') ? 'admin' : 'client');
    } catch {
      /* crypto-material not found */
    }

    // Peers
    try {
      const peers = await fs.readdir(path.join(peerOrgDir, 'peers'));
      for (const p of peers) add(p, 'peer', 1);
    } catch {
      /* skip */
    }

    // Orderers
    try {
      const orderers = await fs.readdir(path.join(ordererOrgDir, 'orderers'));
      for (const o of orderers) add(o, 'orderer', 1);
    } catch {
      /* skip */
    }

    if (result.length === 0) {
      throw new ServiceUnavailableException(
        'No se encontró crypto-material. Ejecuta restart-network.ps1 primero.',
      );
    }
    return result;
  }

  // ── Certificates: parsed from PEM files in crypto-material ─────────────────
  async listCertificates(): Promise<FabricCertificate[]> {
    const result: FabricCertificate[] = [];
    const peerOrgDir = path.join(
      CRYPTO_BASE,
      'peerOrganizations',
      'ficct.edu.bo',
    );

    const readCert = async (
      certPath: string,
      id: string,
    ): Promise<FabricCertificate | null> => {
      try {
        const pem = await fs.readFile(certPath, 'utf8');
        const x509 = new crypto.X509Certificate(pem);
        return {
          id,
          serial: x509.serialNumber,
          pem,
          notAfter: x509.validTo,
          notBefore: x509.validFrom,
          revoked: false,
        };
      } catch {
        return null;
      }
    };

    const scanSigncerts = async (
      baseDir: string,
      entries: string[],
      id: (e: string) => string,
    ) => {
      for (const entry of entries) {
        const signcertsDir = path.join(baseDir, entry, 'msp', 'signcerts');
        try {
          const files = await fs.readdir(signcertsDir);
          for (const f of files) {
            if (!f.endsWith('.pem')) continue;
            const cert = await readCert(path.join(signcertsDir, f), id(entry));
            if (cert) result.push(cert);
          }
        } catch {
          /* dir missing */
        }
      }
    };

    try {
      const users = await fs
        .readdir(path.join(peerOrgDir, 'users'))
        .catch(() => [] as string[]);
      await scanSigncerts(path.join(peerOrgDir, 'users'), users, (u) => u);

      const peers = await fs
        .readdir(path.join(peerOrgDir, 'peers'))
        .catch(() => [] as string[]);
      await scanSigncerts(path.join(peerOrgDir, 'peers'), peers, (p) => p);
    } catch (err: unknown) {
      this.logger.error(`listCertificates failed: ${getErrorMessage(err)}`);
      throw new ServiceUnavailableException(
        'No se pudo leer los certificados del crypto-material',
      );
    }

    return result;
  }

  // ── Register identity via Fabric CA REST API ───────────────────────────────
  // Requiere que la CA esté corriendo y que el admin haya sido enrolado.
  async registerIdentity(
    dto: RegisterIdentityDto,
  ): Promise<{ secret: string }> {
    const body = JSON.stringify({
      id: dto.id,
      secret: dto.secret,
      type: dto.type,
      affiliation: dto.affiliation ?? 'ficct',
      max_enrollments: dto.maxEnrollments ?? -1,
      attrs: [],
    });
    try {
      const http = await this.getHttp();
      const token = await this.buildAuthToken(body);
      const res = await http.post<CaEnvelope<{ secret: string }>>(
        '/api/v1/identities',
        JSON.parse(body) as unknown,
        {
          headers: { Authorization: token, 'Content-Type': 'application/json' },
        },
      );
      return { secret: this.wrap<{ secret: string }>(res).secret };
    } catch (err: unknown) {
      this.logger.error(`Register identity failed: ${getErrorMessage(err)}`);
      throw new ServiceUnavailableException(
        getCaErrorMessage(err) ??
          'Error al registrar identidad. Nota: esta operación requiere que la CA tenga el admin enrolado.',
      );
    }
  }

  async revokeIdentity(id: string): Promise<void> {
    const body = JSON.stringify({ id, reason: 'unspecified', gencrl: false });
    try {
      const http = await this.getHttp();
      const token = await this.buildAuthToken(body);
      await http.delete(`/api/v1/identities/${encodeURIComponent(id)}`, {
        headers: { Authorization: token },
      });
    } catch (err: unknown) {
      this.logger.error(`Revoke identity failed: ${getErrorMessage(err)}`);
      throw new ServiceUnavailableException('Error al revocar identidad');
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async buildAuthToken(bodyJson = ''): Promise<string> {
    const certFiles = await fs.readdir(ADMIN_CERT_DIR);
    if (!certFiles.length) throw new Error('Admin cert not found');
    const certPem = await fs.readFile(
      path.join(ADMIN_CERT_DIR, certFiles[0]),
      'utf8',
    );

    const keyFiles = await fs.readdir(ADMIN_KEY_DIR);
    if (!keyFiles.length) throw new Error('Admin key not found');
    const keyPem = await fs.readFile(path.join(ADMIN_KEY_DIR, keyFiles[0]));
    const privKey = crypto.createPrivateKey(keyPem);

    const b64Cert = certPem
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s/g, '');
    const b64Body = Buffer.from(bodyJson).toString('base64');
    const payload = Buffer.from(`${b64Body}.${b64Cert}`);
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    const b64Sig = sign.sign(privKey, 'base64');

    return `${b64Cert}.${b64Sig}`;
  }

  private wrap<T>(res: AxiosResponse<CaEnvelope<T>>): T {
    if (!res.data?.success) {
      throw new ServiceUnavailableException(
        res.data?.errors?.[0]?.message ?? 'CA request failed',
      );
    }
    return res.data.result;
  }
}
