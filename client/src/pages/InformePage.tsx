import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import { NIVELES_OPONENTE, type LeagueStatsImport, type Match, type ProximoPartido } from '../types';
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
  DEFENSIVE_CATEGORIES,
  matchesWithCsvCount,
  OFFENSIVE_CATEGORIES,
  OFENSIVA_GROUPS,
  PRESION_FIJA_GROUPS,
  VULNERABILIDADES_GROUPS,
  type IndividualesBloque,
} from '../lib/csvAnalysis';
import { playerMap, playerName } from '../lib/lookup';
import { PlantelView } from '../components/PlantelView';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { useIsViewer } from '../lib/authContext';
import { ClavesSintesis } from '../components/ClavesRival';
import { AlineacionProbableSlide, EstructuraTacticaSlide, MomentosSlides, SportscodeSlides } from '../components/InformeSlides';
import { UserSharePicker } from '../components/UserSharePicker';
import { IndividualStatsBoard } from '../components/IndividualStatsBoard';
import { type PitchToken } from '../components/Pitch';
import { RotationCard } from '../components/RotationCard';
import { MatchReportCard, outcomeRowClass, outcomeTextClass } from '../components/MatchReportCard';
import { ReglaTorneoBanner } from '../components/ReglaTorneoBanner';
import { XIManualControls, resolveXIMostrado } from '../components/XIManual';
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
  const isViewer = useIsViewer();
  const players = playerMap(rival.players);
  const [perfilJugadorId, setPerfilJugadorId] = useState<string | null>(null);
  const perfilJugador = perfilJugadorId ? rival.players.find((p) => p.id === perfilJugadorId) || null : null;

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

  // Todas las estadísticas usan todos los partidos registrados del rival;
  // solo la tabla de resultados muestra los 10 más recientes.
  const matches = useMemo(() => sortMatchesDesc(rival.matches), [rival.matches]);

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
    () => estimateNextXI(rival.players, rival.matches, reglaAplicable, rival.proximoPartido?.competicion),
    [rival.players, rival.matches, reglaAplicable, rival.proximoPartido]
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
  const xi = useMemo(() => resolveXIMostrado(rival, xiEstimate, xiPitchTokens), [rival, xiEstimate, xiPitchTokens]);
  const reglaCheck = useMemo(
    () => checkReglaTorneo(xi.picks, reglaAplicable, rival.players),
    [xi, reglaAplicable, rival.players]
  );

  const eventStats = useMemo(
    () => rival.players.map((player) => ({ player, events: computePlayerEventStats(player.id, matches) })),
    [rival.players, matches]
  );
  const topGoleadores = eventStats.filter((s) => s.events.goles > 0).sort((a, b) => b.events.goles - a.events.goles);
  const jugadoresConTarjetas = eventStats
    .filter((s) => s.events.amarillas > 0 || s.events.rojas > 0)
    .sort((a, b) => b.events.rojas - a.events.rojas || b.events.amarillas - a.events.amarillas);

  const matchesWithCsv = matchesWithCsvCount(matches);
  const ofensiva = useMemo(
    () =>
      analyzePhase(matches, OFFENSIVE_CATEGORIES, OFENSIVA_GROUPS),
    [matches]
  );
  const presionEstructura = useMemo(
    () =>
      analyzePhase(matches, DEFENSIVE_CATEGORIES, PRESION_FIJA_GROUPS),
    [matches]
  );
  const vulnerabilidades = useMemo(
    () =>
      analyzePhase(matches, DEFENSIVE_CATEGORIES, VULNERABILIDADES_GROUPS),
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

      <ClavesSintesis rival={rival} matches={matches} jugadores={rival.players} canEdit={!isViewer} onSaved={reload} />

      <PartidosConsiderados matches={matches} canEdit={!isViewer} />

      {/* El plantel siempre en una página propia y entera: con la síntesis y
          los partidos considerados arriba ya no cabe en la misma hoja. */}
      <div className="informe-section informe-page mb-6">
        <PlantelView
          players={rival.players}
          sistemaPrincipal={rival.sistemaPrincipal || ''}
          sistemaAlternativo={rival.sistemaAlternativo || ''}
          onSelectPlayer={(p) => setPerfilJugadorId(p.id)}
        />
      </div>

      <section className="informe-section card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-3">Últimos {Math.min(matches.length, 10)} resultados</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Oponente</th>
              <th>Cond.</th>
              <th>Competencia</th>
              <th>Resultado</th>
              <th>Sistema</th>
              <th>Nivel op.</th>
              <th title="Partido con CSV de Sportscode cargado">CSV</th>
            </tr>
          </thead>
          <tbody>
            {matches.slice(0, 10).map((m) => (
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
                <td>{m.nivelOponente || '—'}</td>
                <td>{m.csv ? '✓' : ''}</td>
              </tr>
            ))}
            {matches.length === 0 && (
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
                    {p.sub19 && <span className="text-yellow-700 font-medium mr-2">U19</span>}
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

      <EstructuraTacticaSlide
        sistemas={sistemas}
        partidosConSistema={matches.filter((m) => m.sistema).length}
        estructuraCirculacion={ofensiva.estructura}
        dibujoPresion={presionEstructura.estructura}
        cambiosSistema={sistemasResultantes}
      />

      <AlineacionProbableSlide
        tokens={xi.picks.length > 0 ? xi.tokens : []}
        picks={xi.picks}
        rotation={rotation}
        funciones={circulacionesIndividuales.combos}
        revulsivos={topEntrantesConMinuto(matches)}
        players={rival.players}
        deBaja={xiEstimate.excluidosPorBaja}
        enSeleccion={xiEstimate.excluidosPorSeleccion}
        controles={
          <XIManualControls rival={rival} xi={xi} estimadoTokens={xiPitchTokens} editable={!isViewer} onChanged={reload} />
        }
        notas={
          <>
            {xiEstimate.excluidosPorNoCitado.length > 0 && (
              <p className="text-xs text-slate-500">
                No citados al último partido: {xiEstimate.excluidosPorNoCitado.map((p) => p.nombre).join(', ')}.
              </p>
            )}
            {!xi.manual && xiEstimate.picks.some((p) => p.reemplazadoPorRegla) && (
              <p className="text-xs text-slate-500">
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
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                <span className="font-semibold text-slate-500">Nota: </span>
                {rival.notaXI}
              </p>
            )}
          </>
        }
      />

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
          {matches.map((m) => (
            <div key={m.id} className="informe-section">
              <MatchReportCard match={m} players={rival.players} />
            </div>
          ))}
          {matches.length === 0 && <p className="text-sm text-slate-400">No hay partidos registrados.</p>}
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

      {matchesWithCsv === 0 ? (
        <section className="informe-section card p-4 mb-6">
          <h3 className="font-semibold text-slate-800 mb-1">Datos analizados de Sportscode</h3>
          <p className="text-sm text-slate-400">Sin CSV cargados.</p>
        </section>
      ) : (
        <>
          <SportscodeSlides
            ofensiva={ofensiva}
            presion={presionEstructura}
            vulnerabilidades={vulnerabilidades}
            sistemaDominante={sistemas[0]?.item ?? null}
            rival={rival}
            canEdit={!isViewer}
            onSaved={reload}
          />
          {(circulacionesIndividuales.combos.length > 0 ||
            presionesIndividuales.combos.length > 0 ||
            circulacionesIndividuales.pendientes.length > 0 ||
            presionesIndividuales.pendientes.length > 0) && (
            <div className="informe-section card p-4 mb-6">
              <h4 className="font-semibold text-slate-800 mb-3">Comportamientos individuales</h4>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <IndividualesInformeBlock data={circulacionesIndividuales} />
                <IndividualesInformeBlock data={presionesIndividuales} />
              </div>
            </div>
          )}
        </>
      )}

      <MomentosSlides rival={rival} matches={matches} canEdit={!isViewer} onSaved={reload} />

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


      {perfilJugador && (
        <PlayerProfileModal player={perfilJugador} rival={rival} onClose={() => setPerfilJugadorId(null)} onSaved={reload} />
      )}
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
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!form.vuelta}
                onChange={(e) =>
                  setForm({
                    ...form,
                    vuelta: e.target.checked
                      ? {
                          fecha: '',
                          estadio: '',
                          condicion: form.condicion === 'Local' ? 'Visitante' : form.condicion === 'Visitante' ? 'Local' : '',
                        }
                      : null,
                  })
                }
              />
              Partido doble (ida y vuelta): agregar una segunda fecha para este mismo rival
            </label>
          </div>
          {form.vuelta && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 rounded-md p-3">
              <div>
                <label className="label">Fecha vuelta</label>
                <input
                  type="date"
                  className="input"
                  value={form.vuelta.fecha}
                  onChange={(e) => setForm({ ...form, vuelta: { ...form.vuelta!, fecha: e.target.value } })}
                />
              </div>
              <div>
                <label className="label">Estadio vuelta</label>
                <input
                  className="input"
                  value={form.vuelta.estadio}
                  onChange={(e) => setForm({ ...form, vuelta: { ...form.vuelta!, estadio: e.target.value } })}
                />
              </div>
              <div>
                <label className="label">Condición vuelta</label>
                <select
                  className="input"
                  value={form.vuelta.condicion}
                  onChange={(e) =>
                    setForm({ ...form, vuelta: { ...form.vuelta!, condicion: e.target.value as ProximoPartido['condicion'] } })
                  }
                >
                  <option value="">Sin especificar</option>
                  <option value="Local">Local</option>
                  <option value="Visitante">Visitante</option>
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Notas de contexto del plantel (una por línea)</label>
              <textarea
                className="input"
                rows={3}
                value={notasContexto}
                onChange={(e) => setNotasContexto(e.target.value)}
                placeholder={'Ej: Rebolledo y Reinoso siempre suplentes\nSub-19 con poca continuidad en Copa Chile'}
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
            {p?.vuelta ? 'Ida: ' : ''}
            {[p?.fecha, p?.estadio, p?.condicion].filter(Boolean).join(' · ')}
          </p>
        )}
        {p?.vuelta && (p.vuelta.fecha || p.vuelta.estadio || p.vuelta.condicion) && (
          <p className="text-sm text-slate-600">
            Vuelta: {[p.vuelta.fecha, p.vuelta.estadio, p.vuelta.condicion].filter(Boolean).join(' · ')}
          </p>
        )}
        {gep.jugados > 0 && (
          <p className="text-sm text-slate-700 mt-4">
            Récord: <span className="font-semibold">{gep.ganados}G-{gep.empatados}E-{gep.perdidos}P</span> en los
            {gep.jugados} partidos registrados · Rendimiento:{' '}
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

// De qué partidos salen los datos de Sportscode (y por lo tanto el dato de
// cada clave): cuántos, local/visita y el nivel del oponente, con un aviso
// cuando la muestra es chica o de un solo contexto.
function PartidosConsiderados({ matches, canEdit }: { matches: Match[]; canEdit: boolean }) {
  const conCsv = matches.filter((m) => m.csv);
  if (conCsv.length === 0) return null;
  const contar = <T extends string>(valores: T[]) => {
    const map = new Map<T, number>();
    for (const v of valores) map.set(v, (map.get(v) || 0) + 1);
    return map;
  };
  const condiciones = contar(conCsv.map((m) => m.condicion));
  const niveles = contar(conCsv.map((m) => m.nivelOponente || 'Sin clasificar'));
  const partes = (['Local', 'Visitante'] as const)
    .filter((c) => condiciones.get(c))
    .map((c) => `${condiciones.get(c)} ${c === 'Local' ? 'de local' : 'de visita'}`);
  const partesNivel = [...NIVELES_OPONENTE, 'Sin clasificar' as const]
    .filter((n) => niveles.get(n))
    .map((n) => (n === 'Sin clasificar' ? `${niveles.get(n)} sin clasificar` : `${niveles.get(n)} vs ${n.toLowerCase()}`));

  const avisos: string[] = [];
  if (conCsv.length < 3) avisos.push('Menos de 3 partidos: difícil separar lo estable de lo circunstancial.');
  if (conCsv.length >= 2 && condiciones.size === 1)
    avisos.push(`Todos ${conCsv[0].condicion === 'Local' ? 'de local' : 'de visita'}: falta ver al rival en el otro contexto.`);
  const nivelesClasificados = NIVELES_OPONENTE.filter((n) => niveles.get(n));
  if (conCsv.length >= 2 && nivelesClasificados.length === 1 && !niveles.get('Sin clasificar'))
    avisos.push(`Todos contra rivales de nivel ${nivelesClasificados[0].toLowerCase()}.`);

  return (
    <section className="informe-section card p-4 mb-6">
      <h3 className="font-semibold text-slate-800 mb-1">Partidos considerados</h3>
      <p className="text-sm text-slate-600">
        Los datos de Sportscode salen de {conCsv.length} de {matches.length} partidos: {partes.join(', ')} ·{' '}
        {partesNivel.join(', ')}.
      </p>
      {avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2">
          {a}
        </p>
      ))}
      {canEdit && niveles.get('Sin clasificar') && (
        <p className="no-print text-[11px] text-slate-400 mt-2">
          El nivel del oponente se clasifica en la ficha de cada partido ("Editar datos").
        </p>
      )}
    </section>
  );
}
