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

// Todas las columnas métricas disponibles (todo menos la de equipo), para
// el modo "Personalizado".
export function metricColumns(data: LeagueStatsImport): string[] {
  return data.columns.slice(1);
}
