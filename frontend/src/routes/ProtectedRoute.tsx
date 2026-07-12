import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/auth.store';

interface Props {
  children: React.ReactNode;
  /** Roles que pueden acceder. Sin este prop = cualquier usuario autenticado. */
  roles?: Array<
    'ADMINISTRADOR' | 'ADMIN' | 'VOTANTE' | 'ESTUDIANTE' | 'DOCENTE' | 'AUDITOR'
  >;
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isAuditor = useAuthStore((s) => s.isAuditor());
  const isVoter = useAuthStore((s) => s.isVoter());

  // Si no hay token o no hay usuario, forzar login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0) {
    const allowed = roles.some((r) => {
      if (r === 'ADMINISTRADOR' || r === 'ADMIN') return isAdmin;
      if (r === 'AUDITOR') return isAuditor;
      return isVoter; // VOTANTE, ESTUDIANTE, DOCENTE
    });

    if (!allowed) {
      // Si está autenticado pero no tiene permiso para esta sección específica
      if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
      if (isAuditor) return <Navigate to="/auditor/resultados" replace />;
      if (isVoter) return <Navigate to="/votante/votar" replace />;

      // Fallback extremo: si tiene sesión pero no se reconoce su rol, limpiar y login
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
}
