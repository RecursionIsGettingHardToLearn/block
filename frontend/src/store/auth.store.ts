import { create } from 'zustand';
import type { AuthResponse, CualquierRol } from '../types';

type AuthUser = AuthResponse['user'];

// Normaliza tanto roles nuevos (ADMINISTRADOR/VOTANTE) como los anteriores (ADMIN/ESTUDIANTE/DOCENTE)
function normalizeRole(
  role: CualquierRol | undefined,
): 'ADMINISTRADOR' | 'AUDITOR' | 'VOTANTE' | null {
  if (!role) return null;
  if (role === 'ADMIN' || role === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (role === 'AUDITOR') return 'AUDITOR';
  if (role === 'VOTANTE' || role === 'ESTUDIANTE' || role === 'DOCENTE')
    return 'VOTANTE';
  return null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (data: AuthResponse) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isAuditor: () => boolean;
  isVoter: () => boolean;
  getRolNormalizado: () => 'ADMINISTRADOR' | 'AUDITOR' | 'VOTANTE' | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    try {
      const raw = localStorage.getItem('auth_user');
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem('access_token'),

  setAuth(data) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    set({ token: data.access_token, user: data.user });
  },

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null });
  },

  isAdmin() {
    return normalizeRole(get().user?.role) === 'ADMINISTRADOR';
  },
  isAuditor() {
    return normalizeRole(get().user?.role) === 'AUDITOR';
  },
  isVoter() {
    return normalizeRole(get().user?.role) === 'VOTANTE';
  },
  getRolNormalizado() {
    return normalizeRole(get().user?.role);
  },
}));
