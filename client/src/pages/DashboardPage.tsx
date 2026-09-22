import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import {
  balancePorSistema,
  cambiosTacticos,
  checkReglaTorneo,
  computeAllPlayerStats,
  computePlayerEventStats,
  estimateNextXI,
  findReglaTorneo,
  formatPct,
  golesAgregados,
  lastN,
  positionRotation,
  recordGEP,
  recordGEPPorCondicion,
  sortMatchesDesc,
  topCombosSaleEntra,
} from '../lib/stats';
import { playerMap, playerName } from '../lib/lookup';
import { PlayerBadges } from '../components/PlayerBadges';
import { SquadDepthPitch, labelsForSquadDepth } from '../components/SquadDepthPitch';
import { PlantelView } from '../components/PlantelView';
import { Pitch, type PitchToken } from '../components/Pitch';
import { defaultCoordsFor, symmetrizeBackThree, symmetrizeDoublePivote, symmetrizeForwardPair } from '../lib/positions';
import { TorneoReglasEditor } from '../components/TorneoReglasEditor';
import { ReglaTorneoBanner } from '../components/ReglaTorneoBanner';
import type { TorneoRegla } from '../types';
import { api } from '../api';
import { useIsViewer } from '../lib/authContext';

export default function DashboardPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const players = playerMap(rival.players);
  const isViewer = useIsViewer();
  const matches = useMemo(() => lastN(rival.matches, 10), [rival.matches]);
  const allMatches = useMemo(() => sortMatchesDesc(rival.matches), [rival.matches]);

  const stats = useMemo(() => computeAllPlayerStats(rival.players, matches), [rival.players, matches]);
  const topMinutos = [...stats].sort((a, b) => b.minutosJugados - a.minutosJugados).slice(0, 6);
  const topTitular = [...stats].sort((a, b) => b.titularidades - a.titularidades).slice(0, 6);

  const eventStats = useMemo(
    () => rival.players.map((player) => ({ player, events: computePlayerEventStats(player.id, matches) })),
    [rival.players, matches]
  );
  const topGoleadores = eventStats.filter((s) => s.events.goles > 0).sort((a, b) => b.events.goles - a.events.goles).slice(0, 6);
  const jugadoresConTarjetas = eventStats
    .filter((s) => s.events.amarillas > 0 || s.events.rojas > 0)
    .sort((a, b) => b.events.rojas - a.events.rojas || b.events.amarillas - a.events.amarillas)
    .slice(0, 6);

  const gep = useMemo(() => recordGEP(matches), [matches]);
  const goles = useMemo(() => golesAgregados(matches), [matches]);
  const gepPorCondicion = useMemo(() => recordGEPPorCondicion(matches), [matches]);
  const sistemas = useMemo(() => balancePorSistema(matches), [matches]);
  const reglaAplicable = useMemo(
    () => findReglaTorneo(rival.reglasTorneo, rival.proximoPartido?.competicion),
    [rival.reglasTorneo, rival.proximoPartido]
  );
  const xiEstimate = useMemo(
    () => estimateNextXI(rival.players, rival.matches, reglaAplicable),
    [rival.players, rival.matches, reglaAplicable]
  );
  const xiPitchTokens: PitchToken[] = useMemo(() => {
    const tokens: PitchToken[] = [];
    for (const pick of xiEstimate.picks) {
      const { x, y } = defaultCoordsFor(pick.posicion, tokens);
      tokens.push({ key: pick.player.id, x, y, posicion: pick.posicion, player: pick.player });
    }
    symmetrizeForwardPair(tokens);
    symmetrizeDoublePivote(tokens);
    symmetrizeBackThree(tokens);
    return tokens;
  }, [xiEstimate]);
  const reglaCheck = useMemo(
    () => checkReglaTorneo(xiEstimate.picks, reglaAplicable, rival.players),
    [xiEstimate, reglaAplicable, rival.players]
  );

  const [reglasDraft, setReglasDraft] = useState<TorneoRegla[]>(rival.reglasTorneo || []);
  const [savingReglas, setSavingReglas] = useState(false);
  useEffect(() => setReglasDraft(rival.reglasTorneo || []), [rival.reglasTorneo]);
  const saveReglas = async () => {
    setSavingReglas(true);
    try {
      await api.rivals.update(rival.id, { reglasTorneo: reglasDraft });
      reload();
    } finally {
      setSavingReglas(false);
    }
  };

  const rotation = useMemo(() => positionRotation(matches), [matches]);
  const squadDepthLabels = useMemo(() => labelsForSquadDepth(rival.sistemaPrincipal), [rival.sistemaPrincipal]);
  const combos = useMemo(() => topCombosSaleEntra(matches), [matches]);
  const tacticos = useMemo(() => cambiosTacticos(matches), [matches]);

  const sub21 = rival.players.filter((p) => p.sub21);
  const sub18 = rival.players.filter((p) => p.sub18);
  const extranjeros = rival.players.filter((p) => p.extranjero);
  const bajas = rival.players.filter((p) => p.baja);
  const dudas = rival.players.filter((p) => p.duda);

  const matchesWithCsv = matches.filter((m) => m.csv);
  const totalCsvRows = matchesWithCsv.reduce((s, m) => s + (m.csv?.rows.length || 0), 0);
  const allCategories = new Set<string>();
  matchesWithCsv.forEach((m) => {
    const catCol = m.csv!.columns.find((c) => c.toLowerCase() === 'row');
    if (catCol) m.csv!.rows.forEach((r) => r[catCol] && allCategories.add(r[catCol]));
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Partidos analizados" value={matches.length} />
        <StatCard label="Jugadores en plantilla" value={rival.players.length} />
        <StatCard label="Partidos con CSV" value={`${matchesWithCsv.length}/${matches.length}`} />
        <StatCard label="Jugadores de baja" value={bajas.length} accent={bajas.length > 0 ? 'text-red-600' : undefined} />
        <StatCard label="Récord (G-E-P)" value={`${gep.ganados}-${gep.empatados}-${gep.perdidos}`} />
        <StatCard
          label="Rendimiento"
          value={gep.rendimiento !== null ? `${gep.rendimiento}%` : '—'}
          accent={gep.rendimiento !== null ? (gep.rendimiento >= 50 ? 'text-emerald-600' : 'text-red-600') : undefined}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Goles (GF/GC)" value={`${goles.favor} / ${goles.contra}`} />
        <StatCard
          label="Diferencia de gol"
          value={goles.diferencia > 0 ? `+${goles.diferencia}` : goles.diferencia}
          accent={goles.diferencia > 0 ? 'text-emerald-600' : goles.diferencia < 0 ? 'text-red-600' : undefined}
        />
        <StatCard
          label="Como local"
          value={
            gepPorCondicion.Local.jugados > 0
              ? `${gepPorCondicion.Local.ganados}-${gepPorCondicion.Local.empatados}-${gepPorCondicion.Local.perdidos}`
              : '—'
          }
        />
        <StatCard
          label="Como visitante"
          value={
            gepPorCondicion.Visitante.jugados > 0
              ? `${gepPorCondicion.Visitante.ganados}-${gepPorCondicion.Visitante.empatados}-${gepPorCondicion.Visitante.perdidos}`
              : '—'
          }
        />
      </div>

      <PlantelView
        players={rival.players}
        editable={!isViewer}
        onChanged={reload}
        sistemaPrincipal={rival.sistemaPrincipal || ''}
        sistemaAlternativo={rival.sistemaAlternativo || ''}
        onSaveSistemas={
          isViewer
            ? undefined
            : async (data) => {
                await api.rivals.update(rival.id, data);
                reload();
              }
        }
      />

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Últimos {matches.length} resultados</h3>
          <Link to={`/rivales/${rival.id}/partidos`} className="text-xs text-emerald-700 hover:underline">
            Ver partidos →
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Oponente</th>
              <th>Cond.</th>
              <th>Resultado</th>
              <th>Sistema</th>
            </tr>
          </thead>
          <tbody>
            {allMatches.slice(0, 10).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{m.fecha}</td>
                <td>{m.oponente || '—'}</td>
                <td>{m.condicion}</td>
                <td>
                  {m.golesFavor ?? '-'} - {m.golesContra ?? '-'}
                </td>
                <td>
                  {m.sistema || '—'}
                  {m.sistemaOponente ? ` vs ${m.sistemaOponente}` : ''}
                </td>
              </tr>
            ))}
            {allMatches.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-6">
                  Aún no hay partidos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Reglas por torneo</h3>
        <TorneoReglasEditor reglas={reglasDraft} onChange={setReglasDraft} readOnly={isViewer} />
        {!isViewer && (
          <div className="flex justify-end mt-3">
            <button className="btn-primary" disabled={savingReglas} onClick={saveReglas}>
              Guardar reglas
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Formación / sistema más utilizado</h3>
          {sistemas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos.</p>
          ) : (
            <ul className="space-y-1.5">
              {sistemas.slice(0, 5).map((s, i) => (
                <li key={i} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                  <span>{s.item}</span>
                  <span className="text-slate-400">
                    {s.count} partidos · {s.ganados}-{s.empatados}-{s.perdidos}
                    {s.rendimiento !== null ? ` (${s.rendimiento}%)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-800">XI estimado para el próximo partido</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Según minutos jugados (los partidos más recientes pesan más) y posición habitual; excluye a los jugadores
            marcados como baja.
          </p>
          {xiEstimate.picks.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay suficientes datos de XI para estimarlo.</p>
          ) : (
            <>
              <Pitch tokens={xiPitchTokens} height={260} />
              <div className="grid grid-cols-2 gap-x-4 text-sm mt-3">
                {xiEstimate.picks.map((pick) => (
                  <div key={pick.player.id} className="flex justify-between border-b border-slate-100 py-0.5">
                    <span>
                      {pick.player.nombre}
                      {pick.reemplazadoPorRegla && (
                        <span className="text-slate-400 italic"> (en vez de {pick.reemplazadoPorRegla.nombre})</span>
                      )}
                    </span>
                    <span className="text-slate-400 text-xs">{pick.posicion}</span>
                  </div>
                ))}
              </div>
              {xiEstimate.sinCobertura.length > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  Sin candidato disponible en: {xiEstimate.sinCobertura.join(', ')}.
                </p>
              )}
              {xiEstimate.excluidos.length > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  Excluidos por estar de baja, en selección o no citados al último partido:{' '}
                  {xiEstimate.excluidos.map((p) => p.nombre).join(', ')}.
                </p>
              )}
              <ReglaTorneoBanner check={reglaCheck} />
            </>
          )}
          <Link to={`/rivales/${rival.id}/xi-rotaciones`} className="text-xs text-emerald-700 hover:underline mt-3 inline-block">
            Ver XI y rotaciones →
          </Link>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Jugadores con más minutos</h3>
          <ul className="space-y-1.5">
            {topMinutos.map((s) => (
              <li key={s.player.id} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                <span>
                  {s.player.nombre} <PlayerBadges player={s.player} />
                </span>
                <span className="text-slate-400">{Math.round(s.minutosJugados)}' · {formatPct(s.porcentajeMinutos)}</span>
              </li>
            ))}
            {topMinutos.length === 0 && <p className="text-sm text-slate-400">Sin datos.</p>}
          </ul>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Jugadores con más titularidades</h3>
          <ul className="space-y-1.5">
            {topTitular.map((s) => (
              <li key={s.player.id} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                <span>
                  {s.player.nombre} <PlayerBadges player={s.player} />
                </span>
                <span className="text-slate-400">{s.titularidades} titularidades</span>
              </li>
            ))}
            {topTitular.length === 0 && <p className="text-sm text-slate-400">Sin datos.</p>}
          </ul>
        </section>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Rotación real en cancha (últimos {matches.length} partidos)</h3>
        {rotation.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos de XI todavía.</p>
        ) : (
          <>
            <SquadDepthPitch rotation={rotation} players={rival.players} sistema={rival.sistemaPrincipal} />
            <p className="text-xs text-slate-400 mt-2">
              A diferencia del plantel de arriba (que muestra a todos los jugadores por posición asignada), esto
              refleja solo a quienes efectivamente jugaron ahí: el número indica cuántos jugadores distintos ocuparon
              cada posición y, debajo, quien más veces lo hizo.
            </p>
            {rotation.some((r) => !squadDepthLabels.includes(r.posicion)) && (
              <div className="mt-3 flex flex-wrap gap-3">
                {rotation
                  .filter((r) => !squadDepthLabels.includes(r.posicion))
                  .map((r) => (
                    <div key={r.posicion} className="border border-slate-200 rounded-md px-3 py-2 text-sm">
                      <div className="font-medium">{r.posicion} (posición personalizada)</div>
                      <div className="text-xs text-slate-500">{r.jugadoresDistintos} jugadores distintos</div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <PlayerTag title="Jugadores Sub-21" players={sub21} color="sky" />
        <PlayerTag title="Jugadores Sub-18" players={sub18} color="violet" />
        <PlayerTag title="Jugadores extranjeros" players={extranjeros} color="amber" />
        <PlayerTag title="Jugadores en duda" players={dudas} color="purple" />
        <PlayerTag title="Jugadores de baja" players={bajas} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Sustituciones más frecuentes</h3>
            <Link to={`/rivales/${rival.id}/sustituciones`} className="text-xs text-emerald-700 hover:underline">
              Ver detalle →
            </Link>
          </div>
          {combos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin sustituciones registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {combos.slice(0, 5).map((c, i) => (
                <li key={i} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                  <span>
                    {playerName(players, c.item.jugadorSaleId)} → {playerName(players, c.item.jugadorEntraId)}
                  </span>
                  <span className="text-slate-400">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Cambios tácticos registrados</h3>
          <p className="text-sm text-slate-600 mb-2">
            {tacticos.length} {tacticos.length === 1 ? 'sustitución' : 'sustituciones'} con cambio táctico en los últimos{' '}
            {matches.length}{' '}
            partidos.
          </p>
          <ul className="text-sm space-y-1">
            {tacticos.slice(0, 5).map(({ match, sub }) => (
              <li key={sub.id} className="text-slate-600">
                <span className="text-slate-400">{match.fecha}:</span> {playerName(players, sub.jugadorSaleId)} →{' '}
                {playerName(players, sub.jugadorEntraId)} {sub.sistemaResultante ? `(${sub.sistemaResultante})` : ''}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Máximos goleadores</h3>
          {topGoleadores.length === 0 ? (
            <p className="text-sm text-slate-400">Sin goles registrados.</p>
          ) : (
            <ul className="space-y-1.5">
              {topGoleadores.map((s) => (
                <li key={s.player.id} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                  <span>{s.player.nombre}</span>
                  <span className="text-slate-400">
                    {s.events.goles} gol{s.events.goles === 1 ? '' : 'es'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Tarjetas</h3>
          {jugadoresConTarjetas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin tarjetas registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {jugadoresConTarjetas.map((s) => (
                <li key={s.player.id} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                  <span>{s.player.nombre}</span>
                  <span className="text-slate-400">
                    {s.events.amarillas > 0 && <span className="text-amber-600 font-medium">{s.events.amarillas} TA</span>}
                    {s.events.amarillas > 0 && s.events.rojas > 0 && ' · '}
                    {s.events.rojas > 0 && <span className="text-red-600 font-medium">{s.events.rojas} TR</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Resumen de datos Sportscode</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-400 text-xs">Partidos con CSV importado</div>
            <div className="font-medium">{matchesWithCsv.length} de {matches.length}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs">Total de registros importados</div>
            <div className="font-medium">{totalCsvRows}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs">Categorías presentes</div>
            <div className="font-medium">{allCategories.size > 0 ? Array.from(allCategories).join(', ') : '—'}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${accent || 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function PlayerTag({
  title,
  players,
  color,
}: {
  title: string;
  players: { id: string; nombre: string; posicion: string }[];
  color: 'sky' | 'violet' | 'amber' | 'purple' | 'red';
}) {
  const colors = {
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    red: 'bg-red-100 text-red-700',
  } as const;
  return (
    <section className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <span key={p.id} className={`badge ${colors[color]} px-2 py-1`}>
            {p.nombre}
          </span>
        ))}
        {players.length === 0 && <p className="text-sm text-slate-400">Ninguno.</p>}
      </div>
    </section>
  );
}
