import type { Match } from '../types';
import { glossaryFor, splitTags } from './csvGlossary';

export const OFFENSIVE_CATEGORIES = ['SALIDAS', 'CIRCULACION BAJA', 'CIRCULACION MEDIA', 'CIRCULACION ALTA'];
export const DEFENSIVE_CATEGORIES = ['PRESION FIJA', 'PRESION ALTA', 'PRESION MEDIA', 'PRESION BAJA'];

const GAME_STATES = ['Ganando', 'Empatando', 'Perdiendo'] as const;
export type GameStateLabel = (typeof GAME_STATES)[number];
const MIN_SAMPLES_PER_STATE = 2;

interface TaggedRow {
  matchId: string;
  rowIndex: number;
  row: Record<string, string>;
}

function collectCsvRows(matches: Match[], categorias: string[]): TaggedRow[] {
  const out: TaggedRow[] = [];
  for (const match of matches) {
    if (!match.csv) continue;
    const categoryColumn = match.csv.columns.find((c) => c.trim().toLowerCase() === 'row');
    if (!categoryColumn) continue;
    match.csv.rows.forEach((row, rowIndex) => {
      if (categorias.includes(row[categoryColumn])) out.push({ matchId: match.id, rowIndex, row });
    });
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

// "Línea de 3 con lateral/interno/contención (normal y externa)" son la
// misma idea de construcción (salida en línea de 3), solo que el analista
// anota distinto quién arma la línea — se fusionan en un solo valor.
// Deliberadamente no incluye "Línea de 3 con arquero", que es un concepto
// distinto (arquero sumado a la salida, no quién arma la línea de 3).
const LINEA_DE_3_VALORES = [
  'Linea de 3 con lateral',
  'Linea de 3 externa con interno',
  'Linea de 3 con contencion',
  'Linea de 3 externa con contencion',
];
const LINEA_DE_3_LABEL = 'Línea de 3 (lateral, interno o contención)';

function fusionarValores(counts: Map<string, number>, valores: string[], etiquetaFusion: string): void {
  let total = 0;
  let huboAlguno = false;
  for (const v of valores) {
    const c = counts.get(v);
    if (!c) continue;
    huboAlguno = true;
    total += c;
    counts.delete(v);
  }
  if (huboAlguno) counts.set(etiquetaFusion, total);
}

function structureBreakdown(rows: TaggedRow[], columna: string | null): StructureBar[] {
  if (!columna) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const v = r.row[columna];
    if (!v) continue;
    // La celda puede traer 2+ conceptos a la vez (separados por coma, igual
    // que las columnas de "situaciones"): cada uno suma por separado, no
    // como una única barra combinada.
    for (const tag of splitTags(v)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
      total += 1;
    }
  }
  fusionarAlias(counts, 'Presionan en 4-3-1-2', 'Presionan en 4-1-3-2');
  fusionarValores(counts, LINEA_DE_3_VALORES, LINEA_DE_3_LABEL);
  return Array.from(counts.entries())
    .map(([valor, count]) => ({ valor, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

function canonicalizeConstruccion(valor: string): string {
  return LINEA_DE_3_VALORES.includes(valor) ? LINEA_DE_3_LABEL : valor;
}

export interface ConstruccionSituacionCombo {
  construccion: string;
  situacion: string;
  count: number;
}

// Combinaciones más frecuentes de construcción (Estructura de circulación) +
// situación de circulación marcadas en la misma fila, solo las que se
// repiten más de una vez (una sola coincidencia no es un patrón).
export function construccionSituacionCombos(
  matches: Match[],
  categorias: string[],
  situacionColumnas: string[]
): ConstruccionSituacionCombo[] {
  const rows = collectCsvRows(matches, categorias);
  const estructuraColumna = findEstructuraColumn(rows);
  if (!estructuraColumna) return [];

  const counts = new Map<string, ConstruccionSituacionCombo>();
  for (const r of rows) {
    const raw = r.row[estructuraColumna];
    if (!raw) continue;
    // Igual que en structureBreakdown: la celda puede traer 2+ conceptos a
    // la vez, cada uno se combina por separado con las situaciones de la
    // fila (no como un único concepto combinado).
    const construcciones = new Set(splitTags(raw).map(canonicalizeConstruccion));
    const situaciones = new Set<string>();
    for (const col of situacionColumnas) {
      const v = r.row[col];
      if (!v) continue;
      for (const tag of splitTags(v)) {
        if (!NON_INDIVIDUAL_SITUACIONES.has(tag)) situaciones.add(tag);
      }
    }
    for (const construccion of construcciones) {
      for (const situacion of situaciones) {
        const key = `${construccion} + ${situacion}`;
        if (!counts.has(key)) counts.set(key, { construccion, situacion, count: 0 });
        counts.get(key)!.count += 1;
      }
    }
  }
  return Array.from(counts.values())
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAGS);
}

export interface TagCount {
  tag: string;
  count: number;
  pct: number;
  descripcion?: string;
  // Desglose de este tag por resultado parcial (columna RESULTADO del CSV),
  // solo cuando el bloque lo pide (SituacionGroup.desglosePorEstado) — no
  // todos los bloques tienen espacio/necesidad de mostrarlo.
  porEstado?: { estado: GameStateLabel; count: number }[];
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
  opts: { soloRepetidos?: boolean; desglosePorEstado?: boolean } = {}
): { registros: number; tags: TagCount[]; combos: ComboCount[] } {
  const counts = new Map<string, number>();
  const countsPorEstado = new Map<string, Map<GameStateLabel, number>>();
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
        if (opts.desglosePorEstado) {
          const estado = r.row['RESULTADO'] as GameStateLabel;
          if (GAME_STATES.includes(estado)) {
            if (!countsPorEstado.has(tag)) countsPorEstado.set(tag, new Map());
            const porEstado = countsPorEstado.get(tag)!;
            porEstado.set(estado, (porEstado.get(estado) || 0) + 1);
          }
        }
      }
    }
    if (tieneValor) registros += 1;
  }
  let tags = Array.from(counts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      descripcion: glossaryFor(tag),
      porEstado: opts.desglosePorEstado
        ? GAME_STATES.map((estado) => ({ estado, count: countsPorEstado.get(tag)?.get(estado) || 0 })).filter(
            (e) => e.count > 0
          )
        : undefined,
    }))
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
  // Si es true, cada tag de este bloque trae además su propio desglose por
  // resultado parcial (TagCount.porEstado), para bloques de apoyo con poco
  // contenido propio (p. ej. "Distancia de salida") que tienen lugar de
  // sobra para mostrarlo dentro de su propia tarjeta.
  desglosePorEstado?: boolean;
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
      const { registros, tags, combos } = tagBreakdown(groupRows, g.columnas, {
        soloRepetidos: g.soloRepetidos,
        desglosePorEstado: g.desglosePorEstado,
      });
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

