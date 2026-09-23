import type { IndividualStatsImport } from '../types';

export interface IndividualStatCategory {
  // Nombre exacto de la columna en la planilla individual importada (ver
  // server/src/leagueStats.ts, reusado también para esta planilla).
  columna: string;
  etiqueta: string;
  formato: (v: number) => string;
}

export interface IndividualStatGroup {
  titulo: string;
  categorias: IndividualStatCategory[];
}

const entero = (v: number) => `${Math.round(v)}`;
const decimal1 = (v: number) => v.toFixed(1);
const porcentaje = (v: number) => `${Math.round(v)}%`;

// Categorías de ejemplo (Goleadores, Asistencias, %Duelos aéreos, %Duelos
// defensivos, Tarjetas rojas, Faltas/90, Pases/90) más algunas propuestas
// del mismo estilo (mismo criterio que RADAR_PRESETS/METRIC_GROUPS en
// leagueStats.ts: se pueden ajustar libremente después). Los nombres de
// columna deben coincidir exactamente con el encabezado de la planilla
// individual (export tipo Wyscout).
export const INDIVIDUAL_STAT_GROUPS: IndividualStatGroup[] = [
  {
    titulo: 'Ofensivo',
    categorias: [
      { columna: 'Goles', etiqueta: 'Goleadores', formato: entero },
      { columna: 'Asistencias', etiqueta: 'Asistencias', formato: entero },
      { columna: 'xG', etiqueta: 'xG', formato: decimal1 },
      { columna: 'Regates/90', etiqueta: 'Regates/90', formato: decimal1 },
    ],
  },
  {
    titulo: 'Defensivo',
    categorias: [
      { columna: 'Duelos defensivos ganados, %', etiqueta: '% Duelos defensivos', formato: porcentaje },
      { columna: 'Duelos aéreos ganados, %', etiqueta: '% Duelos aéreos', formato: porcentaje },
      { columna: 'Interceptaciones/90', etiqueta: 'Interceptaciones/90', formato: decimal1 },
      { columna: 'Entradas/90', etiqueta: 'Entradas/90', formato: decimal1 },
    ],
  },
  {
    titulo: 'Disciplina',
    categorias: [
      { columna: 'Tarjetas amarillas', etiqueta: 'Tarjetas amarillas', formato: entero },
      { columna: 'Tarjetas rojas', etiqueta: 'Tarjetas rojas', formato: entero },
      { columna: 'Faltas/90', etiqueta: 'Faltas/90', formato: decimal1 },
    ],
  },
  {
    titulo: 'Circulación',
    categorias: [
      { columna: 'Pases/90', etiqueta: 'Pases/90', formato: decimal1 },
      { columna: 'Precisión pases, %', etiqueta: '% Precisión de pases', formato: porcentaje },
    ],
  },
];

export interface JugadorRanking {
  nombre: string;
  valor: number;
}

// Columna estándar del export tipo Wyscout. Un jugador con pocos minutos
// puede marcar un % altísimo (o un mínimo de faltas/90) solo por muestra
// chica (ej. 100% de duelos ganados habiendo jugado uno solo) — se exige un
// mínimo de minutos para entrar a cualquier ranking, no solo a los
// porcentuales, para no destacar a alguien por un partido suelto.
//
// El corte es relativo a los minutos POSIBLES hasta ahora, no a los
// minutos del jugador más usado del plantel (ese jugador podría él mismo
// tener pocos minutos si la planilla es de mitad de temporada o el plantel
// rotó mucho, y ahí un corte basado en él sería tan poco confiable como lo
// que se quiere evitar). Los minutos posibles se estiman como
// max(Partidos jugados del plantel) × 90 — se asume que al menos un
// jugador (típicamente el arquero titular) jugó todos los partidos
// disputados hasta la fecha del export. 50% = jugó al menos la mitad de
// los partidos disputados hasta ahora.
const COLUMNA_MINUTOS = 'Minutos jugados';
const COLUMNA_PARTIDOS = 'Partidos jugados';
const MINUTOS_POR_PARTIDO = 90;
export const MIN_PORCENTAJE_MINUTOS = 0.5;

function jugadorColumna(data: IndividualStatsImport): string | null {
  return data.columns[0] || null;
}

function valorNumerico(row: Record<string, string | number>, columna: string): number {
  const v = row[columna];
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export interface UmbralMinutos {
  activo: boolean;
  partidosDisputados: number;
  minMinutos: number;
}

// Piso de minutos vigente para esta planilla (ver comentario arriba de
// MIN_PORCENTAJE_MINUTOS) — se calcula una sola vez y se reusa tanto para
// filtrar el ranking (topJugadores) como para mostrarlo en la UI (para que
// quede claro por qué un jugador con pocos minutos no aparece).
export function umbralMinutos(data: IndividualStatsImport): UmbralMinutos {
  const activo = data.columns.includes(COLUMNA_MINUTOS) && data.columns.includes(COLUMNA_PARTIDOS);
  const partidosDisputados = activo ? Math.max(...data.rows.map((r) => valorNumerico(r, COLUMNA_PARTIDOS))) : 0;
  return { activo, partidosDisputados, minMinutos: partidosDisputados * MINUTOS_POR_PARTIDO * MIN_PORCENTAJE_MINUTOS };
}

// Top N jugadores para una columna, de mayor a menor, entre los que superan
// el umbral de minutos vigente (ver umbralMinutos). Se descartan además los
// que están en 0 (o sin dato) en la propia columna: mostrar "top 3" con
// jugadores en 0 sería engañoso cuando en realidad nadie del plantel se
// destaca ahí (ver IndividualesInformeBlock/RadarPresetCard para el mismo
// criterio en otras planillas: no mostrar la categoría en vez de mostrar
// ceros).
export function topJugadores(data: IndividualStatsImport, columna: string, n = 3): JugadorRanking[] {
  const col = jugadorColumna(data);
  if (!col) return [];
  const { activo, minMinutos } = umbralMinutos(data);
  return data.rows
    .filter((r) => !activo || valorNumerico(r, COLUMNA_MINUTOS) >= minMinutos)
    .map((r) => ({ nombre: String(r[col] ?? '').trim(), valor: valorNumerico(r, columna) }))
    .filter((j) => j.nombre && j.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}
