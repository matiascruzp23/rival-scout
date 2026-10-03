import { POSITIONS, positionDef } from './positions';
import { formationSlots } from './formations';

// Distribución en cajas del plantel por posición (grilla de 5 columnas),
// compartida entre PlantelView y la exportación a Keynote.
export interface BoxSpec {
  label: string;
  row: number;
  col: number;
}

// Cuántas columnas (de 5) ocupa una línea de N posiciones, centradas.
const COLUMNS_FOR_COUNT: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

// Para una línea de 3 con las posiciones realmente cerca entre sí en la
// cancha (p. ej. los dos interiores + el volante central, o los 3 centrales
// de una línea de 3), usar las columnas de los extremos (1 y 5) las mostraba
// mucho más separadas de lo que están en la realidad.
const TIGHT_COLUMNS_FOR_THREE = [2, 3, 4];
const TIGHT_RANGE_THRESHOLD = 35;

// A qué línea (fila) del campograma en cajas pertenece una posición, según
// su profundidad (y) en el catálogo: ataque arriba, arco abajo, igual que el
// campograma vertical del resto de la app.
function rowForY(y: number): number {
  if (y < 30) return 1;
  if (y < 45) return 2;
  if (y < 70) return 3;
  if (y < 90) return 4;
  return 5;
}

// Las cajas a mostrar: si el rival tiene un sistema reconocido, solo las 11
// posiciones de ese sistema; si no, el catálogo completo (comportamiento
// anterior, para rivales sin sistema definido todavía).
export function boxesForSystem(sistema: string): BoxSpec[] {
  const slots = formationSlots(sistema);
  const labels = slots ? Array.from(new Set(slots)) : POSITIONS.map((p) => p.label);
  // Con línea de 5 en el fondo, los carrileros son parte de esa línea (junto
  // a los 3 centrales), no del mediocampo: se muestran a la misma altura que
  // los centrales para que no se lean como laterales sueltos en otra fila.
  const lineaDeCinco = /^5-/.test(sistema);
  const byRow = new Map<number, string[]>();
  for (const label of labels) {
    const def = positionDef(label);
    if (!def) continue;
    const esCarrilero = label === 'Carrilero derecho' || label === 'Carrilero izquierdo';
    const row = lineaDeCinco && esCarrilero ? rowForY(positionDef('Central derecho')!.y) : rowForY(def.y);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(label);
  }
  const boxes: BoxSpec[] = [];
  for (const [row, rowLabels] of byRow) {
    rowLabels.sort((a, b) => (positionDef(a)?.x ?? 50) - (positionDef(b)?.x ?? 50));
    const xs = rowLabels.map((label) => positionDef(label)?.x ?? 50);
    const range = Math.max(...xs) - Math.min(...xs);
    const tight = rowLabels.length === 3 && range < TIGHT_RANGE_THRESHOLD;
    const cols = tight ? TIGHT_COLUMNS_FOR_THREE : COLUMNS_FOR_COUNT[rowLabels.length] || rowLabels.map((_, i) => i + 1);
    rowLabels.forEach((label, i) => boxes.push({ label, row, col: cols[i] }));
  }
  return boxes;
}