// Conceptos de espacio/estructura general, no un duelo puntual contra un
// rival: aunque el CSV a veces trae la columna "Rivales" rellenada en esa
// fila, no corresponde mostrarlos como comportamiento individual de ese
// jugador.
const NON_INDIVIDUAL_SITUACIONES = new Set([
  'Espacio por fuera',
  'Espacio entre lineas',
  'Libre cuadrado',
  'Espalda de la defensa',
  'Juego directo',
  'Triangulo en banda',
  'Centro 3/4',
  'Libre lado opuesto',
  'No emparejan en area',
  'Presion a linea de 3',
]);

// Cuando Sportscode marca 2+ situaciones a la vez en la misma instancia
// (celda separada por coma) junto con un rival, no queda claro a cuál de
// esas situaciones corresponde ese rival puntual — el analista solo marcó
// "esto pasó a la vez", no "el rival tal hizo esto". Estas filas quedan
// pendientes hasta que alguien con permiso de edición elija, en vez de
// contarlas para las dos (lo que inflaría ambos conceptos por igual).
const RESOLUCION_KEY = '__rivalResuelto';
// Caso especial: 2 rivales marcados + 2 situaciones marcadas suele ser en
// realidad "cada rival hizo una situación distinta", no que ambos hicieron
// las dos — esta resolución guarda esa asignación 1 a 1 en vez de una sola
// situación aplicada a los dos por igual.
const RESOLUCION_POR_JUGADOR_KEY = '__rivalResueltoPorJugador';

