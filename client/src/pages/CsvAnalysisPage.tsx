import { useMemo, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import { useIsViewer } from '../lib/authContext';
import {
  analyzeIndividuales,
  analyzePhase,
  construccionSituacionCombos,
  DEFENSIVE_CATEGORIES,
  estructuraCambiaPorEstado,
  matchesWithCsvCount,
  OFFENSIVE_CATEGORIES,
  type ComboCount,
  type ConstruccionSituacionCombo,
  type EstadoResumen,
  type IndividualesBloque,
  type PendienteResolucion,
  type PhaseAnalysis,
  type StructureBar,
  type TagCount,
} from '../lib/csvAnalysis';
import { lastN, topSistemasFormacion } from '../lib/stats';
import { BuildUpShapeDiagram, FormationLinesDiagram, PressingTriggerDiagram } from '../components/TacticalDiagram';
import { situationDiagramFor } from '../components/SituationDiagrams';

const TABS = ['Fase ofensiva', 'Presión rival', 'Espacios y vulnerabilidades', 'Individuales'] as const;
type Tab = (typeof TABS)[number];

const ESTADO_STYLE: Record<EstadoResumen['estado'], { border: string; bg: string; text: string }> = {
  Ganando: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Empatando: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
  Perdiendo: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700' },
};

export default function CsvAnalysisPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const isViewer = useIsViewer();
  const [window, setWindowSize] = useState<3 | 5 | 10>(10);
  const [tab, setTab] = useState<Tab>('Fase ofensiva');
  const matches = useMemo(() => lastN(rival.matches, window), [rival.matches, window]);
  const withCsv = matchesWithCsvCount(matches);
  // Sistema con el que se dibuja el 11 de fondo de los diagramas de
  // circulación, para que se parezca a cómo juega el rival en vez de a un
  // 4-4-2 genérico siempre.
  const sistemaDominante = useMemo(() => topSistemasFormacion(matches)[0]?.item ?? null, [matches]);

  const ofensiva = useMemo(
    () =>
      analyzePhase(matches, OFFENSIVE_CATEGORIES, [
        {
          titulo: 'Circulación media',
          columnas: ['Situaciones de circulacion'],
          categorias: ['CIRCULACION MEDIA'],
          soloRepetidos: true,
        },
        {
          titulo: 'Circulación alta',
          columnas: ['Situaciones de circulacion'],
          categorias: ['CIRCULACION ALTA'],
          soloRepetidos: true,
        },
        { titulo: 'Distancia de salida', columnas: ['Distancia de salida'] },
      ]),
    [matches]
  );
  const construccionSituacion = useMemo(
    () => construccionSituacionCombos(matches, OFFENSIVE_CATEGORIES, ['Situaciones de circulacion']),
    [matches]
  );
  const presionEstructura = useMemo(
    () =>
      analyzePhase(matches, DEFENSIVE_CATEGORIES, [
        { titulo: 'Presión de salida', columnas: ['Tipos de presion en salida'] },
      ]),
    [matches]
  );
  const vulnerabilidades = useMemo(
    () =>
      analyzePhase(matches, DEFENSIVE_CATEGORIES, [
        { titulo: 'Presión alta', columnas: ['Situaciones de presion'], categorias: ['PRESION ALTA'], soloRepetidos: true },
        { titulo: 'Presión media', columnas: ['Situaciones de presion'], categorias: ['PRESION MEDIA'], soloRepetidos: true },
        { titulo: 'Presión baja', columnas: ['Situaciones de presion'], categorias: ['PRESION BAJA'], soloRepetidos: true },
      ]),
    [matches]
  );
  const circulacionesIndividuales = useMemo(
    () => analyzeIndividuales(matches, OFFENSIVE_CATEGORIES, ['Situaciones de circulacion'], 'Comportamientos ofensivos'),
    [matches]
  );
  const presionesIndividuales = useMemo(
    () => analyzeIndividuales(matches, DEFENSIVE_CATEGORIES, ['Situaciones de presion'], 'Comportamientos defensivos'),
    [matches]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Análisis de datos Sportscode</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Patrones y frecuencias a partir de los CSV cargados, con lo que suele cambiar según el resultado parcial.
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-slate-500 mr-1">Ventana:</span>
          {[3, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => setWindowSize(n as 3 | 5 | 10)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                window === n ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              últimos {n}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-3 text-sm text-slate-600">
        {withCsv} de {matches.length} partido{matches.length === 1 ? '' : 's'} en esta ventana tienen CSV cargado.
      </div>

      {withCsv === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No hay datos de Sportscode cargados en esta ventana. Carga un CSV desde el detalle de un partido.
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'Fase ofensiva' && (
            <PhaseView
              data={ofensiva}
              estructuraTitle="Estructura de circulación"
              evolucionTitle="Evolución de la circulación según el resultado"
              estructuraDiagram={(valor) => <BuildUpShapeDiagram valor={valor} />}
              estructuraSituacionCombos={construccionSituacion}
              situacionDiagram={(tag) => situationDiagramFor(tag, sistemaDominante)}
            />
          )}
          {tab === 'Presión rival' && (
            <PhaseView
              data={presionEstructura}
              estructuraTitle="Dibujo táctico en presión"
              evolucionTitle="Evolución de la presión según el resultado"
              estructuraDiagram={(valor) => <FormationLinesDiagram valor={valor} />}
              situacionDiagram={(tag) => <PressingTriggerDiagram tag={tag} />}
            />
          )}
          {tab === 'Espacios y vulnerabilidades' && (
            <PhaseView
              data={vulnerabilidades}
              showEvolucion={false}
              situacionDiagram={(tag) => situationDiagramFor(tag, sistemaDominante)}
            />
          )}
          {tab === 'Individuales' && (
            <IndividualesView
              circulaciones={circulacionesIndividuales}
              presiones={presionesIndividuales}
              canResolve={!isViewer}
              onResolved={reload}
            />
          )}
        </>
      )}
    </div>
  );
}

