import type { LineupEntry } from '../types';
import { defaultCoordsFor, positionDef, symmetrizeBackThree, symmetrizeDoublePivote, symmetrizeForwardPair } from './positions';

// Para cada sistema seleccionable (ver lib/systems.ts), la lista ordenada de
// las 11 posiciones que ese sistema reparte en cancha. Es lo que permite que,
// al elegir un sistema para un partido, el XI se arme mostrando exactamente
// esas posiciones a rellenar en vez de dejar que se elija cualquier posición
// para cualquier jugador.
const TEMPLATES: Record<string, string[]> = {
  '4-4-2': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Extremo derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Extremo izquierdo',
    'Delantero centro',
    'Segundo delantero',
  ],
  '4-3-3': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Medio centro derecho',
    'Volante central',
    'Medio centro izquierdo',
    'Extremo derecho',
    'Extremo izquierdo',
    'Delantero centro',
  ],
  '4-2-3-1': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Mediapunta',
    'Extremo derecho',
    'Extremo izquierdo',
    'Delantero centro',
  ],
  '4-1-4-1': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Volante central',
    'Extremo derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Extremo izquierdo',
    'Delantero centro',
  ],
  '4-3-1-2': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Medio centro derecho',
    'Volante central',
    'Medio centro izquierdo',
    'Mediapunta',
    'Delantero centro',
    'Segundo delantero',
  ],
  '4-4-1-1': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Extremo derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Extremo izquierdo',
    'Mediapunta',
    'Delantero centro',
  ],
  '4-2-2-2': [
    'Arquero',
    'Lateral derecho',
    'Central derecho',
    'Central izquierdo',
    'Lateral izquierdo',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Extremo derecho',
    'Extremo izquierdo',
    'Delantero centro',
    'Segundo delantero',
  ],
  '3-4-3': [
    'Arquero',
    'Central derecho',
    'Central',
    'Central izquierdo',
    'Carrilero derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Carrilero izquierdo',
    'Extremo derecho',
    'Delantero centro',
    'Extremo izquierdo',
  ],
  '3-4-2-1': [
    'Arquero',
    'Central derecho',
    'Central',
    'Central izquierdo',
    'Carrilero derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Carrilero izquierdo',
    'Mediapunta derecho',
    'Mediapunta izquierdo',
    'Delantero centro',
  ],
  '3-5-2': [
    'Arquero',
    'Central derecho',
    'Central',
    'Central izquierdo',
    'Carrilero derecho',
    'Medio centro derecho',
    'Volante central',
    'Medio centro izquierdo',
    'Carrilero izquierdo',
    'Delantero centro',
    'Segundo delantero',
  ],
  '5-3-2': [
    'Arquero',
    'Carrilero derecho',
    'Central derecho',
    'Central',
    'Central izquierdo',
    'Carrilero izquierdo',
    'Medio centro derecho',
    'Volante central',
    'Medio centro izquierdo',
    'Delantero centro',
    'Segundo delantero',
  ],
  '5-4-1': [
    'Arquero',
    'Carrilero derecho',
    'Central derecho',
    'Central',
    'Central izquierdo',
    'Carrilero izquierdo',
    'Extremo derecho',
    'Medio centro derecho',
    'Medio centro izquierdo',
    'Extremo izquierdo',
    'Delantero centro',
  ],
};

export function formationSlots(sistema: string): string[] | null {
  return TEMPLATES[sistema] || null;
}

// Puestos de un sistema con sus coordenadas por defecto, ya simetrizados.
export function templateLineup(sistema: string): LineupEntry[] | null {
  const template = formationSlots(sistema);
  if (!template) return null;
  const placed: { posicion: string; x: number; y: number }[] = [];
  const next: LineupEntry[] = template.map((posicion) => {
    const { x, y } = defaultCoordsFor(posicion, placed);
    placed.push({ posicion, x, y });
    return { playerId: '', posicion, x, y };
  });
  symmetrizeForwardPair(next);
  symmetrizeDoublePivote(next);
  symmetrizeBackThree(next);
  return next;
}

// Costo de mover a un jugador desde su puesto actual a un puesto del nuevo
// sistema: distancia en cancha, con castigo por cambiar de línea y el arco
// reservado para el arquero.
function remapCost(from: LineupEntry, to: LineupEntry): number {
  if (from.posicion === to.posicion) return 0;
  const defFrom = positionDef(from.posicion);
  const defTo = positionDef(to.posicion);
  const fx = from.x ?? defFrom?.x ?? 50;
  const fy = from.y ?? defFrom?.y ?? 50;
  let cost = (fx - (to.x ?? 50)) ** 2 + (fy - (to.y ?? 50)) ** 2;
  if ((defFrom?.group === 'POR') !== (defTo?.group === 'POR')) cost += 100000;
  else if (defFrom && defTo && defFrom.group !== defTo.group) cost += 400;
  // Un jugador de banda (lateral, carrilero, extremo) sigue por fuera y uno
  // interior sigue por dentro mientras se pueda.
  const porFuera = (x: number) => Math.abs(x - 50) > 22;
  if (porFuera(fx) !== porFuera(to.x ?? 50)) cost += 300;
  return cost;
}

// Al cambiar el sistema de un partido ya cargado, reubica a los mismos
// jugadores en los puestos del nuevo sistema (asignación de costo mínimo,
// por máscara de bits: son a lo más 11 puestos). Devuelve el nuevo XI y,
// por jugador, el cambio de puesto (para corregir las sustituciones).
export function remapLineupToSystem(
  lineup: LineupEntry[],
  sistema: string
): { lineup: LineupEntry[]; cambios: Map<string, { antes: string; despues: string }> } | null {
  const slots = templateLineup(sistema);
  if (!slots) return null;
  const jugadores = lineup.filter((l) => l.playerId);
  const asignables = jugadores.slice(0, slots.length);
  const n = asignables.length;
  const m = slots.length;
  // dp[mask] = costo mínimo de ubicar a los primeros popcount(mask) jugadores
  // en los puestos de mask.
  const size = 1 << m;
  const dp = new Array<number>(size).fill(Infinity);
  const choice = new Array<number>(size).fill(-1);
  const bits = (x: number) => {
    let c = 0;
    for (; x; x &= x - 1) c++;
    return c;
  };
  dp[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] === Infinity) continue;
    const i = bits(mask);
    if (i >= n) continue;
    for (let j = 0; j < m; j++) {
      if (mask & (1 << j)) continue;
      const nm = mask | (1 << j);
      const c = dp[mask] + remapCost(asignables[i], slots[j]);
      if (c < dp[nm]) {
        dp[nm] = c;
        choice[nm] = j;
      }
    }
  }
  let best = -1;
  for (let mask = 0; mask < size; mask++) {
    if (bits(mask) === n && (best === -1 || dp[mask] < dp[best])) best = mask;
  }
  const cambios = new Map<string, { antes: string; despues: string }>();
  for (let mask = best, i = n - 1; i >= 0; i--) {
    const j = choice[mask];
    slots[j].playerId = asignables[i].playerId;
    cambios.set(asignables[i].playerId, { antes: asignables[i].posicion, despues: slots[j].posicion });
    mask &= ~(1 << j);
  }
  // Si sobraban jugadores (XI armado sin sistema con más de 11 puestos), se
  // conservan tal cual al final.
  return { lineup: [...slots, ...jugadores.slice(slots.length)], cambios };
}
