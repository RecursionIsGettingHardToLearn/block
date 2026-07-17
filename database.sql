-- ═══════════════════════════════════════════════════════════════════════════════
--  DATABASE.SQL — Esquema completo del Sistema de Votación Electrónica
--  PostgreSQL 15+
--
--  Estrategia: borra todo si existe, luego crea desde cero.
--  Uso: psql -U postgres -d evoting_db -f database.sql
--  Después ejecutar: npm run seed  (poblar usuarios y elecciones de prueba)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensiones ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── DROP previo (orden inverso por dependencias FK) ──────────────────────────

DROP TABLE IF EXISTS usuario_canales       CASCADE;
DROP TABLE IF EXISTS observadores_eleccion CASCADE;
DROP TABLE IF EXISTS eventos_auditoria     CASCADE;
DROP TABLE IF EXISTS recibos_voto          CASCADE;
DROP TABLE IF EXISTS padron_electoral      CASCADE;
DROP TABLE IF EXISTS candidatos            CASCADE;
DROP TABLE IF EXISTS elecciones            CASCADE;
DROP TABLE IF EXISTS nodos_fabric          CASCADE;
DROP TABLE IF EXISTS canales_fabric        CASCADE;
DROP TABLE IF EXISTS usuarios              CASCADE;
DROP TABLE IF EXISTS organizaciones        CASCADE;

DROP TYPE IF EXISTS accion_auditoria;
DROP TYPE IF EXISTS estado_sincronizacion;
DROP TYPE IF EXISTS estado_eleccion;
DROP TYPE IF EXISTS rol_usuario;

-- ── ENUMs ────────────────────────────────────────────────────────────────────

CREATE TYPE rol_usuario AS ENUM ('VOTANTE', 'ADMINISTRADOR', 'AUDITOR');

CREATE TYPE estado_eleccion AS ENUM (
  'BORRADOR',
  'PROGRAMADA',
  'ACTIVA',
  'CERRADA',
  'ESCRUTADA'
);

CREATE TYPE estado_sincronizacion AS ENUM ('PENDIENTE', 'CONFIRMADO', 'FALLIDO');

CREATE TYPE accion_auditoria AS ENUM (
  'INICIO_SESION',
  'INICIO_SESION_FALLIDO',
  'USUARIO_CREADO',
  'USUARIO_ACTUALIZADO',
  'USUARIO_DESHABILITADO',
  'USUARIO_HABILITADO',
  'ELECCION_CREADA',
  'ELECCION_ABIERTA',
  'ELECCION_CERRADA',
  'ELECCION_ESCRUTADA',
  'CANDIDATO_AGREGADO',
  'CANDIDATO_ELIMINADO',
  'VOTO_EMITIDO',
  'VOTO_FALLIDO',
  'INTENTO_VOTO_DOBLE',
  'VOTANTE_INSCRITO',
  'VOTANTE_REMOVIDO',
  'OBSERVADOR_ASIGNADO',
  'CONFIGURACION_CAMBIADA'
);

-- ── TABLA 1: ORGANIZACIONES ──────────────────────────────────────────────────