export interface PendienteResolucion {
  matchId: string;
  rowIndex: number;
  rival: string;
  rivales: string[];
  opciones: string[];
}

function porJugadorValido(raw: string | undefined, rivales: string[], situacionesSet: Set<string>): Record<string, string> | null {
  if (!raw) return null;
  try {
    const mapping = JSON.parse(raw) as Record<string, string>;
    const valido = rivales.every((riv) => mapping[riv] && situacionesSet.has(mapping[riv]));
    return valido ? mapping : null;
  } catch {
    return null;
  }
}

// Igual que comboBreakdown, pero dirigido: cuenta cada par (jugador rival,
// situación) que aparece junto en una fila, en vez de pares simétricos entre
// etiquetas de un mismo tipo. Filas sin la columna "Rivales" rellenada, o
// sin ninguna situación marcada, se excluyen; filas ambiguas (2+ situaciones
// sin resolver) se apartan en "pendientes" en vez de contarse.
function rivalSituacionCombos(
  rows: TaggedRow[],
  situacionColumnas: string[]
): { registrosConRival: number; combos: RivalSituacionCombo[]; pendientes: PendienteResolucion[] } {
  const counts = new Map<string, RivalSituacionCombo>();
  const pendientes: PendienteResolucion[] = [];
  let registrosConRival = 0;
  const addCombo = (rival: string, situacion: string) => {
    const key = `${rival} + ${situacion}`;
    if (!counts.has(key)) counts.set(key, { rival, situacion, count: 0 });
    counts.get(key)!.count += 1;
  };

  for (const r of rows) {
    const rivales = rivalTagsOf(r.row);
    if (rivales.length === 0) continue;
    const situacionesSet = new Set<string>();
    for (const col of situacionColumnas) {
      const v = r.row[col];
      if (!v) continue;
      for (const tag of splitTags(v)) {
        if (!NON_INDIVIDUAL_SITUACIONES.has(tag)) situacionesSet.add(tag);
      }
    }
    if (situacionesSet.size === 0) continue;
    registrosConRival += 1;

    const situaciones = Array.from(situacionesSet);
    if (situaciones.length === 1) {
      for (const rival of rivales) addCombo(rival, situaciones[0]);
      continue;
    }

    // Ambiguo: primero intenta la asignación 1 a 1 por jugador (más precisa
    // cuando aplica), después la resolución de "una sola situación para
    // todos", y si ninguna calza todavía, queda pendiente.
    const porJugador = porJugadorValido(r.row[RESOLUCION_POR_JUGADOR_KEY], rivales, situacionesSet);
    if (porJugador) {
      for (const rival of rivales) addCombo(rival, porJugador[rival]);
      continue;
    }
    const resuelto = r.row[RESOLUCION_KEY];
    if (resuelto && situacionesSet.has(resuelto)) {
      for (const rival of rivales) addCombo(rival, resuelto);
      continue;
    }
    pendientes.push({ matchId: r.matchId, rowIndex: r.rowIndex, rival: rivales.join(', '), rivales, opciones: situaciones });
  }
  const combos = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RIVAL_COMBOS);
  return { registrosConRival, combos, pendientes };
}

export interface IndividualesBloque {
  titulo: string;
  registrosConRival: number;
  combos: RivalSituacionCombo[];
  pendientes: PendienteResolucion[];
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
  const { registrosConRival, combos, pendientes } = rivalSituacionCombos(rows, situacionColumnas);
  return { titulo, registrosConRival, combos, pendientes };
}
