import type { PositionRotation } from '../lib/stats';
import { playerMap } from '../lib/lookup';
import type { Player } from '../types';
import {
  groupColor,
  positionDef,
  positionAbbr,
  symmetrizeDoublePivote,
  symmetrizeForwardPair,
  POSITIONS,
  type PositionGroup,
} from '../lib/positions';
import { formationSlots } from '../lib/formations';

const VIEW_W = 90;
const VIEW_H = 118;

interface LayoutSpot {
  label: string;
  // = label: symmetrizeForwardPair/symmetrizeDoublePivote (lib/positions.ts)
  // identifican al delantero centro/segundo delantero e interiores por este
  // campo, no por label.
  posicion: string;
  group: PositionGroup;
  x: number; // 0-100, sin escalar todavía al viewBox
  y: number; // 0-100
}

// Las posiciones a mostrar: si el rival tiene un sistema reconocido, solo
// las 11 que reparte ese sistema (mismo criterio que el plantel — ver
// PlantelView.boxesForSystem); si no hay sistema definido, el catálogo
// completo, igual que antes. Se exporta para que DashboardPage pueda usar
// exactamente este mismo conjunto al decidir qué posiciones son "no
// reconocidas por el sistema actual" en vez de comparar contra el catálogo
// completo.
export function labelsForSquadDepth(sistema: string | undefined): string[] {
  const slots = sistema ? formationSlots(sistema) : null;
  return slots ? Array.from(new Set(slots)) : POSITIONS.map((p) => p.label);
}

function layoutForSystem(sistema: string | undefined): LayoutSpot[] {
  const layout = labelsForSquadDepth(sistema)
    .map((label) => {
      const def = positionDef(label);
      if (!def) return null;
      return { label, posicion: label, group: def.group, x: def.x, y: def.y };
    })
    .filter((s): s is LayoutSpot => s !== null);
  // Igual que en el resto de los campogramas: sin esto, el segundo
  // delantero/delantero centro (o los interiores sin volante central)
  // quedan con el ancho por defecto del catálogo, que no es simétrico
  // respecto a los centrales.
  symmetrizeForwardPair(layout);
  symmetrizeDoublePivote(layout);
  return layout;
}

function apellido(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  return parts[parts.length - 1] || nombre;
}

export function SquadDepthPitch({
  rotation,
  players,
  sistema,
}: {
  rotation: PositionRotation[];
  players: Player[];
  sistema?: string;
}) {
  const map = playerMap(players);
  const byPosicion = new Map(rotation.map((r) => [r.posicion, r]));
  const layout = layoutForSystem(sistema);

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
      {layout.map((spot) => {
        const r = byPosicion.get(spot.label);
        const color = groupColor(spot.group);
        const x = (spot.x / 100) * VIEW_W;
        const y = (spot.y / 100) * VIEW_H;
        return (
          <g key={spot.label} transform={`translate(${x}, ${y})`}>
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
              {positionAbbr(spot.label)}
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
