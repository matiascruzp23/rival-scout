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
  metricGroups,
  rankingEnLiga,
  valorNumerico,
  type MetricGroup,
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

  // Solo para el modo Personalizado, y sobre TODAS las métricas disponibles
  // (no solo las ya elegidas): para avisar en la propia lista, antes de
  // elegir, cuáles dejan al rival entre los 3 mejores o los 3 peores de la
  // liga — no después, una vez ya armado el radar.
  const rankingPorColumna = useMemo(() => {
    const map = new Map<string, RankingLiga>();
    if (!data || modo !== 'personalizado' || !rival.codigoLdp) return map;
    for (const col of metricColumns(data)) {
      const r = rankingEnLiga(data, rival.codigoLdp, col);
      if (r) map.set(col, r);
    }
    return map;
  }, [data, modo, rival.codigoLdp]);

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
            <MetricPicker
              groups={metricGroups(data)}
              seleccionadas={seleccionadas}
              onChange={setSeleccionadas}
              rankingPorColumna={rankingPorColumna}
            />
          )}

          {series.length === 0 ? (
            <p className="text-sm text-slate-400 py-6">
              Todavía no hay ninguna fila para graficar (asigná el código LDP del rival y el código propio arriba).
            </p>
          ) : (
            <section className="card p-4">
              <RadarLegend series={series} />
              <div className="mt-3 max-w-xl mx-auto">
                <RadarChart ejeLabels={ejes.map((e) => e.label)} series={series} maxPorEje={maxPorEje} />
              </div>
            </section>
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

const MAX_PERSONALIZADO = 10;

function MetricPicker({
  groups,
  seleccionadas,
  onChange,
  rankingPorColumna,
}: {
  groups: MetricGroup[];
  seleccionadas: string[];
  onChange: (cols: string[]) => void;
  // Para avisar, en la propia lista, si el rival queda top 3 mejor/peor de
  // la liga en esa métrica — antes de elegirla, no después.
  rankingPorColumna: Map<string, RankingLiga>;
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
        <h4 className="text-sm font-semibold text-slate-700">Elige hasta {MAX_PERSONALIZADO} métricas</h4>
        <span className="text-xs text-slate-400">{seleccionadas.length}/{MAX_PERSONALIZADO} elegidas</span>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.titulo}>
            <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{g.titulo}</h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {g.columnas.map((col) => {
                const ranking = rankingPorColumna.get(col);
                return (
                  <label key={col} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={seleccionadas.includes(col)}
                      disabled={!seleccionadas.includes(col) && seleccionadas.length >= MAX_PERSONALIZADO}
                      onChange={() => toggle(col)}
                    />
                    <span>{col}</span>
                    {ranking?.top3Positivo && (
                      <span
                        className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 shrink-0"
                        title={`Top 3 mejor de la liga: está ${ranking.posicion}° de ${ranking.total}`}
                      >
                        ▲{ranking.posicion}
                      </span>
                    )}
                    {ranking?.top3Negativo && (
                      <span
                        className="text-red-700 bg-red-50 border border-red-200 rounded px-1 shrink-0"
                        title={`Top 3 peor de la liga: está ${ranking.posicion}° de ${ranking.total}`}
                      >
                        ▼{ranking.posicion}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
