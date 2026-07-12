// ── Roles (alineados con official_db.sql) ────────────────────────────────────
// Nuevos valores canónicos
export type RolUsuario = 'VOTANTE' | 'ADMINISTRADOR' | 'AUDITOR';
// Valores anteriores del backend (compatibilidad hacia atrás)
type RolLegado = 'ESTUDIANTE' | 'DOCENTE' | 'ADMIN';
export type CualquierRol = RolUsuario | RolLegado;

// ── Estado de elección ────────────────────────────────────────────────────────
export type EstadoEleccion =
  'BORRADOR' | 'PROGRAMADA' | 'ACTIVA' | 'CERRADA' | 'ESCRUTADA';
export type ElectionStatus = EstadoEleccion;

// ── Tipos heredados ───────────────────────────────────────────────────────────
export type CareerType = 'SISTEMAS' | 'INFORMATICA' | 'REDES';
export type RoleType = CualquierRol;
export type PositionType =
  | 'DECANO'
  | 'DIRECTOR_SISTEMAS'
  | 'DIRECTOR_INFORMATICA'
  | 'DIRECTOR_REDES'
  | string;

// ── Entidades ─────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  ru: string;
  name: string;
  email: string;
  career: CareerType;
  role: CualquierRol;
  channelNames: string[];
  hasVoted: boolean;
  isEnabled: boolean;
  createdAt: string;
}

export interface Candidate {
  id: string;
  electionId?: string;
  frontName: string;
  candidateName: string;
  position: PositionType;
  photoUrl?: string | null;
  mission?: string | null;
  logoFrente?: string | null;
}

export interface Election {
  id: string;
  title: string;
  description?: string;
  status: EstadoEleccion;
  startDate: string;
  endDate: string;
  channelName: string;
  candidates: Candidate[];
  createdAt: string;
}

export interface TallyResult {
  assetType: 'tally';
  electionId: string;
  results: Record<string, number>;
  lastUpdated: string;
}

export interface BlockchainSyncLog {
  id: string;
  userId: string;
  electionId: string;
  txId: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface AuthResponse {
  access_token: string;
  user: Pick<User, 'id' | 'ru' | 'career' | 'role' | 'hasVoted'> & {
    name: string;
  };
}