function PhaseView({
  data,
  estructuraTitle,
  evolucionTitle,
  showEvolucion = true,
  estructuraDiagram,
  estructuraSituacionCombos,
  situacionDiagram,
  situacionDiagramCount = 1,
}: {
  data: PhaseAnalysis;
  estructuraTitle?: string;
  evolucionTitle?: string;
  showEvolucion?: boolean;
  estructuraDiagram?: (valorTop: string) => ReactNode;
  estructuraSituacionCombos?: ConstruccionSituacionCombo[];
  situacionDiagram?: (tag: string) => ReactNode;
  situacionDiagramCount?: number;
}) {
  if (data.totalRegistros === 0) {
    return <p className="text-sm text-slate-400 py-6">Sin registros para esta fase en los CSV cargados.</p>;
  }

  const showEstado = showEvolucion && data.porEstado.length > 0;
  const showEstructura = !!estructuraTitle && data.estructura.length > 0;
  const cardCount = (showEstructura ? 1 : 0) + data.situaciones.length;
  const estructuraDiagramEl = showEstructura && estructuraDiagram ? estructuraDiagram(data.estructura[0].valor) : null;
  // Compartido entre bloques: si un concepto ya se dibujó en uno anterior
  // (p. ej. el mismo tag es el más repetido en presión media Y baja), los
  // bloques siguientes lo saltan y muestran el siguiente más repetido en su
  // lugar, en vez de repetir el mismo dibujo dos veces.
  const usedDiagramTags = new Set<string>();

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 ${cardCount > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
        {showEstructura && (
          <section className="card p-4">
            <h3 className="font-semibold text-slate-800 mb-3">{estructuraTitle}</h3>
            <StructureBarList bars={data.estructura} />
            {estructuraDiagramEl && <div className="mt-3">{estructuraDiagramEl}</div>}
            {estructuraSituacionCombos && estructuraSituacionCombos.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">
                  Combinaciones más frecuentes con situaciones
                </h4>
                <ul className="space-y-1">
                  {estructuraSituacionCombos.map((c) => (
                    <li key={`${c.construccion}+${c.situacion}`} className="flex justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        {c.construccion} + {c.situacion}
                      </span>
                      <span className="badge bg-slate-100 text-slate-600 whitespace-nowrap">
                        {c.count} {c.count === 1 ? 'vez' : 'veces'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {data.situaciones.map((bloque) => {
          // Cada bloque intenta su propio diagrama (p. ej. circulación media
          // Y alta, no solo el primero); bloques de apoyo como "Distancia de
          // salida" simplemente no tienen escena definida y quedan sin dibujo.
          const diagramEls: ReactNode[] = [];
          if (situacionDiagram) {
            for (const t of bloque.tags) {
              if (diagramEls.length >= situacionDiagramCount) break;
              if (usedDiagramTags.has(t.tag)) continue;
              const el = situacionDiagram(t.tag);
              if (!el) continue;
              diagramEls.push(el);
              usedDiagramTags.add(t.tag);
            }
          }
          return (
            <section key={bloque.titulo} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">{bloque.titulo}</h3>
                <span className="text-slate-400 text-sm">{bloque.registros} registros</span>
              </div>
              <TagCardGrid tags={bloque.tags} />
              {diagramEls.length > 0 && (
                <div className={`mt-3 grid gap-3 ${diagramEls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {diagramEls.map((el, i) => (
                    <div key={i}>{el}</div>
                  ))}
                </div>
              )}
              <ComboList combos={bloque.combos.slice(0, 3)} />
            </section>
          );
        })}
      </div>

      {showEstado && (
        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-1">{evolucionTitle}</h3>
          <p className="text-xs text-slate-500 mb-3">
            {estructuraCambiaPorEstado(data.porEstado)
              ? 'El patrón dominante cambia según el resultado parcial.'
              : 'Se detalla por resultado parcial (el patrón dominante no varía demasiado entre estados).'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.porEstado.map((r) => (
              <EstadoCard key={r.estado} data={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Combinaciones más frecuentes de jugador rival + situación (columna
// "Rivales" del CSV, no siempre rellenada), separadas en ofensivo
// (circulaciones) y defensivo (presiones).
function IndividualesView({
  circulaciones,
  presiones,
  canResolve,
  onResolved,
}: {
  circulaciones: IndividualesBloque;
  presiones: IndividualesBloque;
  canResolve: boolean;
  onResolved: () => void;
}) {
  if (circulaciones.registrosConRival === 0 && presiones.registrosConRival === 0) {
    return (
      <p className="text-sm text-slate-400 py-6">
        No hay registros con la columna "Rivales" rellenada en los CSV cargados en esta ventana.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <IndividualesCard data={circulaciones} canResolve={canResolve} onResolved={onResolved} />
      <IndividualesCard data={presiones} canResolve={canResolve} onResolved={onResolved} />
    </div>
  );
}

function IndividualesCard({
  data,
  canResolve,
  onResolved,
}: {
  data: IndividualesBloque;
  canResolve: boolean;
  onResolved: () => void;
}) {
  return (
    <section className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{data.titulo}</h3>

      {data.pendientes.length > 0 && canResolve && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            {data.pendientes.length} registro{data.pendientes.length === 1 ? '' : 's'} marca{data.pendientes.length === 1 ? '' : 'n'} más
            de una situación a la vez para el mismo rival: elegí a cuál corresponde para que cuente.
          </p>
          <ul className="space-y-2">
            {data.pendientes.map((p) => (
              <PendienteRow key={`${p.matchId}-${p.rowIndex}`} pendiente={p} onResolved={onResolved} />
            ))}
          </ul>
        </div>
      )}

      {data.combos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Sin combinaciones: la columna "Rivales" no viene rellena en estos registros.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.combos.map((c) => (
            <li
              key={`${c.rival}+${c.situacion}`}
              className="flex items-center justify-between gap-2 border border-slate-200 rounded-md px-3 py-2"
            >
              <span className="text-sm text-slate-700">
                <span className="font-medium">{c.rival}</span>
                <span className="text-slate-400"> · </span>
                {c.situacion}
              </span>
              <span className="badge bg-slate-100 text-slate-600 whitespace-nowrap">
                {c.count} {c.count === 1 ? 'vez' : 'veces'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PendienteRow({ pendiente, onResolved }: { pendiente: PendienteResolucion; onResolved: () => void }) {
  const [saving, setSaving] = useState(false);
  // 2 rivales + 2 situaciones suele ser en realidad "cada uno hizo una
  // distinta", no que los dos hicieron las dos: se ofrece armar ese pareo
  // además de la opción de una sola situación para ambos.
  const esPareable = pendiente.rivales.length === 2 && pendiente.opciones.length === 2;
  const [par, setPar] = useState<[string, string]>([pendiente.opciones[0], pendiente.opciones[1] ?? pendiente.opciones[0]]);

  const resolver = async (situacion: string) => {
    setSaving(true);
    try {
      await api.matches.resolveRivalSituacion(pendiente.matchId, pendiente.rowIndex, situacion);
      onResolved();
    } finally {
      setSaving(false);
    }
  };

  const resolverPorJugador = async () => {
    setSaving(true);
    try {
      await api.matches.resolveRivalSituacionPorJugador(pendiente.matchId, pendiente.rowIndex, {
        [pendiente.rivales[0]]: par[0],
        [pendiente.rivales[1]]: par[1],
      });
      onResolved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="text-sm space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-700">{pendiente.rival}</span>
        <div className="flex flex-wrap gap-1.5">
          {pendiente.opciones.map((op) => (
            <button
              key={op}
              disabled={saving}
              onClick={() => resolver(op)}
              className="px-2 py-1 text-xs rounded border border-amber-300 bg-white hover:bg-amber-100 text-amber-800 disabled:opacity-50"
            >
              {op} (ambos)
            </button>
          ))}
        </div>
      </div>
      {esPareable && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-xs text-slate-500">O cada uno hizo una distinta:</span>
          <span className="text-xs text-slate-600">{pendiente.rivales[0]}</span>
          <select
            className="input py-0.5 text-xs w-auto"
            value={par[0]}
            onChange={(e) => setPar([e.target.value, par[1]])}
          >
            {pendiente.opciones.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-600">{pendiente.rivales[1]}</span>
          <select
            className="input py-0.5 text-xs w-auto"
            value={par[1]}
            onChange={(e) => setPar([par[0], e.target.value])}
          >
            {pendiente.opciones.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <button
            disabled={saving}
            onClick={resolverPorJugador}
            className="px-2 py-1 text-xs rounded border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-800 disabled:opacity-50"
          >
            Confirmar pareo
          </button>
        </div>
      )}
    </li>
  );
}

function StructureBarList({ bars }: { bars: StructureBar[] }) {
  const max = bars[0]?.count || 1;
  return (
    <div className="space-y-2.5">
      {bars.map((b) => (
        <div key={b.valor}>
          <div className="flex justify-between text-sm mb-0.5">
            <span className="text-slate-700">{b.valor}</span>
            <span className="text-slate-400">
              {b.count} ({b.pct}%)
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${(b.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TagCardGrid({ tags }: { tags: TagCount[] }) {
  if (tags.length === 0) return <p className="text-sm text-slate-400">Sin registros.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {tags.map((t) => (
        <div key={t.tag} className="border border-slate-200 rounded-md px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800">{t.tag}</span>
            <span className="badge bg-slate-100 text-slate-600 whitespace-nowrap">
              {t.count} {t.count === 1 ? 'vez' : 'veces'}
            </span>
          </div>
          {t.descripcion && <p className="text-xs text-slate-500 mt-1">{t.descripcion}</p>}
        </div>
      ))}
    </div>
  );
}

function ComboList({ combos }: { combos: ComboCount[] }) {
  if (combos.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Combinaciones más frecuentes</h4>
      <ul className="space-y-1">
        {combos.map((c) => (
          <li key={c.tags.join('+')} className="flex justify-between text-sm">
            <span className="text-slate-700">{c.tags.join(' + ')}</span>
            <span className="badge bg-slate-100 text-slate-600 whitespace-nowrap">
              {c.count} {c.count === 1 ? 'vez' : 'veces'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EstadoCard({ data }: { data: EstadoResumen }) {
  const style = ESTADO_STYLE[data.estado];
  return (
    <div className={`border rounded-md p-3 ${style.border} ${style.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-semibold ${style.text}`}>{data.estado}</span>
        <span className="text-xs text-slate-500">{data.total} registros</span>
      </div>
      {data.estructuraTop && (
        <p className="text-sm text-slate-700 mb-1">
          Predomina <span className="font-medium">{data.estructuraTop.valor}</span> ({data.estructuraTop.pct}%)
        </p>
      )}
      {data.situacionesTop.length > 0 && (
        <p className="text-xs text-slate-600">
          Más frecuente: {data.situacionesTop.map((s) => `${s.tag} (${s.pct}%)`).join(', ')}
        </p>
      )}
      {!data.estructuraTop && data.situacionesTop.length === 0 && (
        <p className="text-xs text-slate-400">Sin patrón destacado.</p>
      )}
    </div>
  );
}
