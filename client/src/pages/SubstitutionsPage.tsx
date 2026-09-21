import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import {
  allSubstitutions,
  cambiosTacticos,
  lastN,
  minutoPromedioCambiosTacticos,
  minutoPromedioPorEstado,
  minutoPromedioSustituciones,
  sortMatchesDesc,
  substitutionCountsByState,
  sustitucionesPorTramo,
  topCombosByState,
  topCombosConCambioTactico,
  topCombosSaleEntra,
  topEntrantesConMinuto,
  topSalientesConMinuto,
  topSistemasResultantes,
  type GameState,
} from '../lib/stats';
import { playerMap, playerName } from '../lib/lookup';

export default function SubstitutionsPage() {
  const { rival } = useOutletContext<RivalContext>();
  const [window, setWindowSize] = useState<3 | 5 | 10>(10);
  const players = playerMap(rival.players);
  const matches = useMemo(() => lastN(rival.matches, window), [rival.matches, window]);

  const entrantes = useMemo(() => topEntrantesConMinuto(matches), [matches]);
  const salientes = useMemo(() => topSalientesConMinuto(matches), [matches]);
  const combos = useMemo(() => topCombosSaleEntra(matches), [matches]);
  const minutoProm = useMemo(() => minutoPromedioSustituciones(matches), [matches]);
  const tacticos = useMemo(() => cambiosTacticos(matches), [matches]);
  const sistemas = useMemo(() => topSistemasResultantes(matches), [matches]);
  const minutoTactico = useMemo(() => minutoPromedioCambiosTacticos(matches), [matches]);
  const combosTacticos = useMemo(() => topCombosConCambioTactico(matches), [matches]);
  const totalSubs = useMemo(() => allSubstitutions(matches).length, [matches]);
  const tramos = useMemo(() => sustitucionesPorTramo(matches), [matches]);
  const estadoCounts = useMemo(() => substitutionCountsByState(matches), [matches]);
  const allMatches = useMemo(() => sortMatchesDesc(rival.matches), [rival.matches]);
  const estados: GameState[] = ['Ganando', 'Empatando', 'Perdiendo'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Sustituciones consolidadas</h2>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Sustituciones totales" value={totalSubs} />
        <StatCard label="Minuto promedio" value={minutoProm ? `${minutoProm.toFixed(0)}'` : '—'} />
        <StatCard label="Con cambio táctico" value={tacticos.length} />
        <StatCard label="Minuto prom. cambio táctico" value={minutoTactico ? `${minutoTactico.toFixed(0)}'` : '—'} />
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-1">Sustituciones por tramo del partido</h3>
        <p className="text-xs text-slate-500 mb-3">En qué momento del partido suele hacer los cambios.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tramos.map((t) => (
            <StatCard key={t.tramo} label={`Cambios ${t.tramo}'`} value={t.count} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankedList
          title="Jugadores que más ingresan"
          rows={entrantes
            .slice(0, 8)
            .map((c) => ({ label: `${playerName(players, c.item)} (min ~${c.minutoPromedio.toFixed(0)}')`, count: c.count }))}
        />
        <RankedList
          title="Jugadores que más salen"
          rows={salientes
            .slice(0, 8)
            .map((c) => ({ label: `${playerName(players, c.item)} (min ~${c.minutoPromedio.toFixed(0)}')`, count: c.count }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankedList
          title='Combinaciones "sale → entra" más frecuentes'
          rows={combos
            .slice(0, 8)
            .map((c) => ({ label: `${playerName(players, c.item.jugadorSaleId)} → ${playerName(players, c.item.jugadorEntraId)}`, count: c.count }))}
        />
        <RankedList
          title="Sistemas / cambios tácticos más frecuentes"
          rows={sistemas.slice(0, 8).map((c) => ({ label: c.item, count: c.count }))}
          empty="No hay cambios tácticos con sistema o descripción registrados."
        />
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Sustituciones según resultado parcial</h3>
        <p className="text-xs text-slate-500 mb-3">
          Resultado del rival en el minuto exacto de cada sustitución (según los goles registrados hasta ese minuto),
          para ver qué suele hacer cuando va ganando, empatando o perdiendo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {estados.map((estado) => {
            const count = estadoCounts[estado];
            const minuto = minutoPromedioPorEstado(matches, estado);
            const topCombos = topCombosByState(matches, estado).slice(0, 4);
            return (
              <div key={estado} className="border border-slate-200 rounded-md p-3">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-semibold text-slate-700">{estado}</span>
                  <span className="text-lg font-bold text-slate-900">{count}</span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{minuto ? `Minuto prom. ${minuto.toFixed(0)}'` : 'Sin datos'}</p>
                {topCombos.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin sustituciones en este estado.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {topCombos.map((c, i) => (
                      <li key={i} className="flex justify-between border-b border-slate-100 pb-1">
                        <span>
                          {playerName(players, c.item.jugadorSaleId)} → {playerName(players, c.item.jugadorEntraId)}
                        </span>
                        <span className="text-slate-400">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Sustituciones que más veces generaron un cambio táctico</h3>
        {combosTacticos.length === 0 ? (
          <p className="text-sm text-slate-400">No hay sustituciones marcadas con cambio táctico en esta ventana.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sale</th>
                <th>Entra</th>
                <th>Veces</th>
              </tr>
            </thead>
            <tbody>
              {combosTacticos.slice(0, 10).map((c, i) => (
                <tr key={i}>
                  <td>{playerName(players, c.item.jugadorSaleId)}</td>
                  <td>{playerName(players, c.item.jugadorEntraId)}</td>
                  <td>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Cambios tácticos partido por partido</h3>
        <div className="space-y-3">
          {allMatches.map((m) => {
            const tac = m.substitutions.filter((s) => !!s.sistemaResultante);
            if (tac.length === 0) return null;
            return (
              <div key={m.id} className="border border-slate-100 rounded-md p-3">
                <div className="text-xs text-slate-500 mb-2">
                  {m.fecha} · vs {m.oponente || '—'}
                </div>
                <ul className="text-sm space-y-1">
                  {tac.map((s) => (
                    <li key={s.id}>
                      <span className="text-slate-400">{s.minuto}'</span> {playerName(players, s.jugadorSaleId)} →{' '}
                      {playerName(players, s.jugadorEntraId)}
                      {s.sistemaResultante && <span className="text-slate-500"> · {s.sistemaResultante}</span>}
                      {s.descripcion && <span className="text-slate-500 italic"> — {s.descripcion}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {allMatches.every((m) => m.substitutions.every((s) => !s.sistemaResultante)) && (
            <p className="text-sm text-slate-400">No hay cambios tácticos registrados todavía.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function RankedList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; count: number }[];
  empty?: string;
}) {
  return (
    <section className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{empty || 'Sin datos en esta ventana.'}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
              <span>{r.label}</span>
              <span className="text-slate-400">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
