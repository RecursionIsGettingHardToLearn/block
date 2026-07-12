import * as path from 'path';

/**
 * Única fuente de verdad de las rutas al material de la red Fabric.
 *
 * Antes, `CRYPTO_BASE` estaba declarado cuatro veces (fabric, ca, channels y
 * nodes) y con dos resoluciones distintas: `channels` y `nodes` subían tres
 * niveles desde `dist/<modulo>/` —lo correcto para llegar a la raíz del
 * repositorio— mientras que `fabric` y `ca` subían cuatro, con lo que
 * apuntaban un directorio *por encima* del repositorio. Solo la variable de
 * entorno `FABRIC_CRYPTO_PATH` mantenía esos dos módulos en pie; `CA_TLS_CERT`
 * no tenía esa red de seguridad y quedaba directamente roto.
 *
 * Aquí las rutas se derivan de una sola raíz y todas admiten sobrescritura por
 * entorno, que es lo que permite ejecutar el backend fuera del árbol del
 * repositorio (por ejemplo, en el servidor de despliegue).
 */

/**
 * Raíz de `fabric/network/`.
 *
 * Compilado, este archivo queda en `backend/dist/common/`, de modo que tres
 * niveles hacia arriba equivalen a la raíz del repositorio:
 * `dist/common` → `dist` → `backend` → raíz.
 */
export const NETWORK_ROOT =
  process.env.FABRIC_NETWORK_PATH ??
  path.resolve(__dirname, '../../../fabric/network');

/** Certificados y claves generados por `cryptogen`. */
export const CRYPTO_BASE =
  process.env.FABRIC_CRYPTO_PATH ?? path.join(NETWORK_ROOT, 'crypto-material');

/** Bloques y transacciones de configuración del canal. */
export const CHANNEL_ARTIFACTS =
  process.env.FABRIC_CHANNEL_ARTIFACTS ??
  path.join(NETWORK_ROOT, 'channel-artifacts');

/** Perfil de configuración que consume `configtxgen`. */
export const CONFIGTX_PATH =
  process.env.FABRIC_CONFIGTX_PATH ?? path.join(NETWORK_ROOT, 'configtx.yaml');

/** Certificado TLS con el que se valida la conexión a la Fabric CA. */
export const CA_TLS_CERT =
  process.env.FABRIC_CA_TLS_CERT ??
  path.join(NETWORK_ROOT, 'fabric-ca', 'ficct', 'tls-cert.pem');

/** Directorio de la organización de peers dentro del material criptográfico. */
export const PEER_ORG_DIR = path.join(
  CRYPTO_BASE,
  'peerOrganizations',
  'ficct.edu.bo',
);

/** Directorio de la organización del orderer. */
export const ORDERER_ORG_DIR = path.join(
  CRYPTO_BASE,
  'ordererOrganizations',
  'ficct.edu.bo',
);
