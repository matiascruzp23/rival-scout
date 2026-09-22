import type { Match } from '../types';
import { glossaryFor, splitTags } from './csvGlossary';

export const OFFENSIVE_CATEGORIES = ['SALIDAS', 'CIRCULACION BAJA', 'CIRCULACION MEDIA', 'CIRCULACION ALTA'];
export const DEFENSIVE_CATEGORIES = ['PRESION FIJA', 'PRESION ALTA', 'PRESION MEDIA', 'PRESION BAJA'];

const GAME_STATES = ['Ganando', 'Empatando', 'Perdiendo'] as const;
export type GameStateLabel = (typeof GAME_STATES)[number];
const MIN_SAMPLES_PER_STATE = 2;

interface TaggedRow {
  row: Record<string, string>;
}

function collectCsvRows(matches: Match[], categorias: string[]): TaggedRow[] {
  const out: TaggedRow[] = [];
  for (const match of matches) {
    if (!match.csv) continue;
    const categoryColumn = match.csv.columns.find((c) => c.trim().toLowerCase() === 'row');
    if (!categoryColumn) continue;
    for (const row of match.csv.rows) {
      if (categorias.includes(row[categoryColumn])) out.push({ row });
    }
  }
  return out;
}

function findEstructuraColumn(rows: TaggedRow[]): string | null {
  for (const r of rows) {
    for (const col of Object.keys(r.row)) {
      if (col.trim().toLowerCase().startsWith('estructura') && r.row[col]) return col;
    }
  }
  return null;
}

export interface StructureBar {
  valor: string;
  count: number;
  pct: number;
}

// "Presionan en 4-3-1-2" y "Presionan en 4-1-3-2" describen la misma
// estructura (doble pivote + mediapunta), solo que el analista a veces
// anota el orden de las líneas distinto: se fusionan en un solo valor.
function fusionarAlias(counts: Map<string, number>, principal: string, alias: string): void {
  const countPrincipal = counts.get(principal) || 0;
  const countAlias = counts.get(alias) || 0;
  if (countPrincipal === 0 && countAlias === 0) return;
  counts.delete(principal);
  counts.delete(alias);
  counts.set(`${principal} (${alias.replace('Presionan en ', '')})`, countPrincipal + countAlias);
}

function structureBreakdown(rows: TaggedRow[], columna: string | null): StructureBar[] {
  if (!columna) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const v = r.row[columna];
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
    total += 1;
  }
  fusionarAlias(counts, 'Presionan en 4-3-1-2', 'Presionan en 4-1-3-2');
  return Array.from(counts.entries())
    .map(([valor, count]) => ({ valor, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

export interface TagCount {
  tag: string;
  count: number;
  pct: number;
  descripcion?: string;
}

// Cuántas etiquetas distintas mostrar como máximo por bloque: el objetivo es
// resaltar los patrones más relevantes, no listar cada valor que aparezca
// una sola vez en el CSV.
const MAX_TAGS = 8;

export interface ComboCount {
  tags: string[];
  count: number;
}

// Cuando una misma fila marca 2+ etiquetas a la vez (celda separada por
// coma, o repartida en varias columnas del mismo bloque), esto cuenta cada
// PAR de etiquetas que aparece junto, no solo la combinación exacta completa
// de la fila: así "A + B" suma cada vez que aparecen juntas, aunque una fila
// traiga además una 3ra etiqueta distinta que varíe de una vez a otra.
function comboBreakdown(rows: TaggedRow[], columnas: string[]): ComboCount[] {
  const counts = new Map<string, ComboCount>();
  for (const r of rows) {
    const tagsEnFila = new Set<string>();
    for (const col of columnas) {
      const v = r.row[col];
      if (!v) continue;
      for (const tag of splitTags(v)) tagsEnFila.add(tag);
    }
    const tags = Array.from(tagsEnFila).sort();
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const par = [tags[i], tags[j]];
        const key = par.join(' + ');
        if (!counts.has(key)) counts.set(key, { tags: par, count: 0 });
        counts.get(key)!.count += 1;
      }
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAGS);
}

function tagBreakdown(
  rows: TaggedRow[],
  columnas: string[],
  opts: { soloRepetidos?: boolean } = {}
): { registros: number; tags: TagCount[]; combos: ComboCount[] } {
  const counts = new Map<string, number>();
  let total = 0;
  let registros = 0;
  for (const r of rows) {
    let tieneValor = false;
    for (const col of columnas) {
      const v = r.row[col];
      if (!v) continue;
      tieneValor = true;
      for (const tag of splitTags(v)) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
        total += 1;
      }
    }
    if (tieneValor) registros += 1;
  }
  let tags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, descripcion: glossaryFor(tag) }))
    .sort((a, b) => b.count - a.count);
  if (opts.soloRepetidos) tags = tags.filter((t) => t.count > 1);
  tags = tags.slice(0, MAX_TAGS);
  return { registros, tags, combos: comboBreakdown(rows, columnas) };
}

