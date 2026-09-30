import type { IndividualStatsImport, Player } from '../types';
import { shortName } from './lookup';

export interface PlayerRadarAxis {
  columna: string;
  label: string;
}

export interface PlayerRadarGroup {
  key: string;
  titulo: string;
  posiciones: string[];
  ejes: PlayerRadarAxis[];
}

// Un set de métricas de radar por grupo táctico de posiciones (no por
// jugador puntual ni por el grupo genérico POR/DEF/MED/DEL): un central y
// un lateral comparten zona de cancha pero no las métricas que importan, lo
// mismo que un volante de contención contra un extremo. Nombres de columna
// validados contra un export real de Wyscout, no inventados — si la
// planilla que se importa trae otros nombres, ese eje simplemente queda en
// 0 (mismo comportamiento que RADAR_PRESETS en leagueStats.ts).
export const PLAYER_RADAR_GROUPS: PlayerRadarGroup[] = [
  {
    key: 'arquero',
    titulo: 'Arquero',
    posiciones: ['Arquero'],
    ejes: [
      { columna: 'Paradas, %', label: '% Paradas' },
      { columna: 'Goles evitados/90', label: 'Goles evitados/90' },
      { columna: 'Precisión pases, %', label: '% Precisión pases' },
      { columna: 'Salidas/90', label: 'Salidas/90' },
      { columna: 'Duelos aéreos ganados, %', label: '% Duelos aéreos' },
    ],
  },
  {
    key: 'central',
    titulo: 'Central',
    posiciones: ['Central', 'Central derecho', 'Central izquierdo'],
    ejes: [
      { columna: 'Duelos defensivos ganados, %', label: '% Duelos defensivos' },
      { columna: 'Duelos aéreos ganados, %', label: '% Duelos aéreos' },
      { columna: 'Interceptaciones/90', label: 'Interceptaciones/90' },
      { columna: 'Entradas/90', label: 'Entradas/90' },
      { columna: 'Precisión pases, %', label: '% Precisión pases' },
    ],
  },
  {
    key: 'lateral',
    titulo: 'Lateral / Carrilero',
    posiciones: ['Lateral derecho', 'Lateral izquierdo', 'Carrilero derecho', 'Carrilero izquierdo'],
    ejes: [
      { columna: 'Duelos defensivos ganados, %', label: '% Duelos defensivos' },
      { columna: 'Centros/90', label: 'Centros/90' },
      { columna: 'Precisión centros, %', label: '% Precisión centros' },
      { columna: 'Duelos atacantes ganados, %', label: '% Duelos atacantes' },
      { columna: 'Pases progresivos/90', label: 'Pases progresivos/90' },
    ],
  },
  {
    key: 'contencion',
    titulo: 'Mediocampo de contención',
    posiciones: ['Volante central', 'Medio centro derecho', 'Medio centro izquierdo'],
    ejes: [
      { columna: 'Duelos defensivos ganados, %', label: '% Duelos defensivos' },
      { columna: 'Interceptaciones/90', label: 'Interceptaciones/90' },
      { columna: 'Pases/90', label: 'Pases/90' },
      { columna: 'Precisión pases, %', label: '% Precisión pases' },
      { columna: 'Pases progresivos/90', label: 'Pases progresivos/90' },
    ],
  },
  {
    key: 'ofensivo',
    titulo: 'Mediocampo ofensivo / extremo',
    posiciones: ['Mediapunta', 'Mediapunta derecho', 'Mediapunta izquierdo', 'Extremo derecho', 'Extremo izquierdo'],
    ejes: [
      { columna: 'Goles', label: 'Goles' },
      { columna: 'Asistencias', label: 'Asistencias' },
      { columna: 'xG', label: 'xG' },
      { columna: 'xA', label: 'xA' },
      { columna: 'Regates/90', label: 'Regates/90' },
      { columna: 'Jugadas claves/90', label: 'Jugadas claves/90' },
    ],
  },
  {
    key: 'delantero',
    titulo: 'Delantero',
    posiciones: ['Delantero centro', 'Segundo delantero'],
    ejes: [
      { columna: 'Goles', label: 'Goles' },
      { columna: 'xG', label: 'xG' },
      { columna: 'Asistencias', label: 'Asistencias' },
      { columna: 'Regates/90', label: 'Regates/90' },
      { columna: 'Duelos aéreos ganados, %', label: '% Duelos aéreos' },
      { columna: 'Remates/90', label: 'Remates/90' },
    ],
  },
];

export function radarGroupForPosicion(posicion: string): PlayerRadarGroup | null {
  return PLAYER_RADAR_GROUPS.find((g) => g.posiciones.includes(posicion)) || null;
}

function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Cruza un jugador propio con su fila en la planilla individual importada:
// Wyscout suele exportar el nombre abreviado ("G. Graciani", igual al
// formato de shortName()) en vez del nombre completo que se carga acá, así
// que se prueban las dos formas antes de dar por no encontrado. Si el
// jugador tiene un cruce elegido a mano (wyscoutNombre, ver
// filasSinCruzar), ese nombre exacto manda por sobre el cruce automático.
export function filaDeJugador(
  data: IndividualStatsImport,
  jugador: Player
): Record<string, string | number> | null {
  const col = data.columns[0];
  if (!col) return null;
  const candidatos = jugador.wyscoutNombre
    ? new Set([normaliza(jugador.wyscoutNombre)])
    : new Set([normaliza(jugador.nombre), normaliza(shortName(jugador.nombre))]);
  return data.rows.find((r) => candidatos.has(normaliza(String(r[col] ?? '')))) || null;
}

// Nombres (columna "Jugador") de la planilla individual que todavía no
// quedaron cruzados con ningún jugador del plantel propio (ni por el cruce
// automático ni por uno elegido a mano) — para ofrecerlos como opciones
// cuando el cruce automático de un jugador puntual falla.
export function filasSinCruzar(data: IndividualStatsImport, jugadores: Player[]): string[] {
  const col = data.columns[0];
  if (!col) return [];
  const usados = new Set<string>();
  for (const j of jugadores) {
    const fila = filaDeJugador(data, j);
    if (fila) usados.add(normaliza(String(fila[col] ?? '')));
  }
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const row of data.rows) {
    const nombre = String(row[col] ?? '').trim();
    const norm = normaliza(nombre);
    if (!nombre || usados.has(norm) || vistos.has(norm)) continue;
    vistos.add(norm);
    out.push(nombre);
  }
  return out;
}

export function valorDe(row: Record<string, string | number> | null, columna: string): number {
  if (!row) return 0;
  const v = row[columna];
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Techo de cada eje: el máximo real entre TODO el plantel con fila en la
// planilla individual (no solo el grupo de esta posición) — mismo criterio
// que el radar de equipo (ver leagueStats.escalasPorEje), para que el
// ancho del radar de un jugador se pueda comparar contra el de otro sin que
// el eje se reajuste solo según a quién se esté mirando.
export function maxPorEjeJugadores(data: IndividualStatsImport, ejes: PlayerRadarAxis[]): number[] {
  return ejes.map((e) => {
    let max = 0;
    for (const row of data.rows) {
      const v = valorDe(row, e.columna);
      if (v > max) max = v;
    }
    return max;
  });
}
