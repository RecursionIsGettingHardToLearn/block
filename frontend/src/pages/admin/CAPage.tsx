import { useState, useEffect, useCallback } from 'react';
import {
  ShieldHalf,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Key,
  User,
  Cpu,
  Globe,
  Lock,
} from 'lucide-react';
import api from '../../api/axios.config';
import { getApiErrorMessage } from '../../api/errors';

// ── Types ──────────────────────────────────────────────────────────────────

interface CaInfo {
  caName: string;
  version: string;
  caChain: string;
  issuerPublicKey: string;
}

interface FabricIdentity {
  id: string;
  type: 'admin' | 'peer' | 'orderer' | 'client';
  affiliation: string;
  maxEnrollments: number;
  attrs: { name: string; value: string }[];
}

interface FabricCertificate {
  id: string;
  serial: string;
  pem: string;
  notAfter: string;
  notBefore: string;
  revoked: boolean;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  admin: <ShieldHalf size={13} />,
  peer: <Cpu size={13} />,
  orderer: <Globe size={13} />,
  client: <User size={13} />,
};

const TYPE_COLOR: Record<string, string> = {
  admin: '#7c3aed',
  peer: '#0284c7',
  orderer: '#b45309',
  client: '#059669',
};

const iStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-1)',
  outline: 'none',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  width: '100%',
};

// ── Main component ─────────────────────────────────────────────────────────

type Tab = 'info' | 'identities' | 'certificates';

