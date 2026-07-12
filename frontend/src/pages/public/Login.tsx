import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/auth.store';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Declarado antes del efecto que lo usa: al ser una constante, referenciarlo
  // en el arreglo de dependencias antes de su inicialización sería un error.
  const redirectByRole = useCallback(() => {
    const store = useAuthStore.getState();
    if (store.isAdmin()) navigate('/admin/dashboard');
    else if (store.isAuditor()) navigate('/auditor/resultados');
    else navigate('/votante/votar');
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      redirectByRole();
    }
  }, [isAuthenticated, redirectByRole]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identificador, password);
      redirectByRole();
    } catch {
      setError('Identificador o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 animate-slide-up"
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border)',
        }}
      >
        <h1
          className="text-xl font-bold mb-1"
          style={{ color: 'var(--text-1)' }}
        >
          Iniciar sesión
        </h1>
        <p className="text-sm mb-7" style={{ color: 'var(--text-2)' }}>
          Ingresa con tus credenciales institucionales
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="identificador"
              className="text-xs font-semibold"
              style={{ color: 'var(--text-2)' }}
            >
              Identificador
            </label>
            <input
              id="identificador"
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="R.U., C.I., correo, código…"
              required
              autoFocus
              className="w-full rounded-lg px-3.5 py-2.5 text-sm"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                outline: 'none',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'var(--brand)')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'var(--border)')
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-semibold"
              style={{ color: 'var(--text-2)' }}
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg px-3.5 py-2.5 text-sm pr-10"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                  outline: 'none',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--brand)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--border)')
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer p-0 flex items-center"
                style={{ color: 'var(--text-3)' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs animate-slide-up"
              style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
              role="alert"
            >
              <AlertCircle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white border-0 cursor-pointer transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            style={{
              background:
                'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Ingresando…
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
