import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { LeagueStatsImport } from '../types';
import { useIsViewer } from '../lib/authContext';
import { RadarChart, RadarLegend } from '../components/RadarChart';
import {
  CODIGO_PROMEDIO,
  RADAR_PRESETS,
  findRow,
  ligaMax,
  metricColumns,
  rankingEnLiga,
  valorNumerico,
  type RankingLiga,
} from '../lib/leagueStats';

const COLOR_RIVAL = '#f97316';
const COLOR_PROPIO = '#1e3a8a';
const COLOR_PROMEDIO = '#eab308';

type Modo = (typeof RADAR_PRESETS)[number]['key'] | 'personalizado';

export default function GraficosPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const isViewer = useIsViewer();
  const [data, setData] = useState<LeagueStatsImport | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<Modo>(RADAR_PRESETS[0].key);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  const load = () => {
    api.leagueStats.get().then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const rivalRow = data ? findRow(data, rival.codigoLdp || '') : null;
  const propioRow = data?.codigoPropio ? findRow(data, data.codigoPropio) : null;
  const promedioRow = data ? findRow(data, CODIGO_PROMEDIO) : null;

  const ejes = useMemo(() => {
    if (modo === 'personalizado') return seleccionadas.map((c) => ({ columna: c, label: c }));
    return RADAR_PRESETS.find((p) => p.key === modo)?.ejes || [];
  }, [modo, seleccionadas]);

  const series = useMemo(() => {
    if (!data) return [];
    const out: { label: string; color: string; valores: number[] }[] = [];
    if (rivalRow) out.push({ label: rival.nombre, color: COLOR_RIVAL, valores: ejes.map((e) => valorNumerico(rivalRow, e.columna)) });
    if (propioRow) out.push({ label: 'Propio', color: COLOR_PROPIO, valores: ejes.map((e) => valorNumerico(propioRow, e.columna)) });
    if (promedioRow) out.push({ label: 'Promedio', color: COLOR_PROMEDIO, valores: ejes.map((e) => valorNumerico(promedioRow, e.columna)) });
    return out;
  }, [data, rivalRow, propioRow, promedioRow, ejes, rival.nombre]);

  const maxPorEje = useMemo(() => {
    if (!data) return [];
    return ejes.map((e) => ligaMax(data, e.columna));
  }, [data, ejes]);

  // Solo para el modo Personalizado: entre las métricas elegidas, cuáles
  // dejan al rival entre los 3 mejores o los 3 peores de la liga, para
  // destacarlo aparte del radar (que muestra el valor pero no dónde queda
  // parado dentro de toda la liga).
  const destacados = useMemo(() => {
    if (!data || modo !== 'personalizado' || !rival.codigoLdp) return [];
    return ejes
      .map((e) => ({ eje: e, ranking: rankingEnLiga(data, rival.codigoLdp!, e.columna) }))
      .filter((d): d is { eje: (typeof ejes)[number]; ranking: RankingLiga } => !!d.ranking && (d.ranking.top3Positivo || d.ranking.top3Negativo));
  }, [data, modo, ejes, rival.codigoLdp]);

  if (data === undefined) return <p className="text-sm text-slate-400 py-6">Cargando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Gráficos y estadísticas</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Comparación de {rival.nombre} contra el equipo propio y el promedio de la liga, a partir de una planilla
          importada (dato compartido entre todos los rivales).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ImportCard data={data} isViewer={isViewer} onImported={load} />

      {data && (
        <>
          {!rival.codigoLdp && (
            <CodigoRivalCard rivalId={rival.id} isViewer={isViewer} onSaved={reload} />
          )}

          {rival.codigoLdp && !rivalRow && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              No se encontró "{rival.codigoLdp}" en la planilla importada. Revisá que el código coincida con la
              columna "{data.columns[0]}" de la planilla.
            </p>
          )}

          <div className="flex items-center gap-1 text-sm flex-wrap">
            {RADAR_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setModo(p.key)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                  modo === p.key ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
                }`}
              >
                {p.titulo}
              </button>
            ))}
            <button
              onClick={() => setModo('personalizado')}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                modo === 'personalizado' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              Personalizado
            </button>
          </div>

          {modo === 'personalizado' && (
            <MetricPicker columns={metricColumns(data)} seleccionadas={seleccionadas} onChange={setSeleccionadas} />
          )}

          {series.length === 0 ? (
            <p className="text-sm text-slate-400 py-6">
              Todavía no hay ninguna fila para graficar (asigná el código LDP del rival y el código propio arriba).
            </p>
          ) : (
            <>
              {modo === 'personalizado' && destacados.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {destacados.map(({ eje, ranking }) => (
                    <DestacadoCard key={eje.columna} rivalNombre={rival.nombre} label={eje.label} ranking={ranking} />
                  ))}
                </div>
              )}
              <section className="card p-4">
                <RadarLegend series={series} />
                <div className="mt-3 max-w-xl mx-auto">
                  <RadarChart ejeLabels={ejes.map((e) => e.label)} series={series} maxPorEje={maxPorEje} />
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ImportCard({
  data,
  isViewer,
  onImported,
}: {
  data: LeagueStatsImport | null;
  isViewer: boolean;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [codigoPropio, setCodigoPropio] = useState(data?.codigoPropio || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCodigoPropio(data?.codigoPropio || '');
  }, [data?.codigoPropio]);

  if (isViewer && !data) {
    return <p className="text-sm text-slate-400">Todavía no se importó ninguna planilla de estadísticas de liga.</p>;
  }

  const doImport = async () => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      await api.leagueStats.import(file, codigoPropio.trim() || undefined);
      setFile(null);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveCodigoPropio = async () => {
    setSaving(true);
    setError('');
    try {
      await api.leagueStats.setCodigoPropio(codigoPropio.trim());
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-800">Planilla de la liga</h3>
        {data && (
          <span className="text-xs text-slate-400">
            {data.fileName} · {data.rows.length} filas · subida el {new Date(data.uploadedAt).toLocaleDateString('es-CL')}
          </span>
        )}
      </div>
      {!isViewer && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Archivo (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              className="input"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <label className="label">Código propio (ej. UCH)</label>
            <input
              className="input"
              style={{ width: 140 }}
              value={codigoPropio}
              onChange={(e) => setCodigoPropio(e.target.value)}
              placeholder="UCH"
            />
          </div>
          <button className="btn-primary" disabled={!file || saving} onClick={doImport}>
            {data ? 'Reemplazar planilla' : 'Importar planilla'}
          </button>
          {data && (
            <button className="btn-secondary" disabled={saving} onClick={saveCodigoPropio}>
              Guardar código propio
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </section>
  );
}

function CodigoRivalCard({ rivalId, isViewer, onSaved }: { rivalId: string; isViewer: boolean; onSaved: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (isViewer) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Este rival todavía no tiene código LDP asignado.
      </p>
    );
  }

  const save = async () => {
    if (!codigo.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.rivals.update(rivalId, { codigoLdp: codigo.trim() });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-end gap-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <div>
        <label className="label">Este rival no tiene código LDP asignado — ¿cuál es en la planilla?</label>
        <input
          className="input"
          style={{ width: 140 }}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="ej. EVE"
        />
      </div>
      <button className="btn-primary" disabled={!codigo.trim() || saving} onClick={save}>
        Guardar
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function DestacadoCard({
  rivalNombre,
  label,
  ranking,
}: {
  rivalNombre: string;
  label: string;
  ranking: RankingLiga;
}) {
  const positivo = ranking.top3Positivo;
  return (
    <div
      className={`border rounded-md px-3 py-2 text-sm ${
        positivo ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      <span className="font-semibold">{positivo ? '▲ Top 3 mejor de la liga' : '▼ Top 3 peor de la liga'}</span> en{' '}
      {label}: {rivalNombre} está {ranking.posicion}° de {ranking.total}
      {ranking.mejorEsMayor ? '' : ' (menos es mejor en esta métrica)'}.
    </div>
  );
}

const MAX_PERSONALIZADO = 10;

function MetricPicker({
  columns,
  seleccionadas,
  onChange,
}: {
  columns: string[];
  seleccionadas: string[];
  onChange: (cols: string[]) => void;
}) {
  const toggle = (col: string) => {
    if (seleccionadas.includes(col)) {
      onChange(seleccionadas.filter((c) => c !== col));
    } else if (seleccionadas.length < MAX_PERSONALIZADO) {
      onChange([...seleccionadas, col]);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">Elegí hasta {MAX_PERSONALIZADO} métricas</h4>
        <span className="text-xs text-slate-400">{seleccionadas.length}/{MAX_PERSONALIZADO} elegidas</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto">
        {columns.map((col) => (
          <label key={col} className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={seleccionadas.includes(col)}
              disabled={!seleccionadas.includes(col) && seleccionadas.length >= MAX_PERSONALIZADO}
              onChange={() => toggle(col)}
            />
            {col}
          </label>
        ))}
      </div>
    </section>
  );
}
