import type { LineupEntry, Match, MatchEvent, Substitution } from '../types';
import { defaultCoordsFor, symmetrizeBackThree, symmetrizeDoublePivote, symmetrizeForwardPair } from './positions';

type MatchLineupData = Pick<Match, 'lineup' | 'substitutions' | 'events'>;

type ChangeItem =
  | { kind: 'sub'; minuto: number; sub: Substitution }
  | { kind: 'roja'; minuto: number; event: MatchEvent };

interface FineCheckpoint {
  minuto: number;
  layout: LineupEntry[];
  change: ChangeItem;
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

function withDefaults(lineup: LineupEntry[]): LineupEntry[] {
  const placed: LineupEntry[] = [];
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

function deriveAfterSub(prevLayout: LineupEntry[], sub: Substitution): LineupEntry[] {
  const idx = prevLayout.findIndex((e) => e.playerId === sub.jugadorSaleId);
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

function buildChangeList(match: MatchLineupData): ChangeItem[] {
  const subs: ChangeItem[] = match.substitutions.map((sub) => ({ kind: 'sub' as const, minuto: sub.minuto, sub }));
  const rojas: ChangeItem[] = (match.events || [])
    .filter((e) => e.tipo === 'roja' && e.jugadorId)
    .map((event) => ({ kind: 'roja' as const, minuto: event.minuto, event }));
  return [...subs, ...rojas].sort((a, b) => a.minuto - b.minuto);
}

// Secuencia fina de cambios: uno por cada sustitución o tarjeta roja, en
// orden cronológico, cada uno aplicado sobre el resultado del anterior.
function buildFineTimeline(match: MatchLineupData): FineCheckpoint[] {
  const initial = withDefaults(match.lineup);
  const changes = buildChangeList(match);
  const checkpoints: FineCheckpoint[] = [];
  let current = initial;
  for (const change of changes) {
    const layout =
      change.kind === 'sub'
        ? change.sub.layoutResultante && change.sub.layoutResultante.length > 0
          ? withDefaults(change.sub.layoutResultante)
          : deriveAfterSub(current, change.sub)
        : deriveAfterRedCard(current, change.event);
    checkpoints.push({ minuto: change.minuto, layout, change });
    current = layout;
  }
  return checkpoints;
}

// Construye los hitos del campograma para navegar el partido: el XI inicial
// y uno por cada minuto en que hubo cambios (sustituciones y/o tarjetas
// rojas agrupadas si coinciden en el mismo minuto).
export function buildLayoutTimeline(match: MatchLineupData): LayoutCheckpoint[] {
  const initial = withDefaults(match.lineup);
  const fine = buildFineTimeline(match);
  const events = match.events || [];
  const groups: LayoutCheckpoint[] = [
    { minuto: 0, label: 'Inicio', layout: initial, subs: [], rojas: [], marcador: marcadorHasta(events, 0) },
  ];

  for (const cp of fine) {
    const last = groups[groups.length - 1];
    if (groups.length > 1 && last.minuto === cp.minuto) {
      last.layout = cp.layout;
      if (cp.change.kind === 'sub') last.subs.push(cp.change.sub);
      else last.rojas.push(cp.change.event);
    } else {
      groups.push({
        minuto: cp.minuto,
        label: `Min. ${cp.minuto}'`,
        layout: cp.layout,
        subs: cp.change.kind === 'sub' ? [cp.change.sub] : [],
        rojas: cp.change.kind === 'roja' ? [cp.change.event] : [],
        marcador: marcadorHasta(events, cp.minuto),
      });
    }
  }
  return groups;
}

// Quiénes están efectivamente en cancha justo antes de que ocurra un cambio
// puntual (para no dejar "salir" a alguien que ya salió antes, ni omitir a
// quien entró en un cambio previo). Los cambios en el mismo minuto que el
// que se está editando no se aplican, porque su orden entre sí es ambiguo.
export function onFieldBefore(match: MatchLineupData, minuto: number, excludeSubId?: string): LineupEntry[] {
  const filtered: MatchLineupData = { ...match, substitutions: match.substitutions.filter((s) => s.id !== excludeSubId) };
  const fine = buildFineTimeline(filtered);
  let result = withDefaults(filtered.lineup);
  for (const cp of fine) {
    if (cp.minuto < minuto) result = cp.layout;
    else break;
  }
  return result;
}

export function layoutAtMinute(match: MatchLineupData, minuto: number): LineupEntry[] {
  const fine = buildFineTimeline(match);
  let result = withDefaults(match.lineup);
  for (const cp of fine) {
    if (cp.minuto <= minuto) result = cp.layout;
    else break;
  }
  return result;
}

// Distribución "por defecto" tras una sustitución puntual (sin ajustes
// manuales), usada para precargar el editor de campograma de esa sustitución.
export function computeDefaultLayoutForSub(match: MatchLineupData, subId: string): LineupEntry[] {
  const fine = buildFineTimeline(match);
  const cp = fine.find((c) => c.change.kind === 'sub' && c.change.sub.id === subId);
  return cp ? cp.layout : withDefaults(match.lineup);
}
