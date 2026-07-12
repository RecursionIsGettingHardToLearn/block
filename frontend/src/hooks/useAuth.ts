import { useAuthStore } from '../store/auth.store';
import api from '../api/axios.config';
import type { AuthResponse } from '../types';

export function useAuth() {
  const { user, token, setAuth, logout, isAdmin } = useAuthStore();

  async function login(identificador: string, password: string): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/login', {
      identificador,
      password,
    });
    setAuth(data);
  }

  return {
    user,
    token,
    login,
    logout,
    isAdmin,
    isAuthenticated: !!token && !!user,
  };
}