CREATE TABLE organizaciones (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  url_logo      TEXT,
  configuracion JSONB        NOT NULL DEFAULT '{}',
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLA 2: USUARIOS ────────────────────────────────────────────────────────

CREATE TABLE usuarios (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_organizacion  UUID         NOT NULL REFERENCES organizaciones(id) ON DELETE RESTRICT,
  identificador    VARCHAR(100) NOT NULL,
  nombre           VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  hash_contrasena  VARCHAR(255),
  rol              rol_usuario  NOT NULL DEFAULT 'VOTANTE',
  metadatos        JSONB        NOT NULL DEFAULT '{}',
  habilitado       BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(id_organizacion, identificador),
  UNIQUE(id_organizacion, email)
);

-- ── TABLA 3: ELECCIONES ──────────────────────────────────────────────────────

CREATE TABLE elecciones (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_organizacion     UUID              NOT NULL REFERENCES organizaciones(id) ON DELETE RESTRICT,
  titulo              VARCHAR(255)      NOT NULL,
  descripcion         TEXT,
  nombre_cargo        VARCHAR(100),
  fecha_inicio        TIMESTAMPTZ       NOT NULL,
  fecha_fin           TIMESTAMPTZ       NOT NULL,
  estado              estado_eleccion   NOT NULL DEFAULT 'BORRADOR',
  canal_fabric        VARCHAR(100)      NOT NULL DEFAULT 'evoting',
  chaincode_fabric    VARCHAR(100)      NOT NULL DEFAULT 'evoting-cc',
  id_eleccion_fabric  UUID              UNIQUE DEFAULT uuid_generate_v4(),
  configuracion       JSONB             NOT NULL DEFAULT '{}',
  creado_por          UUID              REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en           TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fechas_eleccion CHECK (fecha_fin > fecha_inicio)
);

-- ── TABLA 4: CANDIDATOS ──────────────────────────────────────────────────────

CREATE TABLE candidatos (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_eleccion      UUID         NOT NULL REFERENCES elecciones(id) ON DELETE CASCADE,
  nombre_frente    VARCHAR(100) NOT NULL,
  nombre_candidato VARCHAR(255) NOT NULL,
  nombre_cargo     VARCHAR(100),
  url_foto         TEXT,
  logo_frente      TEXT,
  cid_ipfs         VARCHAR(255),
  mision           TEXT,
  url_propuesta    TEXT,
  orden_boleta     SMALLINT,
  metadatos        JSONB        NOT NULL DEFAULT '{}',
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Una misma persona (identificada por nombre normalizado) no se repite en una elección.
CREATE UNIQUE INDEX IF NOT EXISTS candidatos_persona_por_eleccion_key
  ON candidatos (id_eleccion, LOWER(regexp_replace(TRIM(nombre_candidato), '[[:space:]]+', ' ', 'g')));

-- ── TABLA 5: PADRON_ELECTORAL ────────────────────────────────────────────────

CREATE TABLE padron_electoral (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_eleccion   UUID        NOT NULL REFERENCES elecciones(id) ON DELETE CASCADE,
  id_usuario    UUID        NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  voto_emitido  BOOLEAN     NOT NULL DEFAULT FALSE,
  votado_en     TIMESTAMPTZ,
  inscrito_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inscrito_por  UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE(id_eleccion, id_usuario)
);

-- ── TABLA 6: RECIBOS_VOTO ────────────────────────────────────────────────────

CREATE TABLE recibos_voto (
  id               UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_usuario       UUID                   NOT NULL REFERENCES usuarios(id)   ON DELETE RESTRICT,
  id_eleccion      UUID                   NOT NULL REFERENCES elecciones(id) ON DELETE RESTRICT,
  id_voto          UUID                   NOT NULL,
  id_candidato     UUID,                    -- NULL en votos blancos/nulos
  tipo_voto_especial VARCHAR(20),           -- 'votos_blancos' | 'votos_nulos'
  id_transaccion   VARCHAR(255)           UNIQUE,
  numero_bloque    BIGINT,
  canal_fabric     VARCHAR(100),
  estado           estado_sincronizacion  NOT NULL DEFAULT 'PENDIENTE',
  mensaje_error    TEXT,
  confirmado_en    TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  UNIQUE(id_eleccion, id_usuario)
);

-- ── TABLA 7: EVENTOS_AUDITORIA ───────────────────────────────────────────────

CREATE TABLE eventos_auditoria (
  id               UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_organizacion  UUID              REFERENCES organizaciones(id) ON DELETE SET NULL,
  id_usuario       UUID              REFERENCES usuarios(id)       ON DELETE SET NULL,
  accion           accion_auditoria  NOT NULL,
  direccion_ip     INET,
  agente_usuario   TEXT,
  detalles         JSONB             NOT NULL DEFAULT '{}',
  creado_en        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── TABLA 8: OBSERVADORES_ELECCION ───────────────────────────────────────────

CREATE TABLE observadores_eleccion (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_eleccion   UUID        NOT NULL REFERENCES elecciones(id) ON DELETE CASCADE,
  id_usuario    UUID        NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  otorgado_por  UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  otorgado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_eleccion, id_usuario)
);

-- ── TABLA 9: NODOS_FABRIC ────────────────────────────────────────────────────

CREATE TABLE nodos_fabric (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  endpoint    VARCHAR(255) NOT NULL,
  host_alias  VARCHAR(255) NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  prioridad   SMALLINT     NOT NULL DEFAULT 0,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLA 10: CANALES_FABRIC ─────────────────────────────────────────────────

CREATE TABLE canales_fabric (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLA 11: USUARIO_CANALES ────────────────────────────────────────────────

CREATE TABLE usuario_canales (
  id_usuario   UUID         NOT NULL REFERENCES usuarios(id)      ON DELETE CASCADE,
  canal_fabric VARCHAR(100) NOT NULL REFERENCES canales_fabric(nombre) ON DELETE CASCADE,
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_usuario, canal_fabric)
);

-- ── ÍNDICES ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_usuarios_org            ON usuarios(id_organizacion);
CREATE INDEX idx_usuarios_rol            ON usuarios(rol);
CREATE INDEX idx_usuarios_identificador  ON usuarios(id_organizacion, identificador);
CREATE INDEX idx_usuarios_deshabilitados ON usuarios(id_organizacion) WHERE habilitado = FALSE;

CREATE INDEX idx_elecciones_org     ON elecciones(id_organizacion);
CREATE INDEX idx_elecciones_estado  ON elecciones(estado);
CREATE INDEX idx_elecciones_activas ON elecciones(fecha_inicio, fecha_fin) WHERE estado = 'ACTIVA';
CREATE INDEX idx_elecciones_fabric  ON elecciones(id_eleccion_fabric);
CREATE INDEX idx_elecciones_canal   ON elecciones(canal_fabric);

CREATE INDEX idx_candidatos_eleccion ON candidatos(id_eleccion);
CREATE INDEX idx_candidatos_orden    ON candidatos(id_eleccion, orden_boleta);

CREATE INDEX idx_padron_eleccion   ON padron_electoral(id_eleccion);
CREATE INDEX idx_padron_usuario    ON padron_electoral(id_usuario);
CREATE INDEX idx_padron_pendientes ON padron_electoral(id_eleccion) WHERE voto_emitido = FALSE;

CREATE INDEX idx_recibos_eleccion ON recibos_voto(id_eleccion);
CREATE INDEX idx_recibos_usuario  ON recibos_voto(id_usuario);
CREATE INDEX idx_recibos_estado   ON recibos_voto(estado);
CREATE INDEX idx_recibos_tx       ON recibos_voto(id_transaccion) WHERE id_transaccion IS NOT NULL;
CREATE INDEX idx_recibos_bloque   ON recibos_voto(numero_bloque)  WHERE numero_bloque  IS NOT NULL;

CREATE INDEX idx_auditoria_org      ON eventos_auditoria(id_organizacion, creado_en DESC);
CREATE INDEX idx_auditoria_usuario  ON eventos_auditoria(id_usuario);
CREATE INDEX idx_auditoria_accion   ON eventos_auditoria(accion);
CREATE INDEX idx_auditoria_fecha    ON eventos_auditoria(creado_en DESC);
CREATE INDEX idx_auditoria_seguridad ON eventos_auditoria(id_organizacion, creado_en DESC)
  WHERE accion IN ('INICIO_SESION_FALLIDO', 'INTENTO_VOTO_DOBLE', 'VOTO_FALLIDO');

CREATE INDEX idx_usuario_canales_usuario ON usuario_canales(id_usuario);
CREATE INDEX idx_usuario_canales_canal   ON usuario_canales(canal_fabric);

-- ── DATOS INICIALES ───────────────────────────────────────────────────────────

-- Organización base (UUID fijo requerido por el backend)
INSERT INTO organizaciones (id, nombre, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'UAGRM', 'uagrm');

-- Usuario administrador inicial (contraseña: password123)
INSERT INTO usuarios (id_organizacion, identificador, nombre, email, hash_contrasena, rol) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'admin',
   'Administrador',
   'admin@uagrm.edu.bo',
   '$2b$10$Bur52zgv0wHi0wpiVrc9U.IE8PAOgOg38EyNDkqX1ouH3ztGg0LXi',
   'ADMINISTRADOR');

-- Canal Fabric base (debe coincidir con el canal que crea setup.sh)
INSERT INTO canales_fabric (nombre, descripcion) VALUES
  ('evoting', 'Canal principal de votación FICCT');
