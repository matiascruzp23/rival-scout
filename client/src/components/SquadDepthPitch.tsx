import type { PositionRotation } from '../lib/stats';
import { playerMap } from '../lib/lookup';
import type { Player } from '../types';
import { groupColor, type PositionGroup } from '../lib/positions';

const VIEW_W = 90;
const VIEW_H = 118;

interface LayoutSpot {
  label: string;
  group: PositionGroup;
  x: number;
  y: number;
}

// Distribución propia (no la del campograma táctico): separada lo justo
// para que quepan varias líneas de jugadores por posición sin que se
// encimen con las posiciones vecinas, y sin sobrar espacio bajo el arquero.
const LAYOUT: LayoutSpot[] = [
  { label: 'Delantero centro', group: 'DEL', x: 45, y: 9 },
  { label: 'Extremo izquierdo', group: 'MED', x: 10, y: 25 },
  { label: 'Extremo derecho', group: 'MED', x: 80, y: 25 },
  { label: 'Mediapunta', group: 'MED', x: 45, y: 43 },
  { label: 'Interior izquierdo', group: 'MED', x: 18, y: 61 },
  { label: 'Interior derecho', group: 'MED', x: 72, y: 61 },
  { label: 'Lateral izquierdo', group: 'DEF', x: 8, y: 83 },
  { label: 'Central izquierdo', group: 'DEF', x: 32, y: 87 },
  { label: 'Central derecho', group: 'DEF', x: 58, y: 87 },
  { label: 'Lateral derecho', group: 'DEF', x: 82, y: 83 },
  { label: 'Arquero', group: 'POR', x: 45, y: 104 },
];

function apellido(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  return parts[parts.length - 1] || nombre;
}

export function SquadDepthPitch({ rotation, players }: { rotation: PositionRotation[]; players: Player[] }) {
  const map = playerMap(players);
  const byPosicion = new Map(rotation.map((r) => [r.posicion, r]));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: '100%', height: 480, background: 'linear-gradient(#1f7a3d, #1a6b35)', borderRadius: 8 }}
    >
      <g stroke="#ffffff" strokeOpacity={0.4} fill="none" strokeWidth={0.4}>
        <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} />
        <line x1={1} y1={VIEW_H / 2} x2={VIEW_W - 1} y2={VIEW_H / 2} />
        <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={11} />
      </g>
      {LAYOUT.map((spot) => {
        const r = byPosicion.get(spot.label);
        const color = groupColor(spot.group);
        return (
          <g key={spot.label} transform={`translate(${spot.x}, ${spot.y})`}>
            <circle r={4.6} fill={r ? color : 'rgba(255,255,255,0.15)'} stroke="white" strokeWidth={0.4} />
            <text textAnchor="middle" dy={1.1} fontSize={3.4} fontWeight={700} fill="white">
              {r ? r.jugadoresDistintos : '–'}
            </text>
            <text
              textAnchor="middle"
              y={7.6}
              fontSize={2.4}
              fontWeight={600}
              fill="white"
              style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.65)', strokeWidth: 0.7 }}
            >
              {spot.label}
            </text>
            {r?.jugadores.map((j, i) => (
              <text
                key={j.playerId}
                textAnchor="middle"
                y={11.2 + i * 3.2}
                fontSize={2.2}
                fill="#dcfce7"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.65)', strokeWidth: 0.7 }}
              >
                {apellido(map.get(j.playerId)?.nombre || '?')} ({j.count})
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
