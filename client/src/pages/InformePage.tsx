import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { LeagueStatsImport, ProximoPartido } from '../types';
import { RadarChart, RadarLegend } from '../components/RadarChart';
import {
  CODIGO_PROMEDIO,
  RADAR_PRESETS,
  escalasPorEje,
  findRow,
  valoresPorEje,
  type RadarAxis,
  type RadarPreset,
} from '../lib/leagueStats';
import {
  balancePorSistema,
  checkReglaTorneo,
  computeAllPlayerStats,
  computePlayerEventStats,
  estimateNextXI,
  findReglaTorneo,
  formatPct,
  golesAgregados,
  lastN,
  minutoPromedioSustituciones,
  positionRotation,
  recordGEP,
  recordGEPPorCondicion,
  sortMatchesDesc,
  topCombosSaleEntra,
  topEntrantesConMinuto,
  topSalientesConMinuto,
  topSistemasResultantes,
  tramoMasFrecuente,
  type RecordGEP,
} from '../lib/stats';
import {
  analyzeIndividuales,
  analyzePhase,
  construccionSituacionCombos,
  DEFENSIVE_CATEGORIES,
  estructuraCambiaPorEstado,
  matchesWithCsvCount,
  OFFENSIVE_CATEGORIES,
  type ConstruccionSituacionCombo,
  type IndividualesBloque,
  type PhaseAnalysis,
} from '../lib/csvAnalysis';
import { playerMap, playerName } from '../lib/lookup';
import { PlantelView } from '../components/PlantelView';
import { useIsViewer } from '../lib/authContext';
import { UserSharePicker } from '../components/UserSharePicker';
import { IndividualStatsBoard } from '../components/IndividualStatsBoard';
import { Pitch, type PitchToken } from '../components/Pitch';
import { BuildUpShapeDiagram, FormationLinesDiagram, PressingTriggerDiagram } from '../components/TacticalDiagram';
import { situationDiagramFor } from '../components/SituationDiagrams';
import { RotationCard } from '../components/RotationCard';
import { MatchReportCard, outcomeRowClass, outcomeTextClass } from '../components/MatchReportCard';
import { ReglaTorneoBanner } from '../components/ReglaTorneoBanner';
import type { GameStateLabel } from '../lib/csvAnalysis';
import {
  defaultCoordsFor,
  positionOrderIndex,
  symmetrizeBackThree,
  symmetrizeDoublePivote,
  symmetrizeForwardPair,
} from '../lib/positions';

const EMPTY_PROXIMO: ProximoPartido = { competicion: '', instancia: '', fecha: '', estadio: '', condicion: '' };

