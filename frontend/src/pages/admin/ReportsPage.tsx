import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Loader2,
  BarChart3,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import api from '../../api/axios.config';
import { useAuthStore } from '../../store/auth.store';
import { useElections } from '../../hooks/useElections';

interface ReportSpec {
  titulo: string;
  tipoVisual: 'bar' | 'pie' | 'line' | 'table';
  insight: string;
  datos?: { etiqueta: string; valor: number }[];
  tabla?: { columnas: string[]; filas: string[][] };
}

const COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

const SUGERENCIAS_ADMIN = [
  'Usuarios por rol',
  'Elecciones por estado',
  'Estado de los nodos',
  'Votos confirmados, pendientes y fallidos',
];
const SUGERENCIAS_AUDITOR = [
  'Participacion de esta eleccion',
  'Votaron vs. no votaron',
  'Resultados por candidato',
  'Tabla con el padron y la participacion',
];

export default function ReportsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const tipo: 'red' | 'eleccion' = isAdmin ? 'red' : 'eleccion';
  const { elections } = useElections();

  const [selectedElection, setSelectedElection] = useState<string>('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [peticion, setPeticion] = useState('');
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  const reportableElections = useMemo(
    () => elections.filter((e) => e.status !== 'BORRADOR'),
    [elections],
  );

  useEffect(() => {
    api
      .get<{ enabled: boolean }>('/reports/ai-status')
      .then(({ data }) => setAiEnabled(data.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (tipo !== 'eleccion') return;
    if (!selectedElection && reportableElections.length > 0) {
      setSelectedElection(reportableElections[0].id);
    }
  }, [tipo, reportableElections, selectedElection]);

  useEffect(() => {
    setSpec(null);
  }, [selectedElection]);

  async function generar(texto?: string) {
    const q = (texto ?? peticion).trim();
    if (!q || generating) return;
    if (tipo === 'eleccion' && !selectedElection) {
      setError('Selecciona una eleccion primero.');
      return;
    }
    setGenerating(true);
    setError(null);
    setSpec(null);
    try {
      const { data } = await api.post<ReportSpec>('/reports/generate', {
        tipo,
        electionId: tipo === 'eleccion' ? selectedElection : undefined,
        peticion: q,
      });
      setSpec(data);
    } catch (err: unknown) {
      const detalle = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const msg = Array.isArray(detalle) ? detalle[0] : detalle;
      setError(msg ?? 'No se pudo generar el reporte.');
    } finally {
      setGenerating(false);
    }
  }

  async function exportarPdf() {
    if (!spec) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(spec.titulo, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(90);
    const insight = doc.splitTextToSize(spec.insight, 180) as string[];
    doc.text(insight, 14, 26);
    let y = 26 + insight.length * 5 + 4;

    if (spec.tipoVisual === 'table' && spec.tabla) {
      autoTable(doc, {
        startY: y,
        head: [spec.tabla.columnas],
        body: spec.tabla.filas,
      });
    } else if (spec.datos) {
      if (visualRef.current) {
        const canvas = await html2canvas(visualRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        });
        const img = canvas.toDataURL('image/png');
        const w = 180;
        const h = (canvas.height / canvas.width) * w;
        doc.addImage(img, 'PNG', 14, y, w, h);
        y += h + 6;
      }
      autoTable(doc, {
        startY: y,
        head: [['Etiqueta', 'Valor']],
        body: spec.datos.map((d) => [d.etiqueta, String(d.valor)]),
      });
    }
    doc.save(`${spec.titulo}.pdf`);
  }

  function exportarExcel() {
    if (!spec) return;
    const wb = XLSX.utils.book_new();
    const encabezado = [[spec.titulo], [spec.insight], []];
    let sheet;
    if (spec.tipoVisual === 'table' && spec.tabla) {
      sheet = XLSX.utils.aoa_to_sheet([
        ...encabezado,
        spec.tabla.columnas,
        ...spec.tabla.filas,
      ]);
    } else if (spec.datos) {
      sheet = XLSX.utils.aoa_to_sheet([
        ...encabezado,
        ['Etiqueta', 'Valor'],
        ...spec.datos.map((d) => [d.etiqueta, d.valor]),
      ]);
    } else {
      sheet = XLSX.utils.aoa_to_sheet(encabezado);
    }
    XLSX.utils.book_append_sheet(wb, sheet, 'Reporte');
    XLSX.writeFile(wb, `${spec.titulo}.xlsx`);
  }

  const sugerencias = isAdmin ? SUGERENCIAS_ADMIN : SUGERENCIAS_AUDITOR;
  const chartData =
    spec?.datos?.map((d) => ({ name: d.etiqueta, valor: d.valor })) ?? [];

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-32">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart3 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              {isAdmin ? 'Reportes de la Red' : 'Reportes de Elecciones'}
            </h2>
            <p className="text-xs text-slate-400">
              Describe el reporte que necesitas y la IA generara la
              visualizacion. Luego puedes exportarla.
            </p>
          </div>
        </div>
      </div>

      {tipo === 'eleccion' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            Eleccion
          </label>
          <select
            value={selectedElection}
            onChange={(e) => setSelectedElection(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 cursor-pointer"
          >
            {reportableElections.length === 0 && (
              <option value="">No hay elecciones</option>
            )}
            {reportableElections.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.status})
              </option>
            ))}
          </select>
        </div>
      )}

      {!aiEnabled ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-sm text-slate-400">
          El generador con IA no esta configurado. Define{' '}
          <code className="text-slate-600">OPENAI_API_KEY</code> en el backend
          para activarlo.
        </div>
      ) : (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex gap-2">
            <input
              value={peticion}
              onChange={(e) => setPeticion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generar()}
              placeholder="Ej: usuarios por rol, participacion por estado..."
              disabled={generating}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              onClick={() => generar()}
              disabled={generating || !peticion.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              Generar
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {sugerencias.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setPeticion(s);
                  void generar(s);
                }}
                disabled={generating}
                className="text-xs px-3 py-1.5 rounded-lg cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}

      {generating && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-indigo-600">
          <Loader2 size={40} className="animate-spin opacity-40" />
          <p className="text-sm text-slate-400">Generando el reporte...</p>
        </div>
      )}

      {spec && !generating && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-black text-slate-800">
                {spec.titulo}
              </h3>
              <p className="text-sm text-slate-500 mt-1">{spec.insight}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={exportarPdf}
                title="Exportar a PDF"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:opacity-90 cursor-pointer"
              >
                <FileText size={14} />
                PDF
              </button>
              <button
                onClick={exportarExcel}
                title="Exportar a Excel"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:opacity-90 cursor-pointer"
              >
                <FileSpreadsheet size={14} />
                Excel
              </button>
            </div>
          </div>

          <div ref={visualRef} className="p-6 bg-white">
            {spec.tipoVisual === 'bar' && (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {spec.tipoVisual === 'pie' && (
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="valor"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={(e: { name?: string; valor?: number }) =>
                      `${e.name}: ${e.valor}`
                    }
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}

            {spec.tipoVisual === 'line' && (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="#6366f1"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            {spec.tipoVisual === 'table' && spec.tabla && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {spec.tabla.columnas.map((c) => (
                        <th
                          key={c}
                          className="text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spec.tabla.filas.map((fila, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-50 last:border-b-0"
                      >
                        {fila.map((celda, j) => (
                          <td key={j} className="px-4 py-2.5 text-slate-700">
                            {celda}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
