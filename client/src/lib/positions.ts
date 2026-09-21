export type PositionGroup = 'POR' | 'DEF' | 'MED' | 'DEL';

export interface PositionDef {
  label: string;
  group: PositionGroup;
  // Cancha vertical: el equipo ataca hacia arriba (y chico = arco rival,
  // y grande = arco propio). x es izquierda/derecha tal como se ve la
  // cancha desde arriba, que coincide con la derecha/izquierda real del
  // jugador cuando mira hacia adelante (hacia y chico).
  x: number; // 0-100
  y: number; // 0-100
}

// Catálogo de posiciones de cancha: cubre tanto las líneas de fondo (4-3-3 /
// 4-2-3-1) como los roles adicionales que aparecen en sistemas con línea de
// 3 o 5 en el fondo (Carrilero, Central, Volante central), cada una en un
// lugar fijo. Qué subconjunto de estas posiciones corresponde llenar en un
// partido puntual lo decide `formationSlots` (lib/formations.ts) según el
// sistema elegido para ese partido.
export const POSITIONS: PositionDef[] = [
  { label: 'Arquero', group: 'POR', x: 50, y: 92 },
  { label: 'Lateral derecho', group: 'DEF', x: 80, y: 74 },
  { label: 'Carrilero derecho', group: 'DEF', x: 86, y: 60 },
  { label: 'Central derecho', group: 'DEF', x: 62, y: 80 },
  { label: 'Central', group: 'DEF', x: 50, y: 82 },
  { label: 'Central izquierdo', group: 'DEF', x: 38, y: 80 },
  { label: 'Lateral izquierdo', group: 'DEF', x: 20, y: 74 },
  { label: 'Carrilero izquierdo', group: 'DEF', x: 14, y: 60 },
  // El volante central queda más retrasado que los interiores (no a la
  // misma altura) para que un 4-3-3/4-3-1-2 se lea como 1 volante + 2
  // interiores en vez de 3 fichas apretadas en una sola línea.
  { label: 'Medio centro derecho', group: 'MED', x: 64, y: 50 },
  { label: 'Volante central', group: 'MED', x: 50, y: 62 },
  { label: 'Medio centro izquierdo', group: 'MED', x: 36, y: 50 },
  { label: 'Mediapunta', group: 'MED', x: 50, y: 36 },
  { label: 'Extremo derecho', group: 'MED', x: 80, y: 22 },
  { label: 'Extremo izquierdo', group: 'MED', x: 20, y: 22 },
  { label: 'Delantero centro', group: 'DEL', x: 50, y: 10 },
  // Misma altura que "Delantero centro" (mismo y) pero a un costado, con la
  // misma separación que hay entre los dos centrales (24), para que el
  // dúo de ataque se lea ancho y no superpuesto.
  { label: 'Segundo delantero', group: 'DEL', x: 26, y: 10 },
];

export const POSITION_LABELS = POSITIONS.map((p) => p.label);

// Sinónimos de texto libre usados antes de que la posición fuera una lista
// desplegable, para que el campograma y las estadísticas los ubiquen de
// forma razonable en lugar de perderlos o amontonarlos al centro. Al ser
// ambiguos en lado, se resuelven hacia una opción por defecto; el analista
// puede arrastrar para corregir.
const ALIASES: Record<string, string> = {
  Delantero: 'Delantero centro',
  'Defensa central': 'Central izquierdo',
  Volante: 'Medio centro izquierdo',
  'Volante derecho': 'Medio centro derecho',
  'Volante izquierdo': 'Medio centro izquierdo',
  'Volante defensivo': 'Volante central',
  'Volante ofensivo': 'Mediapunta',
  Enganche: 'Mediapunta',
  Líbero: 'Central',
};

export function positionDef(label: string): PositionDef | undefined {
  return POSITIONS.find((p) => p.label === label) || POSITIONS.find((p) => p.label === ALIASES[label]);
}

// Orden arquero-defensa-medio-delantero (el mismo del catálogo POSITIONS),
// usado para que la tabla de jugadores tanto en la app como en el informe
// se ordenen igual por posición en vez de alfabéticamente.
export function positionOrderIndex(posicion: string): number {
  const def = positionDef(posicion);
  return def ? POSITION_LABELS.indexOf(def.label) : POSITION_LABELS.length;
}

