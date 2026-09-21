import type { Player } from '../types';

export function playerMap(players: Player[]): Map<string, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

export function playerName(players: Player[] | Map<string, Player>, id: string): string {
  const map = Array.isArray(players) ? playerMap(players) : players;
  return map.get(id)?.nombre || '(jugador eliminado)';
}

// "Ignacio González" -> "I. González". Compacto para espacios reducidos
// (campogramas, cajas de posición) y suficiente para distinguir jugadores
// con el mismo apellido.
export function shortName(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  if (parts.length <= 1) return nombre;
  const inicial = parts[0][0]?.toUpperCase() ?? '';
  const apellido = parts[parts.length - 1];
  return `${inicial}. ${apellido}`;
}
