import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Send,
  Bot,
  Loader2,
  BarChart3,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import api from '../../api/axios.config';
import { useAuthStore } from '../../store/auth.store';
import { useElections } from '../../hooks/useElections';

interface NetworkReport {
  generadoEn: string;
  usuarios: { total: number; porRol: Record<string, number> };
  elecciones: { total: number; porEstado: Record<string, number> };
  canales: { nombre: string; descripcion: string | null; activo: boolean }[];
  nodos: { nombre: string; endpoint: string; activo: boolean }[];
  votos: { confirmados: number; pendientes: number; fallidos: number };
}

interface ElectionReport {
  generadoEn: string;
  eleccion: {
    id: string;
    titulo: string;
    estado: string;
    canal: string;
    inicio: string;
    fin: string;
  };
  padron: { total: number; votaron: number; noVotaron: number };
  participacionPct: number;
  resultados:
    | { disponible: false; motivo: string }
    | {
        disponible: true;
        candidatos: { nombre: string; frente: string; votos: number }[];
        blancos: number;
        nulos: number;
      };
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export default function ReportsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const tipo: 'red' | 'eleccion' = isAdmin ? 'red' : 'eleccion';
  const { elections } = useElections();

  const [networkData, setNetworkData] = useState<NetworkReport | null>(null);
  const [electionData, setElectionData] = useState<ElectionReport | null>(null);
  const [selectedElection, setSelectedElection] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Elecciones asignables (no borradores) para el selector del auditor.
  const reportableElections = useMemo(
    () => elections.filter((e) => e.status !== 'BORRADOR'),
    [elections],
  );