export function groupColor(group: PositionGroup | undefined): string {
  switch (group) {
    case 'POR':
      return '#d97706'; // amber-600
    case 'DEF':
      return '#2563eb'; // blue-600
    case 'MED':
      return '#16a34a'; // green-600
    case 'DEL':
      return '#dc2626'; // red-600
    default:
      return '#475569'; // slate-600
  }
}

// Ajusta, después de construir los 11 puestos de un XI, al dúo Delantero
// centro + Segundo delantero para que queden simétricos con respecto al
// centro, en vez de uno centrado y el otro a un costado. Van más separados
// que un central de cada lado (FORWARD_HALF_WIDTH > ancho de los centrales):
// sus etiquetas ("Segundo delantero", "Delantero centro") son más largas y,
// al ancho de los centrales, los nombres se superponían en el medio. Si el
// sistema usa un solo delantero, no hay "Segundo delantero" en la lista y
// esta función no hace nada (el delantero solitario se queda centrado).
const FORWARD_HALF_WIDTH = 20;

export function symmetrizeForwardPair(entries: { posicion: string; x?: number; y?: number }[]): void {
  const dc = entries.find((e) => e.posicion === 'Delantero centro');
  const sd = entries.find((e) => e.posicion === 'Segundo delantero');
  if (!dc || !sd) return;
  const delantero = positionDef('Delantero centro');
  if (!delantero) return;
  dc.x = 50 + FORWARD_HALF_WIDTH;
  sd.x = 50 - FORWARD_HALF_WIDTH;
  dc.y = delantero.y;
  sd.y = delantero.y;
}

// En un 4-2-3-1 el doble pivote lo forman "Medio centro derecho"/"Medio
// centro izquierdo" (no hay "Volante central" en ese sistema, a diferencia
// de un 4-3-3 o 4-3-1-2 donde esos mismos medios sí acompañan a un volante
// central y van más abiertos que los centrales a propósito). En ese caso
// deben quedar exactamente al mismo ancho que los centrales, no más afuera.
export function symmetrizeDoublePivote(entries: { posicion: string; x?: number; y?: number }[]): void {
  if (entries.some((e) => e.posicion === 'Volante central')) return;
  const der = entries.find((e) => e.posicion === 'Medio centro derecho');
  const izq = entries.find((e) => e.posicion === 'Medio centro izquierdo');
  if (!der || !izq) return;
  const centralDer = positionDef('Central derecho');
  const centralIzq = positionDef('Central izquierdo');
  const interDer = positionDef('Medio centro derecho');
  const interIzq = positionDef('Medio centro izquierdo');
  if (!centralDer || !centralIzq || !interDer || !interIzq) return;
  der.x = centralDer.x;
  der.y = interDer.y;
  izq.x = centralIzq.x;
  izq.y = interIzq.y;
}

// Coordenada por defecto para un jugador nuevo en una posición, evitando
// superponerlo exactamente sobre otro jugador ya ubicado en la misma posición.
export function defaultCoordsFor(
  posicion: string,
  existing: { posicion: string; x?: number; y?: number }[]
): { x: number; y: number } {
  const def = positionDef(posicion);
  const base = def ? { x: def.x, y: def.y } : { x: 50, y: 50 };
  const sameSpot = existing.filter((e) => Math.abs((e.x ?? base.x) - base.x) < 4 && Math.abs((e.y ?? base.y) - base.y) < 4);
  if (sameSpot.length === 0) return base;
  const offset = 10 * sameSpot.length * (sameSpot.length % 2 === 0 ? 1 : -1);
  const x = Math.min(96, Math.max(4, base.x + offset));
  return { x, y: base.y };
}

// Dada una coordenada (x,y) arbitraria, la posición cuyo punto por defecto
// está más cerca. Se usa al soltar un jugador arrastrado en el campograma
// del plantel, para decidir a qué posición pasa a pertenecer.
export function nearestPosition(x: number, y: number): PositionDef {
  let best = POSITIONS[0];
  let bestDist = Infinity;
  for (const p of POSITIONS) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
