import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import Login from '../pages/public/Login';
import LiveResults from '../pages/public/LiveResults';
import Dashboard from '../pages/admin/Dashboard';
import ElectionManager from '../pages/admin/ElectionManager';
import AuditLogs from '../pages/admin/AuditLogs';
import UsersPage from '../pages/admin/UsersPage';
import ChannelsPage from '../pages/admin/ChannelsPage';
import NodesPage from '../pages/admin/NodesPage';
import CAPage from '../pages/admin/CAPage';
import ReportsPage from '../pages/admin/ReportsPage';
import VotingPage from '../pages/voter/VotingPage';
import AuditorDashboard from '../pages/auditor/AuditorDashboard';
import VoteValidator from '../pages/auditor/VoteValidator';
import AdminResults from '../pages/admin/AdminResults';
import AdminLayout from '../components/layout/AdminLayout';
import VoterLayout from '../components/layout/VoterLayout';
import PublicLayout from '../components/layout/PublicLayout';
import ProtectedRoute from './ProtectedRoute';

/** Redirige al home según el rol del usuario autenticado */
function RootRedirect() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isAuditor = useAuthStore((s) => s.isAuditor());
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (isAuditor) return <Navigate to="/auditor/resultados" replace />;
  return <Navigate to="/votante/votar" replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Público ───────────────────────────────────────────────────── */}
        <Route path="/login" element={<Login />} />
        <Route path="/elecciones" element={<PublicLayout />}>
          <Route index element={<LiveResults />} />
        </Route>

        {/* Raíz → redirige según rol */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RootRedirect />
            </ProtectedRoute>
          }
        />

        {/* ── ADMINISTRADOR ─────────────────────────────────────────────── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMINISTRADOR', 'ADMIN']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="elecciones" element={<ElectionManager />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="auditoria" element={<AuditLogs />} />
          <Route path="resultados" element={<AdminResults />} />
          <Route path="nodos" element={<NodesPage />} />
          <Route path="canales" element={<ChannelsPage />} />
          <Route path="ca" element={<CAPage />} />
          <Route path="reportes" element={<ReportsPage />} />
        </Route>

        {/* ── VOTANTE ───────────────────────────────────────────────────── */}
        <Route
          path="/votante"
          element={
            <ProtectedRoute roles={['VOTANTE', 'ESTUDIANTE', 'DOCENTE']}>
              <VoterLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/votante/votar" replace />} />
          <Route path="votar" element={<VotingPage />} />
          <Route path="resultados" element={<LiveResults />} />
        </Route>

        {/* ── AUDITOR ───────────────────────────────────────────────────── */}
        <Route
          path="/auditor"
          element={
            <ProtectedRoute roles={['AUDITOR']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={<Navigate to="/auditor/resultados" replace />}
          />
          <Route path="resultados" element={<AuditorDashboard />} />
          <Route path="validar" element={<VoteValidator />} />
          <Route path="blockchain" element={<AuditLogs />} />
          <Route path="reportes" element={<ReportsPage />} />
        </Route>

        {/* URLs antiguas → redirigen al equivalente nuevo */}
        {/* URLs antiguas → redirigen al equivalente nuevo bajo protección */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Navigate to="/admin/dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/elections"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Navigate to="/admin/elecciones" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Navigate to="/admin/usuarios" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Navigate to="/admin/auditoria" replace />
            </ProtectedRoute>
          }
        />

        <Route
          path="/vote"
          element={
            <ProtectedRoute roles={['VOTANTE']}>
              <Navigate to="/votante/votar" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute roles={['VOTANTE']}>
              <Navigate to="/votante/resultados" replace />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
