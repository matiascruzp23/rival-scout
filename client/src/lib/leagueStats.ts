import type { LeagueStatsImport } from '../types';

export interface RadarAxis {
  // Nombre exacto de la columna en la planilla importada.
  columna: string;
  // Etiqueta a mostrar en el gráfico (más corta/prolija que el nombre de columna).
  label: string;
}

export interface RadarPreset {
  key: string;
  titulo: string;
  ejes: RadarAxis[];
}

// Los 3 radares fijos, con las mismas métricas que ya se usaban en las
// planillas de referencia del analista. Los nombres de columna deben
// coincidir exactamente con el encabezado de la planilla LDP (ver
// server/src/leagueStats.ts) — si el analista sube una planilla con
// columnas distintas, ese eje simplemente queda en blanco (ver
// valorDe/radarTieneDatos) en vez de romper el resto del gráfico.
export const RADAR_PRESETS: RadarPreset[] = [
  {
    key: 'ofensiva',
    titulo: 'Fase ofensiva',
    ejes: [
      { columna: 'Tiros', label: 'Tiros' },
      { columna: 'Centros', label: 'Centros' },
      { columna: 'xG', label: 'xG' },
      { columna: 'Contraataques con remate', label: 'Contraataques c/remate' },
      { columna: 'Ataques posicionales con remate', label: 'Atq posicionales c/remate' },
      { columna: '%Duelos ofensivos ganados', label: '%Duelos of.' },
      { columna: '%Jugadas a balón parado con remate', label: '%ABP con remate' },
      { columna: 'Posesión del balón, %', label: 'Posesión del balón, %' },
    ],
  },
  {
    key: 'pases',
    titulo: 'Pases',
    ejes: [
      { columna: 'Longitud media pases', label: 'Longitud media pases' },
      { columna: 'Pases Logrados', label: 'Pases Logrados' },
      { columna: 'Promedio pases por posesión del balón', label: 'Pases x posesión' },
      { columna: 'Pases en profundidad completados', label: 'Pases en profundidad completados' },
      { columna: 'Pases en el último tercio', label: 'Pases último tercio' },
      { columna: 'Pases progresivos', label: 'Pases progresivos' },
    ],
  },
  {
    key: 'defensiva',
    titulo: 'Fase defensiva',
    ejes: [
      { columna: 'Entradas a ras de suelo logradas', label: 'Entradas a ras de suelo logradas' },
      { columna: '&Duelos defensivos ganados', label: '%Duelos defensivos' },
      { columna: 'Balones recuperados altos', label: 'Rec. Alta' },
      { columna: 'PPDA', label: 'PPDA' },
      { columna: 'Interceptaciones', label: 'Interceptaciones' },
      { columna: 'Tiros en contra', label: 'Tiros en Contra' },
      { columna: 'Faltas', label: 'Faltas' },
    ],
  },
];

// Fila "PROMEDIO" ya calculada dentro de la propia planilla — no se
// recalcula acá, se busca por su valor exacto en la columna de equipo.
export const CODIGO_PROMEDIO = 'PROMEDIO';

function equipoColumna(data: LeagueStatsImport): string | null {
  return data.columns[0] || null;
}

export function findRow(data: LeagueStatsImport, codigo: string): Record<string, string | number> | null {
  const col = equipoColumna(data);
  if (!col) return null;
  const target = codigo.trim().toLowerCase();
  return data.rows.find((r) => String(r[col] ?? '').trim().toLowerCase() === target) || null;
}

