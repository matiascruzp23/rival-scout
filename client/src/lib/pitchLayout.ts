import type { LineupEntry, Match, MatchEvent, Substitution } from '../types';
import { defaultCoordsFor, symmetrizeBackThree, symmetrizeDoublePivote, symmetrizeForwardPair } from './positions';

type MatchLineupData = Pick<Match, 'lineup' | 'substitutions' | 'events'>;

interface MinuteCheckpoint {
  minuto: number;
  layout: LineupEntry[];
  subs: Substitution[];
  rojas: MatchEvent[];
}

export interface LayoutCheckpoint {
  minuto: number;
  label: string;
  layout: LineupEntry[];
  // Puede haber más de un cambio en el mismo minuto (dobles cambios,
  // sustitución + tarjeta roja, etc.): todos quedan agrupados en un solo hito.
  subs: Substitution[];
  rojas: MatchEvent[];
  // Resultado parcial acumulado hasta este minuto, para dar contexto de en
  // qué situación de marcador se dio el cambio.
  marcador: { favor: number; contra: number };
}

function marcadorHasta(events: MatchEvent[], minuto: number): { favor: number; contra: number } {
  let favor = 0;
  let contra = 0;
  for (const e of events) {
    if (e.minuto > minuto) continue;
    if (e.tipo === 'gol_favor') favor += 1;
    else if (e.tipo === 'gol_contra') contra += 1;
  }
  return { favor, contra };
}

// Completa coordenadas por defecto a las entradas que no tengan (conserva
// cualquier campo extra de cada entrada, útil para rastrear su índice).
export function withDefaults<T extends LineupEntry>(rawLineup: T[]): T[] {
  const lineup = dedupeLayout(rawLineup);
  const placed: T[] = [];
  // Si ninguno de los dos delanteros tiene coordenada guardada todavía, se
  // resuelven juntos al final (simétricos); si alguno ya se movió a mano en
  // el campograma, esa posición manual se respeta y no se toca.
  const sinCoord = (e: LineupEntry) => e.x === undefined || e.y === undefined;
  const dcEntry = lineup.find((e) => e.posicion === 'Delantero centro');
  const sdEntry = lineup.find((e) => e.posicion === 'Segundo delantero');
  const parSimetrico = !!dcEntry && !!sdEntry && sinCoord(dcEntry) && sinCoord(sdEntry);

  // Mismo criterio para el doble pivote de un 4-2-3-1 (Medio centro derecho +
  // Medio centro izquierdo sin Volante central): si ninguno tiene coordenada
  // guardada, se ajustan juntos al ancho de los centrales.
  const hasVolanteCentral = lineup.some((e) => e.posicion === 'Volante central');
  const interDerEntry = lineup.find((e) => e.posicion === 'Medio centro derecho');
  const interIzqEntry = lineup.find((e) => e.posicion === 'Medio centro izquierdo');
  const parPivote =
    !hasVolanteCentral &&
    !!interDerEntry &&
    !!interIzqEntry &&
    sinCoord(interDerEntry) &&
    sinCoord(interIzqEntry);

  // Línea de 3 (Central derecho + Central + Central izquierdo): igual
  // criterio, pero "Central" en sí no se toca, solo los dos de afuera.
  const centralEntry = lineup.find((e) => e.posicion === 'Central');
  const centralDerEntry = lineup.find((e) => e.posicion === 'Central derecho');
  const centralIzqEntry = lineup.find((e) => e.posicion === 'Central izquierdo');
  const parBackThree =
    !!centralEntry &&
    !!centralDerEntry &&
    !!centralIzqEntry &&
    sinCoord(centralDerEntry) &&
    sinCoord(centralIzqEntry);

  for (const entry of lineup) {
    if (parSimetrico && (entry === dcEntry || entry === sdEntry)) continue;
    if (parPivote && (entry === interDerEntry || entry === interIzqEntry)) continue;
    if (parBackThree && (entry === centralDerEntry || entry === centralIzqEntry)) continue;
    if (entry.x !== undefined && entry.y !== undefined) {
      placed.push(entry);
    } else {
      const { x, y } = defaultCoordsFor(entry.posicion, placed);
      placed.push({ ...entry, x, y });
    }
  }

  if (parSimetrico && dcEntry && sdEntry) {
    placed.push({ ...dcEntry, x: 0, y: 0 }, { ...sdEntry, x: 0, y: 0 });
    symmetrizeForwardPair(placed.slice(-2));
  }

  if (parPivote && interDerEntry && interIzqEntry) {
    placed.push({ ...interDerEntry, x: 0, y: 0 }, { ...interIzqEntry, x: 0, y: 0 });
    symmetrizeDoublePivote(placed.slice(-2));
  }

  if (parBackThree && centralEntry && centralDerEntry && centralIzqEntry) {
    const der = { ...centralDerEntry, x: 0, y: 0 };
    const izq = { ...centralIzqEntry, x: 0, y: 0 };
    symmetrizeBackThree([centralEntry, der, izq]);
    placed.push(der, izq);
  }

  return placed;
}