export default function CAPage() {
  const [tab, setTab] = useState<Tab>('info');
  const [caInfo, setCaInfo] = useState<CaInfo | null>(null);
  const [identities, setIdentities] = useState<FabricIdentity[]>([]);
  const [certificates, setCertificates] = useState<FabricCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: '',
    secret: '',
    type: 'client',
    affiliation: 'ficct',
    maxEnrollments: -1,
  });
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [expandedCert, setExpandedCert] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<CaInfo>('/ca/info');
      setCaInfo(data);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'CA no disponible'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIdentities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<FabricIdentity[]>('/ca/identities');
      setIdentities(data);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al cargar identidades'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<FabricCertificate[]>('/ca/certificates');
      setCertificates(data);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al cargar certificados'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'info') loadInfo();
    if (tab === 'identities') loadIdentities();
    if (tab === 'certificates') loadCertificates();
  }, [tab, loadInfo, loadIdentities, loadCertificates]);

  async function handleRegister() {
    if (!form.id || !form.secret) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/ca/identities', {
        id: form.id,
        secret: form.secret,
        type: form.type,
        affiliation: form.affiliation,
        maxEnrollments: Number(form.maxEnrollments),
      });
      setForm({
        id: '',
        secret: '',
        type: 'client',
        affiliation: 'ficct',
        maxEnrollments: -1,
      });
      setShowForm(false);
      await loadIdentities();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al registrar identidad'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (
      !confirm(
        `¿Revocar la identidad "${id}"? Esta acción invalida todos sus certificados.`,
      )
    )
      return;
    setRevokingId(id);
    setError(null);
    try {
      await api.delete(`/ca/identities/${encodeURIComponent(id)}`);
      await loadIdentities();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al revocar identidad'));
    } finally {
      setRevokingId(null);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Información' },
    {
      key: 'identities',
      label: `Identidades${identities.length ? ` (${identities.length})` : ''}`,
    },
    {
      key: 'certificates',
      label: `Certificados${certificates.length ? ` (${certificates.length})` : ''}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-slide-up max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-1)' }}
          >
            <Lock size={20} style={{ color: 'var(--brand)' }} />
            Certificate Authority
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            {caInfo
              ? `${caInfo.caName} · Fabric CA ${caInfo.version}`
              : 'Gestión de identidades y certificados Fabric'}
          </p>
        </div>
        <button
          onClick={() => {
            if (tab === 'info') loadInfo();
            if (tab === 'identities') loadIdentities();
            if (tab === 'certificates') loadCertificates();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            borderColor: 'var(--border)',
          }}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-all"
            style={
              tab === key
                ? {
                    background: 'var(--surface)',
                    color: 'var(--brand)',
                    boxShadow: 'var(--shadow-sm)',
                  }
                : { background: 'transparent', color: 'var(--text-3)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
        >
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className="flex items-center justify-center h-32"
          style={{ color: 'var(--text-3)' }}
        >
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {/* ── Tab: Info ── */}
      {!loading && tab === 'info' && caInfo && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div
            className="px-5 py-4 flex items-center gap-3"
            style={{
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--status-active)' }}
            />
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              CA Activa
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[
              { label: 'Nombre CA', value: caInfo.caName },
              { label: 'Versión', value: caInfo.version || '—' },
              { label: 'MSP', value: 'FICCTOrgMSP' },
              { label: 'Endpoint', value: 'https://localhost:7054' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center px-5 py-3 gap-4">
                <span
                  className="text-xs font-semibold w-32 shrink-0"
                  style={{ color: 'var(--text-3)' }}
                >
                  {label}
                </span>
                <span
                  className="text-sm font-mono"
                  style={{ color: 'var(--text-1)' }}
                >
                  {value}
                </span>
              </div>
            ))}
            {caInfo.issuerPublicKey && (
              <div className="px-5 py-3 flex flex-col gap-1">
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-3)' }}
                >
                  Clave pública emisora
                </span>
                <code
                  className="text-[10px] break-all rounded-lg px-3 py-2"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                  }}
                >
                  {caInfo.issuerPublicKey.slice(0, 120)}…
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Identities ── */}
      {!loading && tab === 'identities' && (
        <div className="flex flex-col gap-4">
          {/* Register form toggle */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer transition-opacity hover:opacity-90"
              style={{
                background: showForm ? 'var(--text-3)' : 'var(--brand)',
              }}
            >
              <PlusCircle size={14} />
              {showForm ? 'Cancelar' : 'Registrar identidad'}
            </button>
          </div>

          {/* Register form */}
          {showForm && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-sm font-bold"
                style={{ color: 'var(--text-1)' }}
              >
                Nueva identidad en la CA
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    {
                      label: 'ID (enrollment ID)',
                      key: 'id',
                      ph: 'peer2@ficct.edu.bo',
                    },
                    { label: 'Secret', key: 'secret', ph: 'contraseña' },
                    { label: 'Afiliación', key: 'affiliation', ph: 'ficct' },
                  ] as const
                ).map(({ label, key, ph }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label
                      className="text-xs font-semibold"
                      style={{ color: 'var(--text-2)' }}
                    >
                      {label}
                    </label>
                    <input
                      value={form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                      placeholder={ph}
                      style={iStyle}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-2)' }}
                  >
                    Tipo
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    style={iStyle}
                  >
                    {['admin', 'peer', 'orderer', 'client'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-2)' }}
                  >
                    Max enrollments (-1 = ilimitado)
                  </label>
                  <input
                    type="number"
                    value={form.maxEnrollments}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        maxEnrollments: parseInt(e.target.value),
                      })
                    }
                    style={iStyle}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleRegister}
                  disabled={saving || !form.id || !form.secret}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--brand)' }}
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Key size={13} />
                  )}
                  Registrar
                </button>
              </div>
            </div>
          )}

          {/* Identities table */}
          {identities.length === 0 ? (
            <div
              className="text-center py-12 rounded-2xl text-sm"
              style={{
                color: 'var(--text-3)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              Sin identidades registradas
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {[
                      'Tipo',
                      'ID',
                      'Afiliación',
                      'Max enroll.',
                      'Acciones',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-3)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {identities.map((ident, i) => (
                    <tr
                      key={ident.id}
                      style={{
                        background:
                          i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <span
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full w-fit"
                          style={{
                            background: TYPE_COLOR[ident.type] + '1a',
                            color: TYPE_COLOR[ident.type],
                          }}
                        >
                          {TYPE_ICON[ident.type]}
                          {ident.type}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'var(--text-1)' }}
                      >
                        {ident.id}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: 'var(--text-2)' }}
                      >
                        {ident.affiliation || '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-center"
                        style={{ color: 'var(--text-2)' }}
                      >
                        {ident.maxEnrollments === -1
                          ? '∞'
                          : ident.maxEnrollments}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRevoke(ident.id)}
                          disabled={revokingId === ident.id}
                          title="Revocar identidad"
                          className="p-1.5 rounded-lg border-0 cursor-pointer hover:opacity-80 disabled:opacity-50"
                          style={{
                            background: 'var(--error-bg)',
                            color: 'var(--error)',
                          }}
                        >
                          {revokingId === ident.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Certificates ── */}
      {!loading && tab === 'certificates' && (
        <div className="flex flex-col gap-2">
          {certificates.length === 0 ? (
            <div
              className="text-center py-12 rounded-2xl text-sm"
              style={{
                color: 'var(--text-3)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              Sin certificados
            </div>
          ) : (
            certificates.map((cert) => {
              const expiry = new Date(cert.notAfter);
              const now = new Date();
              const expired = expiry < now;
              const daysLeft = Math.ceil(
                (expiry.getTime() - now.getTime()) / 86400000,
              );
              const isOpen = expandedCert === cert.serial;

              return (
                <div
                  key={cert.serial}
                  className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <button
                    onClick={() => setExpandedCert(isOpen ? null : cert.serial)}
                    className="w-full flex items-center gap-4 px-5 py-3 cursor-pointer border-0 text-left"
                    style={{ background: 'var(--surface)' }}
                  >
                    {cert.revoked || expired ? (
                      <XCircle
                        size={16}
                        style={{ color: 'var(--error)', flexShrink: 0 }}
                      />
                    ) : (
                      <CheckCircle2
                        size={16}
                        style={{ color: 'var(--status-active)', flexShrink: 0 }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold font-mono truncate"
                        style={{ color: 'var(--text-1)' }}
                      >
                        {cert.id || `Serial: ${cert.serial.slice(0, 16)}…`}
                      </p>
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: 'var(--text-3)' }}
                      >
                        Válido: {new Date(cert.notBefore).toLocaleDateString()}{' '}
                        — {expiry.toLocaleDateString()}
                        {!cert.revoked &&
                          !expired &&
                          ` · ${daysLeft}d restantes`}
                        {expired && ' · Expirado'}
                        {cert.revoked && ' · Revocado'}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background:
                          cert.revoked || expired
                            ? 'var(--error-bg)'
                            : daysLeft < 30
                              ? '#fef3c7'
                              : 'var(--status-active-bg, #dcfce7)',
                        color:
                          cert.revoked || expired
                            ? 'var(--error)'
                            : daysLeft < 30
                              ? '#92400e'
                              : 'var(--status-active)',
                      }}
                    >
                      {cert.revoked
                        ? 'Revocado'
                        : expired
                          ? 'Expirado'
                          : daysLeft < 30
                            ? 'Por vencer'
                            : 'Válido'}
                    </span>
                    {isOpen ? (
                      <ChevronUp size={13} style={{ color: 'var(--text-3)' }} />
                    ) : (
                      <ChevronDown
                        size={13}
                        style={{ color: 'var(--text-3)' }}
                      />
                    )}
                  </button>

                  {isOpen && cert.pem && (
                    <div
                      className="px-5 pb-4 pt-2"
                      style={{
                        borderTop: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold mb-1"
                        style={{ color: 'var(--text-3)' }}
                      >
                        PEM
                      </p>
                      <pre
                        className="text-[10px] overflow-x-auto whitespace-pre-wrap break-all rounded-lg p-3"
                        style={{
                          background: '#0f172a',
                          color: '#94a3b8',
                          maxHeight: 200,
                        }}
                      >
                        {cert.pem}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Las operaciones de registro y revocación se aplican directamente en
        ca.ficct.edu.bo:7054
      </p>
    </div>
  );
}