// Valor numérico de una celda para graficar: celdas vacías o no numéricas
// (la fila puede no tener ese dato) cuentan como 0 en vez de romper el
// gráfico.
export function valorNumerico(row: Record<string, string | number> | null, columna: string): number {
  if (!row) return 0;
  const v = row[columna];
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Máximo real de esa métrica entre todos los EQUIPOS de la liga (no filas
// agregadas como "PROMEDIO"): el eje se escala contra este techo fijo, no
// contra el máximo de las 3 series que se están graficando — así el ancho
// del radar de una métrica se puede comparar entre distintos rivales, en
// vez de reajustarse solo según a quién se esté mirando.
export function ligaMax(data: LeagueStatsImport, columna: string): number {
  const col = equipoColumna(data);
  let max = 0;
  for (const row of data.rows) {
    if (col && String(row[col] ?? '').trim().toUpperCase() === CODIGO_PROMEDIO) continue;
    const v = valorNumerico(row, columna);
    if (v > max) max = v;
  }
  return max;
}

export interface MetricGroup {
  titulo: string;
  columnas: string[];
}

// Agrupación temática de las columnas de la planilla LDP, para el modo
// "Personalizado" — ni alfabético ni el orden de la planilla (que mezcla
// fase ofensiva/defensiva/balón parado sin un criterio muy visible). Los
// nombres deben coincidir exactamente con el encabezado real (ver
// server/src/leagueStats.ts), typos incluidos (ej. "altoss",
// "&Duelos defensivos ganados", el espacio final en "Entradas a ras de
// suelo "), porque así vienen en la planilla del analista.
const METRIC_GROUPS: MetricGroup[] = [
  {
    titulo: 'Finalización',
    columnas: [
      'Goles',
      'xG',
      'Tiros',
      'Tiros a la portería',
      '%Tiros',
      'Tiros de fuera del área',
      'Tiros de fuera del área a la portería',
      '%Tiros de fuera del área',
      'Distancia media de tiro',
    ],
  },
  {
    titulo: 'Posesión y circulación',
    columnas: [
      'Posesión del balón, %',
      'Pases',
      'Pases Logrados',
      '%Pases',
      'Longitud media pases',
      'Intensidad de paso',
      'Promedio pases por posesión del balón',
      'Lanzamiento largo %',
    ],
  },
  {
    titulo: 'Tipos de pase',
    columnas: [
      'Pases hacia adelante',
      'Pases hacia adelante logrados',
      '%Pases hacia adelante logrados',
      'Pases hacia atrás',
      'Pases hacia atrás logrados',
      '%Pases hacia atrás logrados',
      'Pases laterales',
      'Pases laterales logrados',
      '%Pases laterales logrados',
      'Pases largos',
      'Pases largos logrados',
      '%Pases largos logrados',
      'Pases progresivos',
      'Pases progresivos precisos',
      '%Pases progresivos precisos',
      'Pases en el último tercio',
      'Pases en el último tercio logrados',
      '%Pases en el último tercio logrados',
      'Pases en profundidad completados',
      'Pases cruzados en profundidad completados',
    ],
  },
  {
    titulo: 'Creación de juego',
    columnas: [
      'Ataques posicionales',
      'Ataques posicionales con remate',
      '%Ataques posicionales con remate',
      'Contraataques',
      'Contraataques con remate',
      '%Contraataques con remate',
      'Desmarques',
      'Desmarques logrados',
      '%Desmarques logrados',
      'Centros',
      'Centros precisos',
      '%Centros precisos',
      'Entradas al área de penalti',
      'Entradas al área de penalti carreras',
      'Entradas al área de penalti pases cruzados',
      'Toques en el área de penalti',
    ],
  },
  {
    titulo: 'Balón parado',
    columnas: [
      'Jugadas a balón parado',
      'Jugadas a balón parado con remate',
      '%Jugadas a balón parado con remate',
      'Córneres',
      'Córneres con remate',
      '%Córneres con remate',
      'Tiros libres',
      'Tiros libres con remate',
      '%Tiros libres con remate',
      'Penaltis',
      'Penaltis marcados',
      '%Penaltis marcados',
      'Saques laterales',
      'Saques laterales logrados',
      '%Saques laterales logrados',
      'Saques de meta',
    ],
  },
  {
    titulo: 'Duelos',
    columnas: [
      'Duelos',
      'Duelos ganados',
      '%Duelos',
      'Duelos ofensivos',
      'Duelos ofensivos ganados',
      '%Duelos ofensivos ganados',
      'Duelos defensivos',
      'Duelos defensivos ganados',
      '&Duelos defensivos ganados',
      'Duelos aéreos',
      'Duelos aéreos ganados',
      '%Duelos aéreos ganados',
    ],
  },
  {
    titulo: 'Pérdidas y recuperaciones',
    columnas: [
      'Balones perdidos',
      'Balones perdidos bajos',
      'Balones perdidos medios',
      'Balones perdidos altoss',
      'Balones recuperados',
      'Balones recuperados bajos',
      'Balones recuperados medios',
      'Balones recuperados altos',
    ],
  },
  {
    titulo: 'Fase defensiva',
    columnas: [
      'PPDA',
      'Entradas a ras de suelo ',
      'Entradas a ras de suelo logradas',
      '%Entradas a ras de suelo logradas',
      'Interceptaciones',
      'Despejes',
      'Tiros en contra',
      'Tiros en contra a la portería',
      '%Tiros en contra a la portería',
      'Goles recibidos',
    ],
  },
  {
    titulo: 'Disciplina',
    columnas: ['Faltas', 'Tarjetas amarillas', 'Tarjetas rojas', 'Fuera de juego'],
  },
];

// Agrupa las columnas de la planilla importada según METRIC_GROUPS, para el
// modo "Personalizado". Una columna de la planilla que no esté en ninguna
// lista de arriba (una planilla con métricas nuevas que no conocemos
// todavía) no se pierde: cae en un grupo final "Otras", en vez de
// desaparecer de la lista.
export function metricGroups(data: LeagueStatsImport): MetricGroup[] {
  const disponibles = new Set(data.columns.slice(1));
  const usadas = new Set<string>();
  const grupos: MetricGroup[] = [];
  for (const g of METRIC_GROUPS) {
    const columnas = g.columnas.filter((c) => disponibles.has(c));
    columnas.forEach((c) => usadas.add(c));
    if (columnas.length > 0) grupos.push({ titulo: g.titulo, columnas });
  }
  const otras = data.columns.slice(1).filter((c) => !usadas.has(c));
  if (otras.length > 0) grupos.push({ titulo: 'Otras', columnas: otras });
  return grupos;
}

// Todas las columnas métricas disponibles, en el mismo orden que
// metricGroups (para calcular, por ejemplo, el ranking en liga de cada una
// sin importar en qué grupo cayó).
export function metricColumns(data: LeagueStatsImport): string[] {
  return metricGroups(data).flatMap((g) => g.columnas);
}

// Métricas donde un valor más BAJO es mejor (eventos en contra propia,
// básicamente): para el resto de la planilla (goles, tiros, pases,
// posesión, duelos ganados, etc.) un valor más alto es mejor. No hay una
// forma de inferir esto de forma confiable a partir del nombre de columna
// solo, así que se listan a mano las que son "menos es mejor"; cualquier
// columna que no esté acá se trata como "más es mejor".
const MENOS_ES_MEJOR = new Set([
  'Goles recibidos',
  'Balones perdidos',
  'Balones perdidos bajos',
  'Balones perdidos medios',
  'Balones perdidos altoss',
  'Faltas',
  'Tarjetas amarillas',
  'Tarjetas rojas',
  'Tiros en contra',
  'Tiros en contra a la portería',
  '%Tiros en contra a la portería',
  'Fuera de juego',
  'PPDA',
]);

export interface RankingLiga {
  posicion: number; // 1 = mejor
  total: number;
  top3Positivo: boolean;
  top3Negativo: boolean;
  mejorEsMayor: boolean;
}

// Posición del rival entre todos los equipos de la liga (sin la fila
// "PROMEDIO") para una métrica puntual, para poder avisar cuando el rival
// está entre los 3 mejores o los 3 peores de la liga en algo.
export function rankingEnLiga(data: LeagueStatsImport, codigoRival: string, columna: string): RankingLiga | null {
  const col = equipoColumna(data);
  if (!col) return null;
  const mejorEsMayor = !MENOS_ES_MEJOR.has(columna);
  const equipos = data.rows
    .filter((r) => String(r[col] ?? '').trim().toUpperCase() !== CODIGO_PROMEDIO)
    .map((r) => ({ codigo: String(r[col] ?? '').trim(), valor: valorNumerico(r, columna) }))
    .sort((a, b) => (mejorEsMayor ? b.valor - a.valor : a.valor - b.valor));

  const idx = equipos.findIndex((e) => e.codigo.toLowerCase() === codigoRival.trim().toLowerCase());
  if (idx === -1) return null;
  const posicion = idx + 1;
  const total = equipos.length;
  return {
    posicion,
    total,
    top3Positivo: posicion <= 3,
    top3Negativo: posicion > total - 3,
    mejorEsMayor,
  };
}
