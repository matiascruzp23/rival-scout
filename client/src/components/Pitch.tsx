import { useRef, useState } from 'react';
import type { Player } from '../types';
import { groupColor, positionDef } from '../lib/positions';
import { shortName } from '../lib/lookup';

export interface PitchToken {
  key: string;
  x: number;
  y: number;
  posicion: string;
  player?: Player;
  label?: string;
}

// Cancha vertical (retrato): el equipo ataca hacia arriba, arco propio abajo.
const VIEW_W = 68;
const VIEW_H = 100;

function Markings() {
  const boxW = 40;
  const boxH = 18;
  const goalW = 18;
  const goalH = 7;
  const arc = 5;
  return (
    <g stroke="#ffffff" strokeOpacity={0.55} fill="none" strokeWidth={0.5}>
      <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} />
      <line x1={1} y1={VIEW_H / 2} x2={VIEW_W - 1} y2={VIEW_H / 2} />
      <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={11} />
      {/* área arco rival (arriba) */}
      <rect x={(VIEW_W - boxW) / 2} y={1} width={boxW} height={boxH} />
      <rect x={(VIEW_W - goalW) / 2} y={1} width={goalW} height={goalH} />
      {/* área arco propio (abajo) */}
      <rect x={(VIEW_W - boxW) / 2} y={VIEW_H - 1 - boxH} width={boxW} height={boxH} />
      <rect x={(VIEW_W - goalW) / 2} y={VIEW_H - 1 - goalH} width={goalW} height={goalH} />
      {/* arcos de esquina */}
      <path d={`M ${1},${1 + arc} A ${arc},${arc} 0 0 1 ${1 + arc},${1}`} />
      <path d={`M ${VIEW_W - 1 - arc},${1} A ${arc},${arc} 0 0 1 ${VIEW_W - 1},${1 + arc}`} />
      <path d={`M ${1},${VIEW_H - 1 - arc} A ${arc},${arc} 0 0 0 ${1 + arc},${VIEW_H - 1}`} />
      <path d={`M ${VIEW_W - 1 - arc},${VIEW_H - 1} A ${arc},${arc} 0 0 0 ${VIEW_W - 1},${VIEW_H - 1 - arc}`} />
    </g>
  );
}

export function Pitch({
  tokens,
  onMove,
  onMoveEnd,
  height = 420,
}: {
  tokens: PitchToken[];
  onMove?: (key: string, x: number, y: number) => void;
  onMoveEnd?: (key: string, x: number, y: number) => void;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.min(97, Math.max(3, x)),
      y: Math.min(97, Math.max(3, y)),
    };
  };

  const handlePointerDown = (key: string) => (e: React.PointerEvent) => {
    if (!onMove) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(key);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !onMove) return;
    const { x, y } = toLocal(e.clientX, e.clientY);
    lastPos.current = { x, y };
    onMove(dragging, x, y);
  };

  const endDrag = () => {
    if (dragging && lastPos.current && onMoveEnd) {
      onMoveEnd(dragging, lastPos.current.x, lastPos.current.y);
    }
    setDragging(null);
    lastPos.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: '100%', height, background: 'linear-gradient(#1f7a3d, #1a6b35)', borderRadius: 8, touchAction: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <Markings />
      {tokens.map((t) => {
        const color = groupColor(positionDef(t.posicion)?.group);
        const cx = (t.x / 100) * VIEW_W;
        const cy = (t.y / 100) * VIEW_H;
        return (
          <g
            key={t.key}
            transform={`translate(${cx}, ${cy})`}
            style={{ cursor: onMove ? 'grab' : 'default' }}
            onPointerDown={handlePointerDown(t.key)}
          >
            <circle r={4.2} fill={color} stroke="white" strokeWidth={0.5} />
            <text textAnchor="middle" dy={1.4} fontSize={3.6} fontWeight={700} fill="white">
              {t.player?.dorsal ?? ''}
            </text>
            <text
              textAnchor="middle"
              y={7.2}
              fontSize={3}
              fill="white"
              style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 0.6 }}
            >
              {t.label ?? (t.player ? shortName(t.player.nombre) : '')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