export interface EstadoResumen {
  estado: GameStateLabel;
  total: number;
  estructuraTop: { valor: string; pct: number } | null;
  situacionesTop: { tag: string; pct: number }[];
}

function estadoResumen(rows: TaggedRow[], estructuraColumna: string | null, situacionColumnas: string[]): EstadoResumen[] {
  const result: EstadoResumen[] = [];
  for (const estado of GAME_STATES) {
    const stateRows = rows.filter((r) => r.row['RESULTADO'] === estado);
    if (stateRows.length < MIN_SAMPLES_PER_STATE) continue;

    let estructuraTop: { valor: string; pct: number } | null = null;
    if (estructuraColumna) {
      const bars = structureBreakdown(stateRows, estructuraColumna);
      if (bars.length > 0) estructuraTop = { valor: bars[0].valor, pct: bars[0].pct };
    }

    const tags = tagBreakdown(stateRows, situacionColumnas)
      .tags.slice(0, 2)
      .map((t) => ({ tag: t.tag, pct: t.pct }));

    result.push({ estado, total: stateRows.length, estructuraTop, situacionesTop: tags });
  }
  return result;
}

// Compara, entre los estados con datos suficientes, si el patrón de
// estructura dominante realmente cambia; si es igual en todos, no amerita
// mostrarlo como diferencia.
export function estructuraCambiaPorEstado(resumen: EstadoResumen[]): boolean {
  const valores = resumen.map((r) => r.estructuraTop?.valor).filter(Boolean);
  return new Set(valores).size > 1;
}

// Un grupo de columnas de texto libre que se muestran juntas bajo un mismo
// título (p. ej. "Situaciones de circulación" separado de "Distancia de
// salida", aunque ambas describan la fase ofensiva).
export interface SituacionGroup {
  titulo: string;
  columnas: string[];
  // Si se define, este bloque solo considera filas de estas categorías
  // (columna ROW) en vez de todas las pasadas a analyzePhase — para separar,
  // dentro de una misma fase, por ejemplo circulación media de alta.
  categorias?: string[];
  // Si es true, oculta los conceptos que aparecieron una sola vez: el
  // objetivo es resaltar patrones que se repiten, no cualquier cosa marcada
  // una vez sola en el CSV.
  soloRepetidos?: boolean;
}

export interface SituacionBloque {
  titulo: string;
  registros: number;
  tags: TagCount[];
  // Combinaciones de 2+ etiquetas que se marcaron juntas en la misma fila
  // (ordenadas por frecuencia), para ver qué contenidos suelen repetirse en
  // conjunto y no solo cada uno por separado.
  combos: ComboCount[];
}

export interface PhaseAnalysis {
  totalRegistros: number;
  estructuraColumna: string | null;
  estructura: StructureBar[];
  situaciones: SituacionBloque[];
  porEstado: EstadoResumen[];
}