// Un jugador no puede estar dos veces en cancha. Puede pasar con datos
// inconsistentes (p. ej. dos cambios en el mismo minuto cuya distribución
// ajustada ya incluía al que entra en el otro cambio): se conserva la primera
// aparición, priorizando la que tiene posición asignada.
function dedupeLayout<T extends LineupEntry>(layout: T[]): T[] {
  const result: T[] = [];
  for (const entry of layout) {
    if (!entry.playerId) {
      result.push(entry);
      continue;
    }
    const prevIdx = result.findIndex((e) => e.playerId === entry.playerId);
    if (prevIdx === -1) result.push(entry);
    else if (!result[prevIdx].posicion && entry.posicion) result[prevIdx] = entry;
  }
  return result;
}

function deriveAfterSub(prevLayout: LineupEntry[], sub: Substitution): LineupEntry[] {
  const idx = prevLayout.findIndex((e) => e.playerId === sub.jugadorSaleId);
  // Si el que entra ya figura en cancha (el cambio ya quedó reflejado en una
  // distribución ajustada previa), no se agrega de nuevo.
  if (idx === -1 && prevLayout.some((e) => e.playerId === sub.jugadorEntraId)) return prevLayout;
  if (idx === -1) {
    // El jugador que sale no estaba en la cancha según los datos registrados;
    // se agrega igualmente al que entra en una posición por defecto.
    const { x, y } = defaultCoordsFor(sub.posicionEntra, prevLayout);
    return [...prevLayout, { playerId: sub.jugadorEntraId, posicion: sub.posicionEntra || '', x, y }];
  }
  const next = [...prevLayout];
  next[idx] = {
    playerId: sub.jugadorEntraId,
    posicion: sub.posicionEntra || next[idx].posicion,
    x: next[idx].x,
    y: next[idx].y,
  };
  return next;
}

// Una tarjeta roja no reemplaza al jugador: el equipo queda con uno menos en
// cancha, así que simplemente se retira su ficha del campograma.
function deriveAfterRedCard(prevLayout: LineupEntry[], event: MatchEvent): LineupEntry[] {
  if (!event.jugadorId) return prevLayout;
  return prevLayout.filter((e) => e.playerId !== event.jugadorId);
}

