import type { Match, Player, Substitution, TorneoRegla } from '../types';
import { positionDef, POSITION_LABELS } from './positions';
import { formationSlots } from './formations';
import { onFieldBefore, computeDefaultLayoutForSub } from './pitchLayout';

// Los partidos se asumen ya ordenados de más reciente a más antiguo donde corresponda.
export function sortMatchesDesc(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

export function lastN(matches: Match[], n: number): Match[] {
  return sortMatchesDesc(matches).slice(0, n);
}

export interface RecordGEP {
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  // % de puntos obtenidos (victoria = 3, empate = 1) sobre los posibles; null sin partidos con resultado cargado.
  rendimiento: number | null;
}

export function recordGEP(matches: Match[]): RecordGEP {
  let ganados = 0;
  let empatados = 0;
  let perdidos = 0;
  for (const m of matches) {
    if (m.golesFavor === null || m.golesContra === null) continue;
    if (m.golesFavor > m.golesContra) ganados += 1;
    else if (m.golesFavor < m.golesContra) perdidos += 1;
    else empatados += 1;
  }
  const jugados = ganados + empatados + perdidos;
  const rendimiento = jugados > 0 ? Math.round(((ganados * 3 + empatados) / (jugados * 3)) * 100) : null;
  return { jugados, ganados, empatados, perdidos, rendimiento };
}

export interface GolesAgregados {
  favor: number;
  contra: number;
  diferencia: number;
}

export function golesAgregados(matches: Match[]): GolesAgregados {
  let favor = 0;
  let contra = 0;
  for (const m of matches) {
    favor += m.golesFavor ?? 0;
    contra += m.golesContra ?? 0;
  }
  return { favor, contra, diferencia: favor - contra };
}

export function recordGEPPorCondicion(matches: Match[]): Record<'Local' | 'Visitante', RecordGEP> {
  return {
    Local: recordGEP(matches.filter((m) => m.condicion === 'Local')),
    Visitante: recordGEP(matches.filter((m) => m.condicion === 'Visitante')),
  };
}

export interface PlayerMatchParticipation {
  matchId: string;
  titular: boolean;
  entroDeCambio: boolean;
  minutos: number;
  jugo: boolean;
}

export function participationFor(player: Player, match: Match): PlayerMatchParticipation {
  const titular = match.lineup.some((l) => l.playerId === player.id);
  const subOut = match.substitutions.find((s) => s.jugadorSaleId === player.id);
  const subIn = match.substitutions.find((s) => s.jugadorEntraId === player.id);

  let minutos = 0;
  let entroDeCambio = false;

  if (titular) {
    minutos = subOut ? subOut.minuto : match.duracionMinutos;
  } else if (subIn) {
    minutos = Math.max(0, match.duracionMinutos - subIn.minuto);
    entroDeCambio = true;
  }

  return { matchId: match.id, titular, entroDeCambio, minutos, jugo: titular || entroDeCambio };
}

export interface PlayerStats {
  player: Player;
  partidosJugados: number;
  titularidades: number;
  minutosJugados: number;
  minutosPosibles: number;
  porcentajeMinutos: number;
  ultimaAparicion: string | null;
}

export function computePlayerStats(player: Player, matches: Match[]): PlayerStats {
  let partidosJugados = 0;
  let titularidades = 0;
  let minutosJugados = 0;
  let minutosPosibles = 0;
  let ultimaAparicion: string | null = null;

  for (const match of matches) {
    minutosPosibles += match.duracionMinutos;
    const p = participationFor(player, match);
    if (p.titular) titularidades += 1;
    if (p.jugo) {
      partidosJugados += 1;
      minutosJugados += p.minutos;
      if (!ultimaAparicion || match.fecha > ultimaAparicion) ultimaAparicion = match.fecha;
    }
  }

  return {
    player,
    partidosJugados,
    titularidades,
    minutosJugados,
    minutosPosibles,
    porcentajeMinutos: minutosPosibles > 0 ? (minutosJugados / minutosPosibles) * 100 : 0,
    ultimaAparicion,
  };
}

export function computeAllPlayerStats(players: Player[], matches: Match[]): PlayerStats[] {
  return players.map((p) => computePlayerStats(p, matches));
}

export interface PlayerEventStats {
  goles: number;
  amarillas: number;
  rojas: number;
}

export function computePlayerEventStats(playerId: string, matches: Match[]): PlayerEventStats {
  let goles = 0;
  let amarillas = 0;
  let rojas = 0;
  for (const m of matches) {
    for (const e of m.events || []) {
      if (e.tipo === 'gol_favor' && e.jugadorId === playerId) goles += 1;
      if (e.tipo === 'amarilla' && e.jugadorId === playerId) amarillas += 1;
      if (e.tipo === 'roja' && e.jugadorId === playerId) rojas += 1;
    }
  }
  return { goles, amarillas, rojas };
}

export function allMatchEvents(matches: Match[]) {
  return matches.flatMap((m) => (m.events || []).map((e) => ({ match: m, event: e })));
}

export interface LineupSignature {
  key: string;
  matchIds: string[];
  count: number;
  players: { playerId: string; posicion: string }[];
}

export function mostCommonLineup(matches: Match[]): LineupSignature | null {
  const groups = new Map<string, LineupSignature>();
  for (const match of matches) {
    if (match.lineup.length === 0) continue;
    const sorted = [...match.lineup].sort((a, b) => a.playerId.localeCompare(b.playerId));
    const key = sorted.map((l) => l.playerId).join('|');
    if (!groups.has(key)) {
      groups.set(key, { key, matchIds: [], count: 0, players: sorted });
    }
    const g = groups.get(key)!;
    g.matchIds.push(match.id);
    g.count += 1;
  }
  let best: LineupSignature | null = null;
  for (const g of groups.values()) {
    if (!best || g.count > best.count) best = g;
  }
  return best;
}

export interface PositionRotation {
  posicion: string;
  titularidadesTotales: number;
  jugadoresDistintos: number;
  jugadores: { playerId: string; count: number }[];
}

export function positionRotation(matches: Match[]): PositionRotation[] {
  const byPos = new Map<string, Map<string, number>>();
  for (const match of matches) {
    for (const entry of match.lineup) {
      const pos = positionDef(entry.posicion)?.label || entry.posicion || 'Sin posición';
      if (!byPos.has(pos)) byPos.set(pos, new Map());
      const m = byPos.get(pos)!;
      m.set(entry.playerId, (m.get(entry.playerId) || 0) + 1);
    }
  }
  const result: PositionRotation[] = [];
  for (const [posicion, playerCounts] of byPos.entries()) {
    const jugadores = Array.from(playerCounts.entries())
      .map(([playerId, count]) => ({ playerId, count }))
      .sort((a, b) => b.count - a.count);
    const titularidadesTotales = jugadores.reduce((sum, j) => sum + j.count, 0);
    result.push({ posicion, titularidadesTotales, jugadoresDistintos: jugadores.length, jugadores });
  }
  return result.sort((a, b) => b.jugadoresDistintos - a.jugadoresDistintos);
}

export function recentPlayers(players: Player[], matches: Match[], windowSize: number): Player[] {
  const recent = lastN(matches, windowSize);
  const ids = new Set<string>();
  for (const match of recent) {
    for (const l of match.lineup) ids.add(l.playerId);
    for (const s of match.substitutions) ids.add(s.jugadorEntraId);
  }
  return players.filter((p) => ids.has(p.id));
}

export interface Counted<T> {
  item: T;
  count: number;
}

function countBy<T, K>(items: T[], keyFn: (t: T) => K | null): Counted<K>[] {
  const map = new Map<string, { item: K; count: number }>();
  for (const item of items) {
    const key = keyFn(item);
    if (key === null || key === undefined || key === '') continue;
    const k = JSON.stringify(key);
    if (!map.has(k)) map.set(k, { item: key, count: 0 });
    map.get(k)!.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function allSubstitutions(matches: Match[]): { match: Match; sub: Substitution }[] {
  const out: { match: Match; sub: Substitution }[] = [];
  for (const match of matches) {
    for (const sub of match.substitutions) out.push({ match, sub });
  }
  return out;
}

export function topEntrantes(matches: Match[]): Counted<string>[] {
  return countBy(allSubstitutions(matches), (x) => x.sub.jugadorEntraId);
}

export function topSalientes(matches: Match[]): Counted<string>[] {
  return countBy(allSubstitutions(matches), (x) => x.sub.jugadorSaleId);
}

// Quién ha reemplazado a un jugador puntual, sin importar el estado del
// partido (una lesión no depende de si el equipo va ganando o perdiendo,
// a diferencia de una sustitución táctica) — para "En Vivo", al marcar a
// alguien con problemas físicos.
export function sustitutosHistoricosDe(matches: Match[], jugadorId: string): Counted<string>[] {
  return countBy(
    allSubstitutions(matches).filter((x) => x.sub.jugadorSaleId === jugadorId),
    (x) => x.sub.jugadorEntraId
  );
}

export interface RevulsivoStat extends Counted<string> {
  minutoPromedio: number;
}

// Como topEntrantes/topSalientes pero agrega el minuto promedio en que cada
// jugador entra o sale, para distinguir "entra mucho" de "entra siempre cerca del final".
function conMinutoPromedio(
  subs: { match: Match; sub: Substitution }[],
  idFn: (sub: Substitution) => string
): RevulsivoStat[] {
  const porJugador = new Map<string, number[]>();
  for (const { sub } of subs) {
    const id = idFn(sub);
    if (!id) continue;
    if (!porJugador.has(id)) porJugador.set(id, []);
    porJugador.get(id)!.push(sub.minuto);
  }
  return Array.from(porJugador.entries())
    .map(([item, minutos]) => ({
      item,
      count: minutos.length,
      minutoPromedio: minutos.reduce((s, m) => s + m, 0) / minutos.length,
    }))
    .sort((a, b) => b.count - a.count);
}

export function topEntrantesConMinuto(matches: Match[]): RevulsivoStat[] {
  return conMinutoPromedio(allSubstitutions(matches), (s) => s.jugadorEntraId);
}

export function topSalientesConMinuto(matches: Match[]): RevulsivoStat[] {
  return conMinutoPromedio(allSubstitutions(matches), (s) => s.jugadorSaleId);
}

export interface SaleEntraCombo {
  jugadorSaleId: string;
  jugadorEntraId: string;
}

export function topCombosSaleEntra(matches: Match[]): Counted<SaleEntraCombo>[] {
  return countBy(allSubstitutions(matches), (x) => ({
    jugadorSaleId: x.sub.jugadorSaleId,
    jugadorEntraId: x.sub.jugadorEntraId,
  }));
}

export function minutoPromedioSustituciones(matches: Match[]): number {
  const subs = allSubstitutions(matches);
  if (subs.length === 0) return 0;
  return subs.reduce((sum, x) => sum + x.sub.minuto, 0) / subs.length;
}

// Promedio del minuto del PRIMER cambio de cada partido (no de todos los
// cambios juntos, a diferencia de minutoPromedioSustituciones): qué tan
// temprano suele reaccionar el entrenador, más que cuánto dura reaccionando
// en general.
export function minutoPromedioPrimerCambio(matches: Match[]): number {
  const primeros = matches
    .map((m) => (m.substitutions.length === 0 ? null : Math.min(...m.substitutions.map((s) => s.minuto))))
    .filter((m): m is number => m !== null);
  if (primeros.length === 0) return 0;
  return primeros.reduce((sum, m) => sum + m, 0) / primeros.length;
}

export interface TramoSustituciones {
  tramo: string;
  count: number;
}

const TRAMOS_SUSTITUCION: { tramo: string; min: number; max: number }[] = [
  { tramo: '0-45', min: 0, max: 45 },
  { tramo: '46-60', min: 46, max: 60 },
  { tramo: '61-75', min: 61, max: 75 },
  { tramo: '76-90', min: 76, max: Infinity },
];

// Reparto de las sustituciones en los 4 tramos habituales de un partido, en
// orden cronológico y con los tramos sin cambios también incluidos en 0
// (para poder mostrar el reparto completo, no solo los que tienen datos).
export function sustitucionesPorTramo(matches: Match[]): TramoSustituciones[] {
  const subs = allSubstitutions(matches);
  return TRAMOS_SUSTITUCION.map(({ tramo, min, max }) => ({
    tramo,
    count: subs.filter((x) => x.sub.minuto >= min && x.sub.minuto <= max).length,
  }));
}

// El tramo con más sustituciones (para el informe, que a diferencia de la
// app solo muestra uno en vez del reparto completo).
export function tramoMasFrecuente(matches: Match[]): TramoSustituciones | null {
  const conDatos = sustitucionesPorTramo(matches).filter((t) => t.count > 0);
  if (conDatos.length === 0) return null;
  return [...conDatos].sort((a, b) => b.count - a.count)[0];
}

// Se considera "cambio de sistema" cualquier sustitución que tenga un
// sistema resultante seleccionado (reemplaza a la antigua casilla booleana
// de "cambio táctico").
export function cambiosTacticos(matches: Match[]): { match: Match; sub: Substitution }[] {
  return allSubstitutions(matches).filter((x) => !!x.sub.sistemaResultante);
}

export function topSistemasResultantes(matches: Match[]): Counted<string>[] {
  return countBy(
    cambiosTacticos(matches).map((x) => x.sub),
    (s) => s.sistemaResultante || s.descripcion || null
  );
}

export function minutoPromedioCambiosTacticos(matches: Match[]): number {
  const subs = cambiosTacticos(matches);
  if (subs.length === 0) return 0;
  return subs.reduce((sum, x) => sum + x.sub.minuto, 0) / subs.length;
}

export function topCombosConCambioTactico(matches: Match[]): Counted<SaleEntraCombo>[] {
  const tactical = cambiosTacticos(matches).map((x) => x.sub);
  return countBy(tactical, (s) => ({ jugadorSaleId: s.jugadorSaleId, jugadorEntraId: s.jugadorEntraId }));
}

export type GameState = 'Ganando' | 'Empatando' | 'Perdiendo';

// Resultado parcial del propio rival en un minuto dado del partido, a partir
// de los goles registrados hasta ese minuto (inclusive).
export function gameStateAtMinute(match: Match, minuto: number): GameState {
  let favor = 0;
  let contra = 0;
  for (const e of match.events || []) {
    if (e.minuto > minuto) continue;
    if (e.tipo === 'gol_favor') favor += 1;
    if (e.tipo === 'gol_contra') contra += 1;
  }
  if (favor > contra) return 'Ganando';
  if (favor < contra) return 'Perdiendo';
  return 'Empatando';
}

export interface SubstitutionWithState {
  match: Match;
  sub: Substitution;
  estado: GameState;
}

export function substitutionsWithState(matches: Match[]): SubstitutionWithState[] {
  return allSubstitutions(matches).map(({ match, sub }) => ({ match, sub, estado: gameStateAtMinute(match, sub.minuto) }));
}

export function substitutionCountsByState(matches: Match[]): Record<GameState, number> {
  const result: Record<GameState, number> = { Ganando: 0, Empatando: 0, Perdiendo: 0 };
  for (const s of substitutionsWithState(matches)) result[s.estado] += 1;
  return result;
}

export function topCombosByState(matches: Match[], estado: GameState): Counted<SaleEntraCombo>[] {
  const subs = substitutionsWithState(matches).filter((s) => s.estado === estado);
  return countBy(subs, (s) => ({ jugadorSaleId: s.sub.jugadorSaleId, jugadorEntraId: s.sub.jugadorEntraId }));
}

export function minutoPromedioPorEstado(matches: Match[], estado: GameState): number {
  const subs = substitutionsWithState(matches).filter((s) => s.estado === estado);
  if (subs.length === 0) return 0;
  return subs.reduce((sum, s) => sum + s.sub.minuto, 0) / subs.length;
}

export interface CambioAsociado {
  playerId: string;
  posicionAntes: string;
  posicionDespues: string;
  count: number;
}

export interface ComboPrediccion {
  jugadorSaleId: string;
  jugadorEntraId: string;
  count: number;
  // Minuto promedio de ESTA combinación puntual, a diferencia de
  // minutoPromedioPorEstado (que promedia todas las sustituciones del
  // estado, sin distinguir cuál combinación fue cada una).
  minutoPromedio: number;
  // Si al hacer este cambio otro jugador (no el que sale/entra) suele
  // terminar en una posición distinta (ej. "entra Charrupí por Soto y
  // Berríos pasa a lateral"), el más frecuente de esos casos — se detecta
  // comparando el campograma justo antes del cambio contra el que haya
  // quedado registrado después (layoutResultante), cuando el analista lo
  // cargó al anotar la sustitución.
  cambioAsociado: CambioAsociado | null;
}

// Como topCombosByState + minutoPromedioPorEstado, pero por combinación
// puntual (no un promedio general del estado) y agregando el cambio de
// posición asociado más frecuente de cada combinación — para "En Vivo",
// donde interesa no solo quién suele salir/entrar sino cuándo y qué otro
// ajuste suele acompañarlo.
export function combosPrediccion(matches: Match[], estado: GameState): ComboPrediccion[] {
  const subsEstado = substitutionsWithState(matches).filter((s) => s.estado === estado);
  const porCombo = new Map<
    string,
    {
      jugadorSaleId: string;
      jugadorEntraId: string;
      minutos: number[];
      asociados: Map<string, CambioAsociado>;
    }
  >();

  for (const { match, sub } of subsEstado) {
    const key = `${sub.jugadorSaleId}|${sub.jugadorEntraId}`;
    if (!porCombo.has(key)) {
      porCombo.set(key, { jugadorSaleId: sub.jugadorSaleId, jugadorEntraId: sub.jugadorEntraId, minutos: [], asociados: new Map() });
    }
    const entry = porCombo.get(key)!;
    entry.minutos.push(sub.minuto);

    const antes = onFieldBefore(match, sub.minuto, sub.id);
    const despues = computeDefaultLayoutForSub(match, sub.id);
    const posicionAntesDe = new Map(antes.map((l) => [l.playerId, l.posicion]));
    for (const d of despues) {
      if (d.playerId === sub.jugadorSaleId || d.playerId === sub.jugadorEntraId) continue;
      const posicionAntes = posicionAntesDe.get(d.playerId);
      if (!posicionAntes || posicionAntes === d.posicion) continue;
      const akey = `${d.playerId}|${posicionAntes}|${d.posicion}`;
      if (!entry.asociados.has(akey)) {
        entry.asociados.set(akey, { playerId: d.playerId, posicionAntes, posicionDespues: d.posicion, count: 0 });
      }
      entry.asociados.get(akey)!.count += 1;
    }
  }

  return Array.from(porCombo.values())
    .map((e) => ({
      jugadorSaleId: e.jugadorSaleId,
      jugadorEntraId: e.jugadorEntraId,
      count: e.minutos.length,
      minutoPromedio: e.minutos.reduce((s, m) => s + m, 0) / e.minutos.length,
      cambioAsociado: Array.from(e.asociados.values()).sort((a, b) => b.count - a.count)[0] || null,
    }))
    .sort((a, b) => b.count - a.count);
}

// Igual que topSistemasResultantes, pero solo con los cambios de sistema que
// ocurrieron estando en ese estado de partido puntual (Ganando/Empatando/
// Perdiendo) — para "En Vivo", donde interesa a qué sistema suele pasar el
// rival cuando va perdiendo, no en general.
export function topSistemasResultantesByState(matches: Match[], estado: GameState): Counted<string>[] {
  const subs = substitutionsWithState(matches).filter((s) => s.estado === estado && !!s.sub.sistemaResultante);
  return countBy(subs, (s) => s.sub.sistemaResultante || s.sub.descripcion || null);
}

// Ventana, en minutos, dentro de la cual se considera que una sustitución
// "responde" a una tarjeta amarilla previa del mismo jugador (más allá de
// eso, ya no se puede atribuir la salida a la tarjeta con confianza).
const VENTANA_CAMBIO_TRAS_TARJETA = 20;

export interface CambioTrasTarjetaStat {
  totalTarjetas: number;
  seguidasDeCambio: number;
  pct: number;
  minutoPromedioCambio: number | null;
}

// De todas las tarjetas amarillas registradas, en qué porcentaje el propio
// jugador amonestado terminó saliendo dentro de los siguientes N minutos, y
// cuánto tardó en promedio — para "En Vivo": una alerta de "ojo, suelen
// sacarlo pronto" cuando se carga una amarilla en el partido en curso.
export function cambioTrasTarjeta(matches: Match[]): CambioTrasTarjetaStat {
  let total = 0;
  let seguidas = 0;
  const demoras: number[] = [];
  for (const match of matches) {
    for (const ev of match.events || []) {
      if (ev.tipo !== 'amarilla' || !ev.jugadorId) continue;
      total += 1;
      const salida = match.substitutions.find(
        (s) =>
          s.jugadorSaleId === ev.jugadorId &&
          s.minuto >= ev.minuto &&
          s.minuto - ev.minuto <= VENTANA_CAMBIO_TRAS_TARJETA
      );
      if (salida) {
        seguidas += 1;
        demoras.push(salida.minuto - ev.minuto);
      }
    }
  }
  return {
    totalTarjetas: total,
    seguidasDeCambio: seguidas,
    pct: total > 0 ? Math.round((seguidas / total) * 100) : 0,
    minutoPromedioCambio: demoras.length > 0 ? demoras.reduce((s, d) => s + d, 0) / demoras.length : null,
  };
}

export function topSistemasFormacion(matches: Match[]): Counted<string>[] {
  return countBy(matches, (m) => m.sistema || null);
}

export interface SistemaConBalance extends Counted<string>, RecordGEP {}

// Igual que topSistemasFormacion, pero con el rendimiento (V-E-P) que tuvo el
// rival cada vez que jugó con ese sistema, para ver si su formación más usada
// es también la más efectiva.
export function balancePorSistema(matches: Match[]): SistemaConBalance[] {
  return topSistemasFormacion(matches).map((s) => ({
    ...s,
    ...recordGEP(matches.filter((m) => m.sistema === s.item)),
  }));
}

export interface XISlotPick {
  posicion: string;
  player: Player;
  score: number;
  // Si la regla del torneo forzó un cambio en esta posición, quién habría
  // sido el pick natural (por minutos/posición) de no ser por la regla.
  reemplazadoPorRegla?: Player;
}

export interface XIEstimate {
  picks: XISlotPick[];
  // Posiciones para las que la historia reciente pide un jugador pero no hay
  // ningún candidato disponible (todos de baja o sin minutos registrados).
  sinCobertura: string[];
  excluidos: Player[];
}

// Encuentra la regla del rival cuyo `torneo` coincide (sin distinguir
// mayúsculas ni espacios extra) con el nombre de competencia dado, por
// ejemplo el del próximo partido (rival.proximoPartido.competicion).
export function findReglaTorneo(reglas: TorneoRegla[] | undefined, torneo: string | undefined): TorneoRegla | null {
  if (!reglas || !torneo || !torneo.trim()) return null;
  const target = torneo.trim().toLowerCase();
  return reglas.find((r) => r.torneo.trim().toLowerCase() === target) || null;
}

// Todo Sub-18 es, por edad, también Sub-21 — cuenta para el cupo aunque el
// jugador no tenga marcada la casilla `sub21` por separado.
function esFormativo(p: Player): boolean {
  return p.sub21 || p.sub18;
}

// Un partido "normal" sin alargue, para derivar un mínimo de jugadores a
// partir de un mínimo de MINUTOS Sub-21 (ver minMinutosSub21): nadie llega
// solo a, por ejemplo, 130' en un partido de 90', así que en la práctica
// esa regla exige ceil(130/90) = 2 titulares Sub-21, no 1.
const DURACION_PARTIDO_ESTANDAR = 90;

// Algunos torneos reducen el mínimo de Sub-21 exigido cuando el plantel tiene
// jugadores convocados a una selección nacional (regla.exencionPorSeleccionado
// por cada uno). Solo cuentan los que están disponibles (no de baja).
function minSub21Efectivo(regla: TorneoRegla, players: Player[]): number | null {
  // minMinutosSub21 (una suma de minutos por partido, ej. Copa Chile 130')
  // manda sobre minSub21 (cantidad fija) cuando ambos vienen cargados — ver
  // el comentario en TorneoRegla.minMinutosSub21.
  const base =
    regla.minMinutosSub21 != null
      ? Math.ceil(regla.minMinutosSub21 / DURACION_PARTIDO_ESTANDAR)
      : regla.minSub21;
  if (base == null) return null;
  const seleccionados = players.filter((p) => p.enSeleccion && !p.baja).length;
  const exencion = (regla.exencionPorSeleccionado || 0) * seleccionados;
  return Math.max(0, base - exencion);
}

export interface ReglaTorneoCheck {
  regla: TorneoRegla;
  extranjerosEnXI: number;
  sub21EnXI: number;
  // Mínimo de Sub-21 realmente exigido, ya descontada la exención por
  // jugadores en selección (ver minSub21Efectivo). null = sin mínimo.
  minSub21Exigido: number | null;
  cumpleExtranjeros: boolean;
  cumpleSub21: boolean;
}

// Contrasta una lista de jugadores en cancha (ej. el XI ya ajustado por la
// regla) contra la regla de cupos del torneo, para detectar si igual quedó
// incumplida (ej. no había suficientes Sub-21 disponibles para cubrir el
// mínimo pedido). `players` es el plantel completo del rival, usado para
// calcular la exención por jugadores en selección.
export function checkReglaTorneo(
  picks: { player: Player }[],
  regla: TorneoRegla | null,
  players: Player[] = []
): ReglaTorneoCheck | null {
  if (!regla) return null;
  const extranjerosEnXI = picks.filter((p) => p.player.extranjero).length;
  const sub21EnXI = picks.filter((p) => esFormativo(p.player)).length;
  const minSub21Exigido = minSub21Efectivo(regla, players);
  return {
    regla,
    extranjerosEnXI,
    sub21EnXI,
    minSub21Exigido,
    cumpleExtranjeros: regla.maxExtranjeros == null || extranjerosEnXI <= regla.maxExtranjeros,
    cumpleSub21: minSub21Exigido == null || sub21EnXI >= minSub21Exigido,
  };
}

// Ajusta los picks de un XI (ya elegidos por minutos/posición) para cumplir
// la regla de cupos del torneo: si hay más extranjeros que el máximo, cambia
// a los de menor puntaje por el mejor candidato disponible no-extranjero en
// esa misma posición; si faltan Sub-21 (contando Sub-18) para el mínimo,
// cambia a los picks de menor puntaje que no sean formativos por el mejor
// candidato formativo disponible en esa posición, cuidando de no volver a
// pasarse del máximo de extranjeros en el intento. El mínimo de Sub-21 usado
// es el efectivo (ver minSub21Efectivo): se reduce si el plantel tiene
// jugadores en selección y la regla define una exención por eso — ese conteo
// usa `players` (el plantel completo) y no `scored`, porque los convocados a
// selección ya vienen excluidos de `scored` (no pueden jugar el partido) pero
// igual deben contar para la exención. Cuando no hay candidato disponible
// para un cambio, ese pick se deja igual (mejor esfuerzo).
// Cuántas veces fue titular en partidos de esa competencia puntual, pesado
// por recencia DENTRO de esa competencia (no de la ventana general): para
// elegir a quién sumar por una regla de cupos de un torneo específico (ej.
// Sub-21 en Copa Chile) importa mucho más quién arranca de titular ahí
// habitualmente que los minutos totales acumulados, que arrastran partidos
// de OTRA competencia donde el jugador puede ser titular fijo sin relación
// con este cupo (ver el caso real que motivó esto: un Sub-21 que es titular
// fijo en la liga le ganaba en minutos a uno que arrancó las últimas 2
// fechas de Copa Chile, solo por jugar mucho más en un torneo aparte). Se
// usa TODO el historial del rival, no la ventana de 10 partidos mixtos,
// porque los partidos de una competencia puntual (ej. una copa) pueden caer
// fuera de esa ventana general si se juega con poca frecuencia.
function scoreTitularidadCompetencia(playerId: string, matchesDesc: Match[], competencia: string): number {
  const relevantes = matchesDesc.filter((m) => m.competencia?.trim().toLowerCase() === competencia.trim().toLowerCase());
  const n = relevantes.length;
  let score = 0;
  relevantes.forEach((m, idx) => {
    if (m.lineup.some((l) => l.playerId === playerId)) score += n - idx;
  });
  return score;
}

function aplicarReglaTorneo(
  picks: XISlotPick[],
  scored: { player: Player; score: number; posicion: string }[],
  regla: TorneoRegla | null,
  players: Player[],
  matchesAll: Match[] = []
): XISlotPick[] {
  if (!regla) return picks;
  const result = picks.map((p) => ({ ...p }));

  // Si hay partidos jugados en la competencia exacta de esta regla, se
  // ordena a los candidatos por titularidad reciente EN esa competencia
  // (ver scoreTitularidadCompetencia) antes que por el score general — así
  // no se termina eligiendo a alguien que casi no juega esa competencia
  // puntual solo porque acumula más minutos en otra. Sin partidos de esa
  // competencia todavía, se cae al score general de siempre.
  const matchesDesc = sortMatchesDesc(matchesAll);
  const hayPartidosDeEstaCompetencia = matchesDesc.some(
    (m) => m.competencia?.trim().toLowerCase() === regla.torneo.trim().toLowerCase()
  );

  // Sin exigir score > 0: la regla del torneo obliga a alinear al jugador
  // igual aunque no haya sumado minutos recientes (ej. no fue citado al
  // último partido), a diferencia de un pick "natural" por desempeño.
  const mejorCandidato = (posicion: string, usedIds: Set<string>, predicate: (p: Player) => boolean) =>
    scored
      .filter((s) => s.posicion === posicion && !usedIds.has(s.player.id) && predicate(s.player))
      .sort((a, b) => {
        if (hayPartidosDeEstaCompetencia) {
          const diff =
            scoreTitularidadCompetencia(b.player.id, matchesDesc, regla.torneo) -
            scoreTitularidadCompetencia(a.player.id, matchesDesc, regla.torneo);
          if (diff !== 0) return diff;
        }
        return b.score - a.score;
      })[0];

  const aplicarCambio = (index: number, candidato: { player: Player; score: number }) => {
    const original = result[index];
    result[index] = {
      posicion: original.posicion,
      player: candidato.player,
      score: candidato.score,
      reemplazadoPorRegla: original.reemplazadoPorRegla ?? original.player,
    };
  };

  if (regla.maxExtranjeros != null) {
    let extranjerosCount = result.filter((p) => p.player.extranjero).length;
    const idxAsc = result
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.player.extranjero)
      .sort((a, b) => a.p.score - b.p.score);
    for (const { i } of idxAsc) {
      if (extranjerosCount <= regla.maxExtranjeros) break;
      const usedIds = new Set(result.map((r) => r.player.id));
      const candidato = mejorCandidato(result[i].posicion, usedIds, (pl) => !pl.extranjero);
      if (candidato) {
        aplicarCambio(i, candidato);
        extranjerosCount -= 1;
      }
    }
  }

  const minSub21 = minSub21Efectivo(regla, players);
  if (minSub21 != null) {
    let formativosCount = result.filter((p) => esFormativo(p.player)).length;
    const usedIds = new Set(result.map((r) => r.player.id));
    // A diferencia del ajuste de extranjeros (donde ya se sabe qué pick
    // puntual sobra), acá no hay un "culpable" puntual: se recorre a los
    // MEJORES candidatos formativos disponibles (por titularidad reciente
    // en esta competencia, mismo criterio que mejorCandidato) y a cada uno
    // se lo ubica en SU posición natural — no en la del pick con menor
    // puntaje del equipo, que puede ser una posición totalmente distinta a
    // la que ese candidato realmente juega (ver el comentario de
    // scoreTitularidadCompetencia: así se evita forzar a un Sub-21 a una
    // posición ajena solo porque ahí es donde el equipo puntúa más bajo).
    const candidatosFormativos = scored
      .filter((s) => esFormativo(s.player) && !usedIds.has(s.player.id))
      .sort((a, b) => {
        if (hayPartidosDeEstaCompetencia) {
          const diff =
            scoreTitularidadCompetencia(b.player.id, matchesDesc, regla.torneo) -
            scoreTitularidadCompetencia(a.player.id, matchesDesc, regla.torneo);
          if (diff !== 0) return diff;
        }
        return b.score - a.score;
      });

    for (const candidato of candidatosFormativos) {
      if (formativosCount >= minSub21) break;
      const objetivo = result
        .map((p, i) => ({ p, i }))
        .filter((x) => !esFormativo(x.p.player) && x.p.posicion === candidato.posicion)
        .sort((a, b) => a.p.score - b.p.score)[0];
      if (!objetivo) continue;
      const extranjerosCount = result.filter((p) => p.player.extranjero).length;
      if (
        regla.maxExtranjeros != null &&
        candidato.player.extranjero &&
        !objetivo.p.player.extranjero &&
        extranjerosCount >= regla.maxExtranjeros
      ) {
        continue;
      }
      aplicarCambio(objetivo.i, candidato);
      formativosCount += 1;
      usedIds.add(candidato.player.id);
    }
  }

  return result;
}

function modeOf(nums: number[]): number {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  let best = nums[0] ?? 0;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

// Cuántos jugadores suele haber por posición en el XI, según los partidos
// recientes (la moda de las veces que aparece cada posición por partido).
function slotCountsFromHistory(matches: Match[]): Record<string, number> {
  const perMatchCounts = new Map<string, number[]>();
  for (const match of matches) {
    const counts = new Map<string, number>();
    for (const entry of match.lineup) {
      const label = positionDef(entry.posicion)?.label;
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    for (const [label, count] of counts) {
      if (!perMatchCounts.has(label)) perMatchCounts.set(label, []);
      perMatchCounts.get(label)!.push(count);
    }
  }
  const result: Record<string, number> = {};
  for (const label of POSITION_LABELS) {
    const arr = perMatchCounts.get(label);
    result[label] = arr && arr.length > 0 ? modeOf(arr) : 0;
  }
  return result;
}

// Cuánto pesa un partido puntual al proyectar el próximo (para elegir
// sistema, puntuar jugadores y decidir a quién sumar por la regla de
// cupos): más peso cuanto más reciente (igual que antes), MÁS un refuerzo
// si el partido fue de la misma competencia que se viene jugar. Un equipo
// suele rotar bastante entre torneos (ej. plantel B en Copa Chile) — sin
// este refuerzo, la ventana general mezclaba ambos y terminaba proyectando
// con el plantel equivocado.
//
// Es un refuerzo, no un filtro estricto por competencia: un partido viejo
// de la misma competencia (ej. de hace 5 meses) no debería pesar más que
// uno reciente de la otra, porque las planillas cambian con el tiempo —
// por eso se multiplica el peso por recencia en vez de filtrar la ventana
// a "solo partidos de esa competencia".
const REFUERZO_MISMA_COMPETENCIA = 4;

function pesoPartido(idx: number, n: number, match: Match, competenciaProxima?: string): number {
  const base = n - idx;
  const mismaCompetencia =
    !!competenciaProxima &&
    !!match.competencia &&
    match.competencia.trim().toLowerCase() === competenciaProxima.trim().toLowerCase();
  return base * (mismaCompetencia ? REFUERZO_MISMA_COMPETENCIA : 1);
}

// Las 11 posiciones vienen de una votación pesada (ver pesoPartido) entre
// los sistemas jugados en la ventana reciente, no del sistema más usado en
// bruto: así un cambio de sistema reciente (o el que suelen usar en la
// competencia que se viene) pesa más que uno viejo, sin descartar del todo
// el resto del historial. Si ningún partido de la ventana tiene sistema
// cargado se usa la moda histórica por posición como respaldo.
function slotCountsForEstimate(recent: Match[], competenciaProxima?: string): Record<string, number> {
  const n = recent.length;
  const pesos = new Map<string, number>();
  recent.forEach((match, idx) => {
    if (!match.sistema) return;
    pesos.set(match.sistema, (pesos.get(match.sistema) || 0) + pesoPartido(idx, n, match, competenciaProxima));
  });
  let dominante: string | null = null;
  let mejorPeso = 0;
  for (const [sistema, peso] of pesos) {
    if (peso > mejorPeso) {
      dominante = sistema;
      mejorPeso = peso;
    }
  }
  const template = dominante ? formationSlots(dominante) : null;
  if (template) {
    const counts: Record<string, number> = {};
    for (const label of template) counts[label] = (counts[label] || 0) + 1;
    return counts;
  }
  return slotCountsFromHistory(recent);
}

// Todas las posiciones en las que un jugador apareció en el XI durante los
// partidos recientes, con cuántas veces jugó en cada una — no solo la más
// habitual (ver playerTypicalPosition), para poder buscar a alguien que haya
// jugado una posición puntual alguna vez aunque no sea la que juega más.
function playerPositionsPlayed(playerId: string, matchesDesc: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of matchesDesc) {
    const entry = match.lineup.find((l) => l.playerId === playerId);
    if (entry) {
      const label = positionDef(entry.posicion)?.label || entry.posicion;
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return counts;
}

// Posición más frecuente de un jugador en los partidos recientes (o su
// posición de ficha si nunca ha sido registrado en un XI).
function playerTypicalPosition(playerId: string, matchesDesc: Match[]): string | null {
  const counts = playerPositionsPlayed(playerId, matchesDesc);
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Si un jugador estuvo en el XI, entró de cambio, o quedó en la banca de un
// partido puntual: cualquiera de las tres cuenta como "fue citado".
function fueCitado(playerId: string, match: Match): boolean {
  if (match.lineup.some((l) => l.playerId === playerId)) return true;
  if (match.substitutions.some((s) => s.jugadorEntraId === playerId)) return true;
  if ((match.banca || []).includes(playerId)) return true;
  return false;
}

// Si ya se cargó la convocatoria de un partido (XI o banca), para no tratar
// como "no citado" a todo el plantel cuando en realidad es que ese partido
// todavía no se registró.
function convocatoriaCargada(match: Match): boolean {
  return match.lineup.length > 0 || (match.banca || []).length > 0;
}

// Estimación simple (no una predicción táctica) del XI para el próximo
// partido: para cada posición habitual, elige a quién más minutos ha sumado
// recientemente, dando más peso a los partidos más recientes que a los
// antiguos, y excluye a quienes están marcados como baja ahora mismo, están
// convocados a una selección nacional (no van a estar disponibles para el
// club) o no fueron citados al partido más reciente (salvo que haya sido por
// una suspensión, que ya se debería haber cumplido para el próximo partido).
// Si una posición queda sin nadie que la juegue habitualmente entre los
// citados recientes, se completa con el mejor candidato disponible que haya
// jugado ahí alguna vez (aunque no sea citado ni su posición principal)
// antes de darla por sin cobertura.
export function estimateNextXI(
  players: Player[],
  matches: Match[],
  regla: TorneoRegla | null = null,
  competenciaProxima?: string
): XIEstimate {
  const recent = lastN(matches, 10);
  const excluidosPorBaja = players.filter((p) => p.baja);
  const excluidosPorSeleccion = players.filter((p) => p.enSeleccion && !p.baja);

  const ultimoConvocatoria = recent.find(convocatoriaCargada);
  const excluidosPorNoCitado: Player[] = [];
  const noCitadoIds = new Set<string>();
  if (ultimoConvocatoria) {
    for (const p of players) {
      if (p.baja || p.enSeleccion || fueCitado(p.id, ultimoConvocatoria)) continue;
      const baja = ultimoConvocatoria.bajas.find((b) => b.jugadorId === p.id);
      if (baja?.tipo === 'suspension') continue; // ya se debería haber cumplido
      excluidosPorNoCitado.push(p);
      noCitadoIds.add(p.id);
    }
  }

  const available = players.filter((p) => !p.baja && !p.enSeleccion && !noCitadoIds.has(p.id));
  const n = recent.length;

  const scoreFor = (player: Player) => {
    let score = 0;
    recent.forEach((match, idx) => {
      score += pesoPartido(idx, n, match, competenciaProxima) * participationFor(player, match).minutos;
    });
    return { player, score, posicion: playerTypicalPosition(player.id, recent) || player.posicion };
  };

  const scored = available.map(scoreFor);

  // Plantel disponible para el club en general (ni de baja ni convocado a
  // selección), sin filtrar por si fue citado al último partido: sirve tanto
  // para rellenar posiciones sin cobertura como para forzar el cumplimiento
  // de la regla del torneo (ver más abajo).
  const scoredDisponibles = players.filter((p) => !p.baja && !p.enSeleccion).map(scoreFor);

  const slotCounts = slotCountsForEstimate(recent, competenciaProxima);
  const used = new Set<string>();
  const picks: XISlotPick[] = [];
  const sinCoberturaInicial: string[] = [];

  for (const posicion of Object.keys(slotCounts)) {
    const count = slotCounts[posicion] || 0;
    if (count === 0) continue;
    const candidates = scored
      .filter((s) => s.posicion === posicion && s.score > 0 && !used.has(s.player.id))
      .sort((a, b) => b.score - a.score);
    for (let i = 0; i < count; i++) {
      const candidate = candidates[i];
      if (candidate) {
        picks.push({ posicion, player: candidate.player, score: candidate.score });
        used.add(candidate.player.id);
      } else {
        sinCoberturaInicial.push(posicion);
      }
    }
  }

  // Para forzar el cumplimiento de la regla del torneo se busca reemplazo en
  // TODO el plantel disponible para el club (se descarta a quien está de
  // baja o convocado a selección), no solo entre quienes fueron citados al
  // último partido: un cupo obligatorio de Sub-21 se debe cubrir igual
  // aunque el candidato natural no haya sido de la partida recientemente.
  // Esto va ANTES de rellenar las posiciones sin cobertura porque un cambio
  // forzado por la regla puede liberar a alguien (ej. un extranjero que
  // sale) que resulta ser la mejor alternativa para esa posición vacía.
  const picksConRegla = aplicarReglaTorneo(picks, scoredDisponibles, regla, players, matches);

  // Una posición sin cobertura (nadie citado recientemente la tiene como su
  // posición más habitual) no debe quedar vacía si hay alternativa: se busca
  // en TODO el plantel disponible para el club (aunque no haya sido citado
  // al último partido, o haya quedado libre por un cambio de la regla) a
  // quien haya jugado esa posición alguna vez en los partidos recientes,
  // aunque no sea la que juega más seguido, priorizando a quien más minutos
  // recientes acumula.
  const sinCobertura: string[] = [];
  const picksFinal = [...picksConRegla];
  for (const posicion of sinCoberturaInicial) {
    const usedIds = new Set(picksFinal.map((p) => p.player.id));
    const candidato = scoredDisponibles
      .filter((s) => !usedIds.has(s.player.id) && playerPositionsPlayed(s.player.id, recent).has(posicion))
      .sort((a, b) => b.score - a.score)[0];
    if (candidato) {
      picksFinal.push({ posicion, player: candidato.player, score: candidato.score });
    } else {
      sinCobertura.push(posicion);
    }
  }

  const idsEnXI = new Set(picksFinal.map((p) => p.player.id));
  const excluidos = [...excluidosPorBaja, ...excluidosPorSeleccion, ...excluidosPorNoCitado].filter(
    (p) => !idsEnXI.has(p.id)
  );

  return { picks: picksFinal, sinCobertura, excluidos };
}

export function formatMinutes(min: number): string {
  return `${Math.round(min)}'`;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(0)}%`;
}