// Agrega, de forma descriptiva, los registros de Sportscode de las
// categorías indicadas (p. ej. toda la fase ofensiva) a través de todos los
// partidos con CSV cargado del rival. "situacionGroups" define, por
// separado, qué columnas de texto libre se cuentan como patrones/situaciones
// para esta fase (para no mezclar, p. ej., situaciones de circulación con la
// distancia de salida).
export function analyzePhase(matches: Match[], categorias: string[], situacionGroups: SituacionGroup[]): PhaseAnalysis {
  const rows = collectCsvRows(matches, categorias);
  const estructuraColumna = findEstructuraColumn(rows);
  const todasLasColumnas = situacionGroups.flatMap((g) => g.columnas);
  return {
    totalRegistros: rows.length,
    estructuraColumna,
    estructura: structureBreakdown(rows, estructuraColumna),
    situaciones: situacionGroups.map((g) => {
      const groupRows = g.categorias ? collectCsvRows(matches, g.categorias) : rows;
      const { registros, tags, combos } = tagBreakdown(groupRows, g.columnas, { soloRepetidos: g.soloRepetidos });
      return { titulo: g.titulo, registros, tags, combos };
    }),
    porEstado: estadoResumen(rows, estructuraColumna, todasLasColumnas),
  };
}

export function matchesWithCsvCount(matches: Match[]): number {
  return matches.filter((m) => !!m.csv).length;
}

// Jugador(es) rival marcados en la fila (columna "Rivales" del CSV, no
// siempre rellenada por el analista). Se busca por nombre de columna en
// cada fila en vez de asumir un nombre fijo de match.csv.columns, igual que
// findEstructuraColumn, porque TaggedRow ya no sabe de qué partido vino.
function rivalTagsOf(row: Record<string, string>): string[] {
  for (const col of Object.keys(row)) {
    if (col.trim().toLowerCase() === 'rivales') {
      return row[col] ? splitTags(row[col]) : [];
    }
  }
  return [];
}

export interface RivalSituacionCombo {
  rival: string;
  situacion: string;
  count: number;
}

const MAX_RIVAL_COMBOS = 10;

// Igual que comboBreakdown, pero dirigido: cuenta cada par (jugador rival,
// situación) que aparece junto en una fila, en vez de pares simétricos entre
// etiquetas de un mismo tipo. Filas sin la columna "Rivales" rellenada, o
// sin ninguna situación marcada, se excluyen.
function rivalSituacionCombos(
  rows: TaggedRow[],
  situacionColumnas: string[]
): { registrosConRival: number; combos: RivalSituacionCombo[] } {
  const counts = new Map<string, RivalSituacionCombo>();
  let registrosConRival = 0;
  for (const r of rows) {
    const rivales = rivalTagsOf(r.row);
    if (rivales.length === 0) continue;
    const situaciones = new Set<string>();
    for (const col of situacionColumnas) {
      const v = r.row[col];
      if (!v) continue;
      for (const tag of splitTags(v)) situaciones.add(tag);
    }
    if (situaciones.size === 0) continue;
    registrosConRival += 1;
    for (const rival of rivales) {
      for (const situacion of situaciones) {
        const key = `${rival} + ${situacion}`;
        if (!counts.has(key)) counts.set(key, { rival, situacion, count: 0 });
        counts.get(key)!.count += 1;
      }
    }
  }
  const combos = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RIVAL_COMBOS);
  return { registrosConRival, combos };
}

export interface IndividualesBloque {
  titulo: string;
  registrosConRival: number;
  combos: RivalSituacionCombo[];
}

// Combinaciones más frecuentes de jugador rival + situación, dentro de las
// categorías indicadas (p. ej. toda la fase ofensiva o toda la defensiva),
// para la pestaña "Individuales".
export function analyzeIndividuales(
  matches: Match[],
  categorias: string[],
  situacionColumnas: string[],
  titulo: string
): IndividualesBloque {
  const rows = collectCsvRows(matches, categorias);
  const { registrosConRival, combos } = rivalSituacionCombos(rows, situacionColumnas);
  return { titulo, registrosConRival, combos };
}