export default function InformePage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const players = playerMap(rival.players);

  // Chrome usa el <title> del documento como nombre sugerido al exportar a
  // PDF (y también lo muestra en el encabezado de impresión), así que se
  // cambia mientras se ve el informe y se repone al salir para no afectar al
  // resto de la app.
  useEffect(() => {
    const previous = document.title;
    document.title = `Informe rival ${rival.nombre}`;
    return () => {
      document.title = previous;
    };
  }, [rival.nombre]);

  // Planilla de estadísticas de liga (pestaña "Gráficos y estadísticas"):
  // se refleja acá con las mismas funciones (lib/leagueStats.ts), para que
  // el Informe no pueda quedar desalineado con lo que se ve en esa pestaña.
  const [leagueStats, setLeagueStats] = useState<LeagueStatsImport | null | undefined>(undefined);
  useEffect(() => {
    api.leagueStats
      .get()
      .then(setLeagueStats)
      .catch(() => setLeagueStats(null));
  }, []);

  // Los 3 radares fijos, más el de Personalizado si el analista guardó uno
  // para este rival (ver GraficosPage.tsx) — con menos de 3 métricas
  // elegidas no se puede dibujar un radar, así que directamente no se
  // agrega.
  const radarPresets: RadarPreset[] = useMemo(() => {
    const list = [...RADAR_PRESETS];
    if (rival.graficoPersonalizado && rival.graficoPersonalizado.length >= 3) {
      list.push({
        key: 'personalizado',
        titulo: 'Personalizado',
        ejes: rival.graficoPersonalizado.map((c): RadarAxis => ({ columna: c, label: c })),
      });
    }
    return list;
  }, [rival.graficoPersonalizado]);

  const matches = useMemo(() => lastN(rival.matches, 10), [rival.matches]);
  const allMatches = useMemo(() => sortMatchesDesc(rival.matches), [rival.matches]);

  const sistemas = useMemo(() => balancePorSistema(matches), [matches]);
  const goles = useMemo(() => golesAgregados(matches), [matches]);
  const gepPorCondicion = useMemo(() => recordGEPPorCondicion(matches), [matches]);
  const rotation = useMemo(() => positionRotation(matches), [matches]);
  const combos = useMemo(() => topCombosSaleEntra(matches), [matches]);
  const minutoPromSustituciones = useMemo(() => minutoPromedioSustituciones(matches), [matches]);
  const tramoTop = useMemo(() => tramoMasFrecuente(matches), [matches]);
  const principalRevulsivo = useMemo(() => topEntrantesConMinuto(matches)[0], [matches]);
  const principalSustituto = useMemo(() => topSalientesConMinuto(matches)[0], [matches]);
  const sistemasResultantes = useMemo(() => topSistemasResultantes(matches), [matches]);
  const continuidad = useMemo(() => {
    const stats = computeAllPlayerStats(rival.players, matches);
    return [...stats].sort((a, b) => b.porcentajeMinutos - a.porcentajeMinutos).slice(0, 8);
  }, [rival.players, matches]);
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

  const eventStats = useMemo(
    () => rival.players.map((player) => ({ player, events: computePlayerEventStats(player.id, matches) })),
    [rival.players, matches]
  );
  const topGoleadores = eventStats.filter((s) => s.events.goles > 0).sort((a, b) => b.events.goles - a.events.goles);
  const jugadoresConTarjetas = eventStats
    .filter((s) => s.events.amarillas > 0 || s.events.rojas > 0)
    .sort((a, b) => b.events.rojas - a.events.rojas || b.events.amarillas - a.events.amarillas);

  const bajas = rival.players.filter((p) => p.baja);
  const matchesWithCsv = matchesWithCsvCount(matches);
  const ofensiva = useMemo(
    () =>
      analyzePhase(matches, OFFENSIVE_CATEGORIES, [
        { titulo: 'Distancia de salida', columnas: ['Distancia de salida'], desglosePorEstado: true, soporte: true },
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

  const plantillaOrdenada = useMemo(() => {
    return [...rival.players].sort((a, b) => {
      const diff = positionOrderIndex(a.posicion) - positionOrderIndex(b.posicion);
      if (diff !== 0) return diff;
      return (a.dorsal ?? 999) - (b.dorsal ?? 999);
    });
  }, [rival.players]);

  const playerStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeAllPlayerStats>[number]>();
    for (const s of computeAllPlayerStats(rival.players, matches)) map.set(s.player.id, s);
    return map;
  }, [rival.players, matches]);

  return (
    <div className="informe-container max-w-6xl mx-auto pb-16">
      <div className="no-print flex justify-end mb-4">
        <button className="btn-primary" onClick={() => window.print()}>
          Imprimir / Guardar como PDF
        </button>
      </div>

      <Portada rival={rival} gep={recordGEP(matches)} onSaved={reload} />

      <div className="mb-6">
        <PlantelView
          players={rival.players}
          sistemaPrincipal={rival.sistemaPrincipal || ''}
          sistemaAlternativo={rival.sistemaAlternativo || ''}
        />
      </div>

      <section className="informe-section card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Últimos {matches.length} resultados</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Oponente</th>
              <th>Cond.</th>
              <th>Competencia</th>
              <th>Resultado</th>
              <th>Sistema</th>
            </tr>
          </thead>
          <tbody>
            {allMatches.slice(0, 10).map((m) => (
              <tr key={m.id} className={outcomeRowClass(m)}>
                <td className="whitespace-nowrap">{m.fecha}</td>
                <td>{m.oponente || '—'}</td>
                <td>{m.condicion}</td>
                <td>{[m.competencia, m.jornada].filter(Boolean).join(' · ') || '—'}</td>
                <td className={outcomeTextClass(m)}>
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
                <td colSpan={6} className="text-center text-slate-400 py-4">
                  Sin partidos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="informe-section card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Balance general</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="border border-slate-100 rounded-md p-2">
            <div className="text-[10px] text-slate-400 uppercase">Goles (GF/GC)</div>
            <div className="text-sm font-semibold text-slate-800">
              {goles.favor} / {goles.contra}
            </div>
          </div>
          <div className="border border-slate-100 rounded-md p-2">
            <div className="text-[10px] text-slate-400 uppercase">Diferencia de gol</div>
            <div className="text-sm font-semibold text-slate-800">
              {goles.diferencia > 0 ? `+${goles.diferencia}` : goles.diferencia}
            </div>
          </div>
          <div className="border border-slate-100 rounded-md p-2">
            <div className="text-[10px] text-slate-400 uppercase">Como local</div>
            <div className="text-sm font-semibold text-slate-800">
              {gepPorCondicion.Local.jugados > 0
                ? `${gepPorCondicion.Local.ganados}G-${gepPorCondicion.Local.empatados}E-${gepPorCondicion.Local.perdidos}P (${gepPorCondicion.Local.rendimiento}%)`
                : '—'}
            </div>
          </div>
          <div className="border border-slate-100 rounded-md p-2">
            <div className="text-[10px] text-slate-400 uppercase">Como visitante</div>
            <div className="text-sm font-semibold text-slate-800">
              {gepPorCondicion.Visitante.jugados > 0
                ? `${gepPorCondicion.Visitante.ganados}G-${gepPorCondicion.Visitante.empatados}E-${gepPorCondicion.Visitante.perdidos}P (${gepPorCondicion.Visitante.rendimiento}%)`
                : '—'}
            </div>
          </div>
        </div>
      </section>

      <section className="informe-section card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Plantilla completa</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Posición</th>
              <th>Estatura</th>
              <th>Pie</th>
              <th title="Partidos jugados">PJ</th>
              <th>Titular</th>
              <th>Minutos</th>
              <th>% Min. posibles</th>
              <th>Goles</th>
              <th title="Tarjetas amarillas / rojas">TA/TR</th>
              <th>Condiciones</th>
            </tr>
          </thead>
          <tbody>
            {plantillaOrdenada.map((p) => {
              const s = playerStatsMap.get(p.id);
              const events = computePlayerEventStats(p.id, matches);
              return (
                <tr key={p.id}>
                  <td>{p.dorsal ?? '—'}</td>
                  <td className="font-medium">{p.nombre}</td>
                  <td>{p.posicion || '—'}</td>
                  <td>{p.estatura ? `${p.estatura.toFixed(2)} m` : '—'}</td>
                  <td>{p.pie || '—'}</td>
                  <td>{s?.partidosJugados ?? 0}</td>
                  <td>{s?.titularidades ?? 0}</td>
                  <td>{Math.round(s?.minutosJugados ?? 0)}'</td>
                  <td>{formatPct(s?.porcentajeMinutos ?? 0)}</td>
                  <td>{events.goles}</td>
                  <td>
                    {events.amarillas > 0 && <span className="text-amber-600 font-medium">{events.amarillas}</span>}
                    {events.amarillas > 0 && events.rojas > 0 && ' / '}
                    {events.rojas > 0 && <span className="text-red-600 font-medium">{events.rojas}</span>}
                    {events.amarillas === 0 && events.rojas === 0 && '—'}
                  </td>
                  <td className="text-xs">
                    {p.extranjero && <span className="text-sky-700 font-medium mr-2">EXT</span>}
                    {p.sub21 && <span className="text-emerald-700 font-medium mr-2">U21</span>}
                    {p.sub18 && <span className="text-yellow-700 font-medium mr-2">U18</span>}
                    {p.duda && <span className="text-purple-700 font-medium mr-2">DUDA</span>}
                    {p.baja && <span className="text-red-700 font-medium">BAJA</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="informe-section card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Jugadores con mayor continuidad</h3>
        {continuidad.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {continuidad.map((s) => (
              <li key={s.player.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>{s.player.nombre}</span>
                <span className="text-slate-400">
                  {s.titularidades} tit. · {Math.round(s.minutosJugados)}' · {formatPct(s.porcentajeMinutos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="informe-section informe-page card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">XI estimado para el próximo partido</h3>
        {xiEstimate.picks.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos suficientes.</p>
        ) : (
          <>
            <Pitch tokens={xiPitchTokens} height={560} />
            {xiEstimate.excluidos.length > 0 && (
              <p className="text-xs text-red-600 mt-2">
                Excluidos por estar de baja, en selección o no citados al último partido:{' '}
                {xiEstimate.excluidos.map((p) => p.nombre).join(', ')}.
              </p>
            )}
            {xiEstimate.picks.some((p) => p.reemplazadoPorRegla) && (
              <p className="text-xs text-slate-500 mt-2">
                Ajustado por la regla de {reglaAplicable?.torneo}:{' '}
                {xiEstimate.picks
                  .filter((p) => p.reemplazadoPorRegla)
                  .map((p, i) => (
                    <span key={p.player.id}>
                      {i > 0 && '; '}
                      {p.player.nombre} en vez de {p.reemplazadoPorRegla!.nombre}
                    </span>
                  ))}
                .
              </p>
            )}
            <ReglaTorneoBanner check={reglaCheck} />
            {rival.notaXI && (
              <p className="text-xs text-slate-600 mt-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                <span className="font-semibold text-slate-500">Nota: </span>
                {rival.notaXI}
              </p>
            )}
          </>
        )}

        <div className="mt-4 pt-4 border-t border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-3">Sistema más utilizado</h3>
          {sistemas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Sistema</th>
                  <th>Partidos</th>
                  <th>V-E-P</th>
                  <th>Rendimiento</th>
                </tr>
              </thead>
              <tbody>
                {sistemas.map((s, i) => (
                  <tr key={i}>
                    <td>{s.item}</td>
                    <td>{s.count}</td>
                    <td>
                      {s.ganados}-{s.empatados}-{s.perdidos}
                    </td>
                    <td>{s.rendimiento !== null ? `${s.rendimiento}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="informe-section mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Posiciones con mayor rotación</h3>
        {rotation.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos.</p>
        ) : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {rotation.map((r) => (
              <RotationCard key={r.posicion} data={r} players={players} compact />
            ))}
          </div>
        )}
      </section>

      <div className="informe-title-page">
        <h3 className="font-semibold text-slate-800">Partidos analizados</h3>
      </div>

      <section className="informe-section informe-page mb-6">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {allMatches.map((m) => (
            <div key={m.id} className="informe-section">
              <MatchReportCard match={m} players={rival.players} />
            </div>
          ))}
          {allMatches.length === 0 && <p className="text-sm text-slate-400">No hay partidos registrados.</p>}
        </div>
      </section>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <section className="informe-section card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Sustituciones y cambios de sistema más frecuentes</h3>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="border border-slate-100 rounded-md p-2">
              <div className="text-[10px] text-slate-400 uppercase">Minuto prom. cambio</div>
              <div className="text-sm font-semibold text-slate-800">
                {minutoPromSustituciones ? `${minutoPromSustituciones.toFixed(0)}'` : '—'}
              </div>
            </div>
            <div className="border border-slate-100 rounded-md p-2">
              <div className="text-[10px] text-slate-400 uppercase">Tramo más frecuente</div>
              <div className="text-sm font-semibold text-slate-800">
                {tramoTop ? `${tramoTop.tramo}' (${tramoTop.count})` : '—'}
              </div>
            </div>
            <div className="border border-slate-100 rounded-md p-2">
              <div className="text-[10px] text-slate-400 uppercase">Principal revulsivo</div>
              <div className="text-sm font-semibold text-slate-800">
                {principalRevulsivo
                  ? `${playerName(players, principalRevulsivo.item)} (${principalRevulsivo.count}, min ~${principalRevulsivo.minutoPromedio.toFixed(0)}')`
                  : '—'}
              </div>
            </div>
            <div className="border border-slate-100 rounded-md p-2">
              <div className="text-[10px] text-slate-400 uppercase">Principal sustituto</div>
              <div className="text-sm font-semibold text-slate-800">
                {principalSustituto
                  ? `${playerName(players, principalSustituto.item)} (${principalSustituto.count}, min ~${principalSustituto.minutoPromedio.toFixed(0)}')`
                  : '—'}
              </div>
            </div>
          </div>
          {combos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin sustituciones registradas.</p>
          ) : (
            <ul className="text-sm space-y-1 mb-3">
              {combos.slice(0, 6).map((c, i) => (
                <li key={i} className="flex justify-between border-b border-slate-100 pb-1">
                  <span>
                    {playerName(players, c.item.jugadorSaleId)} → {playerName(players, c.item.jugadorEntraId)}
                  </span>
                  <span className="text-slate-400">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Cambios de sistema más frecuentes</h4>
            {sistemasResultantes.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cambios de sistema registrados.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {sistemasResultantes.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex justify-between border-b border-slate-100 pb-1">
                    <span>{s.item}</span>
                    <span className="text-slate-400">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="informe-section card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Goles y tarjetas</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Máximos goleadores</h4>
              {topGoleadores.length === 0 ? (
                <p className="text-sm text-slate-400">Sin goles registrados.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {topGoleadores.map((s) => (
                    <li key={s.player.id} className="flex justify-between border-b border-slate-100 pb-1">
                      <span>{s.player.nombre}</span>
                      <span className="text-slate-400">{s.events.goles}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Tarjetas</h4>
              {jugadoresConTarjetas.length === 0 ? (
                <p className="text-sm text-slate-400">Sin tarjetas registradas.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {jugadoresConTarjetas.map((s) => (
                    <li key={s.player.id} className="flex justify-between border-b border-slate-100 pb-1">
                      <span>{s.player.nombre}</span>
                      <span className="text-slate-400">
                        {s.events.amarillas > 0 ? `${s.events.amarillas} TA ` : ''}
                        {s.events.rojas > 0 ? `${s.events.rojas} TR` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="informe-section mb-6">
        <h3 className="font-semibold text-slate-800 mb-1">Datos analizados de Sportscode</h3>
        <p className="text-xs text-slate-500 mb-3">
          {matchesWithCsv} de {matches.length} partidos con CSV cargado.
        </p>
        {matchesWithCsv === 0 ? (
          <p className="text-sm text-slate-400">Sin CSV cargados en esta ventana.</p>
        ) : (
          // Una fase completa por vez (no las 3 en columnas paralelas): así,
          // si una fase se extiende a la página siguiente, no se mezcla con
          // el arranque de otra fase distinta ni se pierde de vista bajo qué
          // título sigue ese contenido.
          <div className="space-y-4">
            <PhaseSummaryCard
              title="Fase ofensiva"
              data={ofensiva}
              showEstructura
              estructuraTitle="Estructura de circulación"
              estructuraAfterIndex={1}
              estructuraDiagram={(valor) => <BuildUpShapeDiagram valor={valor} />}
              estructuraSituacionCombos={construccionSituacion}
              situacionDiagram={(tag) => situationDiagramFor(tag, sistemas[0]?.item ?? null)}
            />
            <PhaseSummaryCard
              title="Presión rival"
              data={presionEstructura}
              showEstructura
              estructuraTitle="Dibujo táctico en presión"
              estructuraDiagram={(valor) => <FormationLinesDiagram valor={valor} />}
              situacionDiagram={(tag) => <PressingTriggerDiagram tag={tag} />}
            />
            <PhaseSummaryCard
              title="Espacios y vulnerabilidades"
              data={vulnerabilidades}
              situacionDiagram={(tag) => situationDiagramFor(tag, sistemas[0]?.item ?? null)}
              situacionNarradoCount={3}
            />
            {(circulacionesIndividuales.combos.length > 0 ||
              presionesIndividuales.combos.length > 0 ||
              circulacionesIndividuales.pendientes.length > 0 ||
              presionesIndividuales.pendientes.length > 0) && (
              <div className="informe-section card p-4">
                <h4 className="font-semibold text-slate-800 mb-3">Comportamientos individuales</h4>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <IndividualesInformeBlock data={circulacionesIndividuales} />
                  <IndividualesInformeBlock data={presionesIndividuales} />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {leagueStats && rival.codigoLdp && (
        <section className="informe-section informe-page mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">Gráficos y estadísticas</h3>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {radarPresets.map((preset) => (
              <RadarPresetCard
                key={preset.key}
                data={leagueStats}
                preset={preset}
                rivalNombre={rival.nombre}
                rivalCodigo={rival.codigoLdp!}
              />
            ))}
          </div>
        </section>
      )}

      {rival.individualStats && rival.individualStats.rows.length > 0 && (
        <section className="informe-section informe-page mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">Datos individuales</h3>
          <IndividualStatsBoard data={rival.individualStats} />
        </section>
      )}

      <section className="informe-section card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Notas finales</h3>
        <p className="text-sm text-slate-600">
          {bajas.length > 0
            ? `Jugadores actualmente de baja: ${bajas.map((p) => p.nombre).join(', ')}.`
            : 'No hay jugadores marcados como baja actualmente.'}
        </p>
      </section>
    </div>
  );
}

function Portada({
  rival,
  gep,
  onSaved,
}: {
  rival: RivalContext['rival'];
  gep: RecordGEP;
  onSaved: () => void;
}) {
  const isViewer = useIsViewer();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProximoPartido>(rival.proximoPartido || EMPTY_PROXIMO);
  const [entrenador, setEntrenador] = useState(rival.entrenador || '');
  const [entrenadorGanados, setEntrenadorGanados] = useState(rival.entrenadorGanados?.toString() ?? '');
  const [entrenadorEmpatados, setEntrenadorEmpatados] = useState(rival.entrenadorEmpatados?.toString() ?? '');
  const [entrenadorPerdidos, setEntrenadorPerdidos] = useState(rival.entrenadorPerdidos?.toString() ?? '');
  const [notasContexto, setNotasContexto] = useState(rival.notasContexto || '');
  const [notaXI, setNotaXI] = useState(rival.notaXI || '');
  const [visibleUserIds, setVisibleUserIds] = useState<string[] | null>(rival.visibleUserIds ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingEscudo, setUploadingEscudo] = useState(false);
  const p = rival.proximoPartido;
  const hasInfo = !!(p && (p.competicion || p.instancia || p.fecha || p.estadio));

  const entrenadorGananciosNum = rival.entrenadorGanados ?? 0;
  const entrenadorEmpatadosNum = rival.entrenadorEmpatados ?? 0;
  const entrenadorPerdidosNum = rival.entrenadorPerdidos ?? 0;
  const entrenadorTotal = entrenadorGananciosNum + entrenadorEmpatadosNum + entrenadorPerdidosNum;
  const entrenadorRendimiento =
    entrenadorTotal > 0 ? Math.round(((entrenadorGananciosNum * 3 + entrenadorEmpatadosNum) / (entrenadorTotal * 3)) * 100) : null;

  const save = async () => {
    setSaving(true);
    try {
      await api.rivals.update(rival.id, {
        proximoPartido: form,
        entrenador,
        entrenadorGanados: entrenadorGanados.trim() === '' ? null : Number(entrenadorGanados),
        entrenadorEmpatados: entrenadorEmpatados.trim() === '' ? null : Number(entrenadorEmpatados),
        entrenadorPerdidos: entrenadorPerdidos.trim() === '' ? null : Number(entrenadorPerdidos),
        notasContexto,
        notaXI,
        visibleUserIds,
      });
      onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const uploadEscudo = async (file: File) => {
    setUploadingEscudo(true);
    try {
      await api.rivals.uploadEscudo(rival.id, file);
      onSaved();
    } finally {
      setUploadingEscudo(false);
    }
  };

  const removeEscudo = async () => {
    setUploadingEscudo(true);
    try {
      await api.rivals.removeEscudo(rival.id);
      onSaved();
    } finally {
      setUploadingEscudo(false);
    }
  };

  return (
    <div className="informe-section informe-cover mb-8">
      {!isViewer && (
        <div className="no-print flex justify-end mb-2">
          <button className="text-xs text-emerald-700 hover:underline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cerrar' : 'Editar portada'}
          </button>
        </div>
      )}

      {editing && !isViewer && (
        <div className="no-print card p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="label">Escudo</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="input"
                disabled={uploadingEscudo}
                onChange={(e) => e.target.files?.[0] && uploadEscudo(e.target.files[0])}
              />
              {rival.escudoUrl && (
                <button className="text-xs text-red-600 hover:underline mt-1" onClick={removeEscudo} disabled={uploadingEscudo}>
                  Quitar escudo
                </button>
              )}
            </div>
            <div>
              <label className="label">Entrenador</label>
              <input
                className="input"
                value={entrenador}
                onChange={(e) => setEntrenador(e.target.value)}
                placeholder="Nombre del entrenador"
              />
            </div>
            <div>
              <label className="label">Ganados con el DT</label>
              <input
                type="number"
                className="input"
                value={entrenadorGanados}
                onChange={(e) => setEntrenadorGanados(e.target.value)}
                placeholder="Ej: 32"
              />
            </div>
            <div>
              <label className="label">Empatados con el DT</label>
              <input
                type="number"
                className="input"
                value={entrenadorEmpatados}
                onChange={(e) => setEntrenadorEmpatados(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Perdidos con el DT</label>
              <input
                type="number"
                className="input"
                value={entrenadorPerdidos}
                onChange={(e) => setEntrenadorPerdidos(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            Récord completo del entrenador al mando del equipo, más allá de los partidos analizados en detalle abajo.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="label">Competición</label>
              <input className="input" value={form.competicion} onChange={(e) => setForm({ ...form, competicion: e.target.value })} />
            </div>
            <div>
              <label className="label">Instancia / Ronda</label>
              <input className="input" value={form.instancia} onChange={(e) => setForm({ ...form, instancia: e.target.value })} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <label className="label">Estadio</label>
              <input className="input" value={form.estadio} onChange={(e) => setForm({ ...form, estadio: e.target.value })} />
            </div>
            <div>
              <label className="label">Condición</label>
              <select
                className="input"
                value={form.condicion}
                onChange={(e) => setForm({ ...form, condicion: e.target.value as ProximoPartido['condicion'] })}
              >
                <option value="">Sin especificar</option>
                <option value="Local">Local</option>
                <option value="Visitante">Visitante</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Notas de contexto del plantel (una por línea)</label>
              <textarea
                className="input"
                rows={3}
                value={notasContexto}
                onChange={(e) => setNotasContexto(e.target.value)}
                placeholder={'Ej: Rebolledo y Reinoso siempre suplentes\nSub-18 con poca continuidad en Copa Chile'}
              />
            </div>
            <div>
              <label className="label">Nota sobre el XI estimado (opcional)</label>
              <textarea
                className="input"
                rows={3}
                value={notaXI}
                onChange={(e) => setNotaXI(e.target.value)}
                placeholder="Ej: Ramos y León pueden intercambiar posición durante el partido"
              />
            </div>
          </div>
          <UserSharePicker value={visibleUserIds} onChange={setVisibleUserIds} />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={saving} onClick={save}>
              Guardar
            </button>
          </div>
        </div>
      )}

      <div className="text-center py-10 border border-slate-200 rounded-lg bg-slate-50">
        {hasInfo && (
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">
            {[p?.instancia, p?.competicion].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Informe de rival</p>
        {rival.escudoUrl && <img src={rival.escudoUrl} alt="" className="w-20 h-20 object-contain mx-auto mb-2" />}
        <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight">{rival.nombre}</h1>
        {rival.entrenador && (
          <p className="text-sm text-slate-500 mt-1">
            DT: {rival.entrenador}
            {entrenadorTotal > 0 && (
              <>
                {' '}
                · {entrenadorGananciosNum}G-{entrenadorEmpatadosNum}E-{entrenadorPerdidosNum}P en el club (
                {entrenadorRendimiento}%)
              </>
            )}
          </p>
        )}
        {hasInfo && (
          <p className="text-sm text-slate-600 mt-4">
            {[p?.fecha, p?.estadio, p?.condicion].filter(Boolean).join(' · ')}
          </p>
        )}
        {gep.jugados > 0 && (
          <p className="text-sm text-slate-700 mt-4">
            Récord: <span className="font-semibold">{gep.ganados}G-{gep.empatados}E-{gep.perdidos}P</span> en los
            últimos {gep.jugados} partidos · Rendimiento:{' '}
            <span className="font-semibold">{gep.rendimiento}%</span>
          </p>
        )}
      </div>

      {rival.notasContexto && (
        <div className="mt-3 text-left">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Contexto del plantel</h4>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-0.5">
            {rival.notasContexto
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// Arma un párrafo (no una oración suelta al final) que cuenta qué patrón
// domina y, cuando corresponde, cómo cambia según el resultado parcial —
// combina la estructura y la situación más repetidas en un mismo texto en
// vez de dejar solo porcentajes sin explicar qué significan.
function construirResumen(data: PhaseAnalysis, showEstructura: boolean, maxBloques = 2): string | null {
  const frases: string[] = [];

  if (showEstructura && data.estructura[0]) {
    const principal = data.estructura[0];
    let frase = `El patrón predominante es ${principal.valor} (${principal.pct}%)`;
    if (data.porEstado.length > 0 && estructuraCambiaPorEstado(data.porEstado)) {
      const distinto = data.porEstado.find((r) => r.estructuraTop && r.estructuraTop.valor !== principal.valor);
      if (distinto?.estructuraTop) {
        frase += `, aunque ${distinto.estado.toLowerCase()} predomina ${distinto.estructuraTop.valor} (${distinto.estructuraTop.pct}%)`;
      }
    }
    frases.push(frase + '.');
  }

  // Cuántos bloques de situaciones entran al párrafo (p. ej. circulación
  // media y alta, o presión alta/media/baja): los bloques de apoyo como
  // "Distancia de salida" (soporte: true) quedan afuera del párrafo aunque
  // se muestren igual en la tarjeta, sea cual sea su posición ahí.
  for (const bloque of data.situaciones.filter((b) => !b.soporte).slice(0, maxBloques)) {
    if (!bloque || bloque.tags.length === 0) continue;
    const top = bloque.tags
      .slice(0, 2)
      .map((t) => `${t.tag} (${t.pct}%)`)
      .join(' y ');
    let frase = `En ${bloque.titulo.toLowerCase()} se repiten sobre todo ${top}`;
    if (data.porEstado.length > 0) {
      const distinto = data.porEstado.find((r) => r.situacionesTop[0] && r.situacionesTop[0].tag !== bloque.tags[0].tag);
      if (distinto) {
        frase += `, aunque ${distinto.estado.toLowerCase()} lo más habitual pasa a ser "${distinto.situacionesTop[0].tag}" (${distinto.situacionesTop[0].pct}%)`;
      }
    }
    frases.push(frase + '.');
  }

  return frases.length > 0 ? frases.join(' ') : null;
}

// Mismos colores que las filas "Ganando/Empatando/Perdiendo" del resto de la
// app, para el desglose por resultado dentro de cada tarjeta de tag.
const ESTADO_BADGE_CLASS: Record<GameStateLabel, string> = {
  Ganando: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Empatando: 'border-amber-200 bg-amber-50 text-amber-700',
  Perdiendo: 'border-red-200 bg-red-50 text-red-700',
};

function PhaseSummaryCard({
  title,
  data,
  showEstructura = false,
  estructuraTitle,
  estructuraAfterIndex = 0,
  estructuraDiagram,
  estructuraSituacionCombos,
  situacionDiagram,
  situacionDiagramCount = 1,
  situacionNarradoCount = 2,
}: {
  title: string;
  data: PhaseAnalysis;
  showEstructura?: boolean;
  estructuraTitle?: string;
  // En cuántos bloques de "situaciones" hay que entrar antes de mostrar el
  // bloque de estructura (0 = primero, como antes).
  estructuraAfterIndex?: number;
  estructuraDiagram?: (valorTop: string) => ReactNode;
  estructuraSituacionCombos?: ConstruccionSituacionCombo[];
  situacionDiagram?: (tag: string) => ReactNode;
  situacionDiagramCount?: number;
  situacionNarradoCount?: number;
}) {
  if (data.totalRegistros === 0) {
    return (
      <div className="informe-section card p-4">
        <h4 className="font-semibold text-slate-800 mb-2">{title}</h4>
        <p className="text-sm text-slate-400">Sin registros.</p>
      </div>
    );
  }
  const estructuraTop = data.estructura[0];
  const estructuraDiagramEl = showEstructura && estructuraDiagram && estructuraTop ? estructuraDiagram(estructuraTop.valor) : null;
  const resumen = construirResumen(data, showEstructura, situacionNarradoCount);
  // Compartido entre bloques: si un concepto ya se dibujó en uno anterior
  // (p. ej. el mismo tag es el más repetido en presión media Y baja), los
  // bloques siguientes lo saltan y muestran el siguiente más repetido en su
  // lugar, en vez de repetir el mismo dibujo dos veces.
  const usedDiagramTags = new Set<string>();
  return (
    <div className="informe-section card p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-slate-800">{title}</h4>
        <span className="text-slate-400 text-sm">{data.totalRegistros} registros</span>
      </div>
      {resumen && <p className="text-sm text-slate-700 leading-snug mb-2">{resumen}</p>}
      {showEstructura && data.estructura.length > 1 && (
        <p className="text-[11px] text-slate-400 mb-2">
          {data.estructura
            .slice(0, 3)
            .map((b) => `${b.valor} (${b.pct}%)`)
            .join(' · ')}
        </p>
      )}
      {estructuraSituacionCombos && estructuraSituacionCombos.length > 0 && (
        <p className="text-[11px] text-slate-500 mb-2">
          Combinaciones frecuentes:{' '}
          {estructuraSituacionCombos.map((c) => `${c.construccion} + ${c.situacion} (${c.count})`).join(' · ')}
        </p>
      )}
      {/* La tarjeta ahora ocupa el ancho completo de la página (una fase a
          la vez, no 3 en columnas), así que la estructura y cada bloque de
          situaciones se acomodan lado a lado en vez de apilarse uno abajo
          del otro, aprovechando ese ancho en vez de dejarlo vacío. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {estructuraAfterIndex === 0 && estructuraDiagramEl && (
          <div>
            {estructuraTitle && (
              <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5">{estructuraTitle}</p>
            )}
            <DiagramFigure caption={estructuraTop!.valor} el={estructuraDiagramEl} />
          </div>
        )}
        {data.situaciones.map((bloque, i) => {
          // Cada bloque intenta su propio diagrama (p. ej. circulación media
          // Y alta, no solo el primero); bloques de apoyo como "Distancia de
          // salida" simplemente no tienen escena definida y quedan sin dibujo.
          const diagramEntries: { tag: string; el: ReactNode }[] = [];
          if (situacionDiagram) {
            for (const t of bloque.tags) {
              if (diagramEntries.length >= situacionDiagramCount) break;
              if (usedDiagramTags.has(t.tag)) continue;
              const el = situacionDiagram(t.tag);
              if (!el) continue;
              diagramEntries.push({ tag: t.tag, el });
              usedDiagramTags.add(t.tag);
            }
          }
          return (
            <Fragment key={bloque.titulo}>
              <div>
                {data.situaciones.length > 1 && (
                  <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5">{bloque.titulo}</p>
                )}
                <ul className="text-xs text-slate-600 space-y-1">
                  {bloque.tags.slice(0, 5).map((t) => (
                    <li key={t.tag}>
                      <div>
                        {t.tag} ({t.count})
                      </div>
                      {t.porEstado && t.porEstado.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5 mb-1">
                          {t.porEstado.map((e) => (
                            <span
                              key={e.estado}
                              className={`text-[10px] rounded-full px-1.5 py-0 border ${ESTADO_BADGE_CLASS[e.estado]}`}
                            >
                              {e.estado}: {e.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                  {bloque.tags.length === 0 && <li className="text-slate-400">Sin registros.</li>}
                </ul>
                {diagramEntries.map((d) => (
                  <DiagramFigure key={d.tag} caption={d.tag} el={d.el} wide />
                ))}
              </div>
              {estructuraAfterIndex === i + 1 && estructuraDiagramEl && (
                <div>
                  {estructuraTitle && (
                    <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-0.5">
                      {estructuraTitle}
                    </p>
                  )}
                  <DiagramFigure caption={estructuraTop!.valor} el={estructuraDiagramEl} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Combinaciones jugador rival + situación (columna "Rivales" del CSV): solo
// lectura acá, a diferencia de la pestaña Análisis, donde quien edita puede
// resolver los registros ambiguos — el informe es un resumen, no el lugar
// para esa tarea.
function IndividualesInformeBlock({ data }: { data: IndividualesBloque }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{data.titulo}</p>
      {data.combos.length === 0 ? (
        <p className="text-xs text-slate-400">Sin combinaciones.</p>
      ) : (
        <ul className="text-xs text-slate-600 space-y-1">
          {data.combos.map((c) => (
            <li key={`${c.rival}+${c.situacion}`}>
              {c.rival} · {c.situacion} ({c.count})
            </li>
          ))}
        </ul>
      )}
      {data.pendientes.length > 0 && (
        <p className="text-[10px] text-amber-600 mt-1">
          {data.pendientes.length} registro{data.pendientes.length === 1 ? '' : 's'} pendiente
          {data.pendientes.length === 1 ? '' : 's'} de resolver (ver pestaña Análisis).
        </p>
      )}
    </div>
  );
}

// Tamaño único para todos los diagramas del informe (antes cada uno tomaba
// el ancho de su contenedor, quedando algunos enormes y otros diminutos) y
// una leyenda con el nombre exacto del patrón, para que no quede ambiguo a
// qué concepto corresponde cada dibujo.
function DiagramFigure({ caption, el, wide = false }: { caption: string; el: ReactNode; wide?: boolean }) {
  return (
    <div className="mt-2" style={{ maxWidth: wide ? '95%' : '62%', marginLeft: 'auto', marginRight: 'auto' }}>
      {el}
      <p className="text-[10px] text-slate-500 text-center mt-1">{caption}</p>
    </div>
  );
}

const COLOR_RIVAL = '#f97316';
const COLOR_PROPIO = '#1e3a8a';
const COLOR_PROMEDIO = '#eab308';

// Mismo radar que la pestaña "Gráficos y estadísticas" (rival/propio/
// promedio, con los ejes "menos es mejor" invertidos) — se recalcula acá en
// vez de recibir las series ya armadas porque el techo/piso de cada eje
// (escalasPorEje) depende de toda la planilla, no solo de este rival.
function RadarPresetCard({
  data,
  preset,
  rivalNombre,
  rivalCodigo,
}: {
  data: LeagueStatsImport;
  preset: RadarPreset;
  rivalNombre: string;
  rivalCodigo: string;
}) {
  const rivalRow = findRow(data, rivalCodigo);
  const propioRow = data.codigoPropio ? findRow(data, data.codigoPropio) : null;
  const promedioRow = findRow(data, CODIGO_PROMEDIO);

  const series: { label: string; color: string; valores: number[] }[] = [];
  if (rivalRow) series.push({ label: rivalNombre, color: COLOR_RIVAL, valores: valoresPorEje(data, preset.ejes, rivalCodigo) });
  if (propioRow) series.push({ label: 'Propio', color: COLOR_PROPIO, valores: valoresPorEje(data, preset.ejes, data.codigoPropio!) });
  if (promedioRow) series.push({ label: 'Promedio', color: COLOR_PROMEDIO, valores: valoresPorEje(data, preset.ejes, CODIGO_PROMEDIO) });
  if (series.length === 0) return null;

  const { maxPorEje, minPorEje, invertido } = escalasPorEje(data, preset.ejes);

  return (
    <div className="informe-section card p-3">
      <h4 className="text-sm font-semibold text-slate-700 mb-2">{preset.titulo}</h4>
      <RadarLegend series={series} />
      <div className="mt-2 max-w-sm mx-auto">
        <RadarChart
          ejeLabels={preset.ejes.map((e) => e.label)}
          series={series}
          maxPorEje={maxPorEje}
          minPorEje={minPorEje}
          invertido={invertido}
          size={320}
        />
      </div>
    </div>
  );
}