// Hitos por minuto: todos los cambios (sustituciones y rojas) de un mismo
// minuto se aplican juntos y comparten una sola distribución ajustada, porque
// el orden entre ellos es ambiguo y en la cancha ocurren a la vez.
function buildMinuteTimeline(match: MatchLineupData): MinuteCheckpoint[] {
  const minutos = new Set<number>(match.substitutions.map((s) => s.minuto));
  const rojas = (match.events || []).filter((e) => e.tipo === 'roja' && e.jugadorId);
  for (const e of rojas) minutos.add(e.minuto);

  const checkpoints: MinuteCheckpoint[] = [];
  let current = withDefaults(match.lineup);
  for (const minuto of [...minutos].sort((a, b) => a - b)) {
    const subs = match.substitutions.filter((s) => s.minuto === minuto);
    const rojasMin = rojas.filter((e) => e.minuto === minuto);
    let derived = current;
    for (const sub of subs) derived = deriveAfterSub(derived, sub);
    for (const event of rojasMin) derived = deriveAfterRedCard(derived, event);
    const saved = [...subs].reverse().find((s) => s.layoutResultante && s.layoutResultante.length > 0)?.layoutResultante;
    const layout = saved ? applySavedLayout(derived, saved) : derived;
    checkpoints.push({ minuto, layout, subs, rojas: rojasMin });
    current = layout;
  }
  return checkpoints;
}

// La distribución ajustada a mano solo aporta posiciones y coordenadas: quién
// está en cancha lo deciden siempre los cambios registrados. Así, si después
// se edita un cambio (o se agrega otro en el mismo minuto), el campograma no
// muestra jugadores de más ni de menos.
function applySavedLayout(derived: LineupEntry[], saved: LineupEntry[]): LineupEntry[] {
  const byPlayer = new Map(dedupeLayout(saved).map((e) => [e.playerId, e]));
  return derived.map((e) => {
    const s = byPlayer.get(e.playerId);
    if (!s) return e;
    return { ...e, posicion: s.posicion || e.posicion, x: s.x ?? e.x, y: s.y ?? e.y };
  });
}

// Construye los hitos del campograma para navegar el partido: el XI inicial
// y uno por cada minuto en que hubo cambios.
export function buildLayoutTimeline(match: MatchLineupData): LayoutCheckpoint[] {
  const events = match.events || [];
  return [
    { minuto: 0, label: 'Inicio', layout: withDefaults(match.lineup), subs: [], rojas: [], marcador: marcadorHasta(events, 0) },
    ...buildMinuteTimeline(match).map((cp) => ({
      ...cp,
      label: `Min. ${cp.minuto}'`,
      marcador: marcadorHasta(events, cp.minuto),
    })),
  ];
}

// Quiénes están efectivamente en cancha justo antes de que ocurra un cambio
// puntual (para no dejar "salir" a alguien que ya salió antes, ni omitir a
// quien entró en un cambio previo). Los cambios en el mismo minuto que el
// que se está editando no se aplican, porque su orden entre sí es ambiguo.
export function onFieldBefore(match: MatchLineupData, minuto: number, excludeSubId?: string): LineupEntry[] {
  const filtered: MatchLineupData = { ...match, substitutions: match.substitutions.filter((s) => s.id !== excludeSubId) };
  const fine = buildMinuteTimeline(filtered);
  let result = withDefaults(filtered.lineup);
  for (const cp of fine) {
    if (cp.minuto < minuto) result = cp.layout;
    else break;
  }
  return result;
}

export function layoutAtMinute(match: MatchLineupData, minuto: number): LineupEntry[] {
  const fine = buildMinuteTimeline(match);
  let result = withDefaults(match.lineup);
  for (const cp of fine) {
    if (cp.minuto <= minuto) result = cp.layout;
    else break;
  }
  return result;
}

// Distribución tras todos los cambios del minuto de una sustitución (con el
// ajuste manual guardado, si hay), usada para precargar el editor de
// campograma de ese minuto.
export function computeDefaultLayoutForSub(match: MatchLineupData, subId: string): LineupEntry[] {
  const sub = match.substitutions.find((s) => s.id === subId);
  const cp = sub && buildMinuteTimeline(match).find((c) => c.minuto === sub.minuto);
  return cp ? cp.layout : withDefaults(match.lineup);
}