  // ¿Está configurado el chat con IA en el backend?
  useEffect(() => {
    api
      .get<{ enabled: boolean }>('/reports/ai-status')
      .then(({ data }) => setAiEnabled(data.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  // Cargar el reporte de red (admin) al entrar.
  useEffect(() => {
    if (tipo !== 'red') return;
    setLoading(true);
    api
      .get<NetworkReport>('/reports/network')
      .then(({ data }) => setNetworkData(data))
      .catch(() => setNetworkData(null))
      .finally(() => setLoading(false));
  }, [tipo]);

  // Preseleccionar la primera elección para el auditor.
  useEffect(() => {
    if (tipo !== 'eleccion') return;
    if (!selectedElection && reportableElections.length > 0) {
      setSelectedElection(reportableElections[0].id);
    }
  }, [tipo, reportableElections, selectedElection]);

  // Cargar el reporte de la elección seleccionada.
  useEffect(() => {
    if (tipo !== 'eleccion' || !selectedElection) return;
    setLoading(true);
    setChat([]);
    api
      .get<ElectionReport>(`/reports/election/${selectedElection}`)
      .then(({ data }) => setElectionData(data))
      .catch(() => setElectionData(null))
      .finally(() => setLoading(false));
  }, [tipo, selectedElection]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setQuestion('');
    const nuevoHistorial = [...chat, { role: 'user' as const, content: q }];
    setChat(nuevoHistorial);
    setAsking(true);
    try {
      const { data } = await api.post<{ respuesta: string }>('/reports/chat', {
        tipo,
        electionId: tipo === 'eleccion' ? selectedElection : undefined,
        pregunta: q,
        historial: chat,
      });
      setChat([
        ...nuevoHistorial,
        { role: 'assistant', content: data.respuesta },
      ]);
    } catch {
      setChat([
        ...nuevoHistorial,
        {
          role: 'assistant',
          content:
            'No se pudo obtener respuesta del asistente. Revisa la configuración del servicio de IA.',
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  // ── Exportar a PDF ────────────────────────────────────────────────────────
  function exportPdf() {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleString('es-BO');

    if (tipo === 'red' && networkData) {
      doc.setFontSize(16);
      doc.text('Reporte de Red — FICCT E-Voting', 14, 18);
      doc.setFontSize(10);
      doc.text(`Generado: ${fecha}`, 14, 25);

      autoTable(doc, {
        startY: 32,
        head: [['Usuarios por rol', 'Cantidad']],
        body: Object.entries(networkData.usuarios.porRol).map(([r, n]) => [
          r,
          String(n),
        ]),
      });
      autoTable(doc, {
        head: [['Elecciones por estado', 'Cantidad']],
        body: Object.entries(networkData.elecciones.porEstado).map(([e, n]) => [
          e,
          String(n),
        ]),
      });
      autoTable(doc, {
        head: [['Nodo', 'Endpoint', 'Estado']],
        body: networkData.nodos.map((n) => [
          n.nombre,
          n.endpoint,
          n.activo ? 'Activo' : 'Inactivo',
        ]),
      });
      autoTable(doc, {
        head: [['Canal', 'Activo']],
        body: networkData.canales.map((c) => [
          c.nombre,
          c.activo ? 'Sí' : 'No',
        ]),
      });
      autoTable(doc, {
        head: [['Votos', 'Cantidad']],
        body: [
          ['Confirmados', String(networkData.votos.confirmados)],
          ['Pendientes', String(networkData.votos.pendientes)],
          ['Fallidos', String(networkData.votos.fallidos)],
        ],
      });
      doc.save('reporte-red.pdf');
    } else if (tipo === 'eleccion' && electionData) {
      const e = electionData;
      doc.setFontSize(16);
      doc.text('Reporte de Elección', 14, 18);
      doc.setFontSize(11);
      doc.text(e.eleccion.titulo, 14, 26);
      doc.setFontSize(10);
      doc.text(`Generado: ${fecha}`, 14, 33);

      autoTable(doc, {
        startY: 40,
        head: [['Dato', 'Valor']],
        body: [
          ['Estado', e.eleccion.estado],
          ['Canal', e.eleccion.canal],
          ['Padrón', String(e.padron.total)],
          ['Votaron', String(e.padron.votaron)],
          ['No votaron', String(e.padron.noVotaron)],
          ['Participación', `${e.participacionPct}%`],
        ],
      });
      if (e.resultados.disponible) {
        autoTable(doc, {
          head: [['Candidato', 'Frente', 'Votos']],
          body: [
            ...e.resultados.candidatos.map((c) => [
              c.nombre,
              c.frente,
              String(c.votos),
            ]),
            ['Votos blancos', '—', String(e.resultados.blancos)],
            ['Votos nulos', '—', String(e.resultados.nulos)],
          ],
        });
      } else {
        autoTable(doc, {
          head: [['Resultados']],
          body: [[e.resultados.motivo]],
        });
      }
      doc.save(`reporte-eleccion-${e.eleccion.titulo}.pdf`);
    }
  }

  // ── Exportar a Excel ──────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new();

    if (tipo === 'red' && networkData) {
      const resumen = [
        ['Reporte de Red — FICCT E-Voting'],
        ['Generado', new Date().toLocaleString('es-BO')],
        [],
        ['Usuarios por rol', 'Cantidad'],
        ...Object.entries(networkData.usuarios.porRol),
        [],
        ['Elecciones por estado', 'Cantidad'],
        ...Object.entries(networkData.elecciones.porEstado),
        [],
        ['Votos', 'Cantidad'],
        ['Confirmados', networkData.votos.confirmados],
        ['Pendientes', networkData.votos.pendientes],
        ['Fallidos', networkData.votos.fallidos],
      ];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(resumen),
        'Resumen',
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(networkData.nodos),
        'Nodos',
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(networkData.canales),
        'Canales',
      );
      XLSX.writeFile(wb, 'reporte-red.xlsx');
    } else if (tipo === 'eleccion' && electionData) {
      const e = electionData;
      const resumen = [
        ['Reporte de Elección'],
        ['Título', e.eleccion.titulo],
        ['Estado', e.eleccion.estado],
        ['Canal', e.eleccion.canal],
        ['Generado', new Date().toLocaleString('es-BO')],
        [],
        ['Padrón', e.padron.total],
        ['Votaron', e.padron.votaron],
        ['No votaron', e.padron.noVotaron],
        ['Participación %', e.participacionPct],
      ];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(resumen),
        'Resumen',
      );
      if (e.resultados.disponible) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(e.resultados.candidatos),
          'Resultados',
        );
      }
      XLSX.writeFile(wb, `reporte-eleccion-${e.eleccion.titulo}.xlsx`);
    }
  }

  const hasData = tipo === 'red' ? !!networkData : !!electionData;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-32">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <BarChart3 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              {isAdmin ? 'Reportes de la Red' : 'Reportes de Elecciones'}
            </h2>
            <p className="text-xs text-slate-400">
              {isAdmin
                ? 'Estado general del sistema: usuarios, elecciones, canales, nodos y votos.'
                : 'Participación y resultados por elección.'}
            </p>
          </div>
        </div>
      </div>

      {/* Selector de elección (solo auditor / elección) */}
      {tipo === 'eleccion' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            Elección
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

      {/* Botones de descarga */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={exportPdf}
          disabled={!hasData || loading}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <FileText size={16} />
          Descargar PDF
        </button>
        <button
          onClick={exportExcel}
          disabled={!hasData || loading}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <FileSpreadsheet size={16} />
          Descargar Excel
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Cargando datos…
          </span>
        )}
      </div>

      {/* Vista previa de los datos */}
      {hasData && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          {tipo === 'red' && networkData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Usuarios" value={networkData.usuarios.total} />
              <Stat label="Elecciones" value={networkData.elecciones.total} />
              <Stat label="Canales" value={networkData.canales.length} />
              <Stat label="Nodos" value={networkData.nodos.length} />
              <Stat
                label="Votos confirmados"
                value={networkData.votos.confirmados}
              />
            </div>
          )}
          {tipo === 'eleccion' && electionData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Padrón" value={electionData.padron.total} />
              <Stat label="Votaron" value={electionData.padron.votaron} />
              <Stat label="No votaron" value={electionData.padron.noVotaron} />
              <Stat
                label="Participación"
                value={`${electionData.participacionPct}%`}
              />
            </div>
          )}
        </div>
      )}

      {/* Chat con IA */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Bot size={18} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-800">
            Asistente de análisis
          </h3>
        </div>

        {!aiEnabled ? (
          <div className="p-8 text-center text-sm text-slate-400">
            El asistente con IA no está configurado. Define{' '}
            <code className="text-slate-600">OPENAI_API_KEY</code> en el backend
            para activarlo. Los reportes descargables funcionan sin esto.
          </div>
        ) : (
          <>
            <div className="p-5 max-h-96 overflow-y-auto flex flex-col gap-3">
              {chat.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  Pregúntale al asistente sobre{' '}
                  {isAdmin ? 'el estado de la red' : 'esta elección'}. Por
                  ejemplo: «¿Cuál es la participación?» o «Resume los datos
                  principales».
                </p>
              )}
              {chat.map((turn, i) => (
                <div
                  key={i}
                  className={`flex ${
                    turn.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      turn.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {turn.content}
                  </div>
                </div>
              ))}
              {asking && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-500 px-4 py-2.5 rounded-2xl text-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Analizando…
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ask()}
                placeholder="Escribe tu pregunta…"
                disabled={asking || !hasData}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
              />
              <button
                onClick={ask}
                disabled={asking || !question.trim() || !hasData}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 text-center">
      <div className="text-2xl font-black text-slate-800">{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">
        {label}
      </div>
    </div>
  );
}
