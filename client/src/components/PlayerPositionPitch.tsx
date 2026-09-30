import type { PlayerPositionCount } from '../lib/stats';
import { groupColor, positionAbbr, positionDef } from '../lib/positions';

const VIEW_W = 90;
const VIEW_H = 118;

// Campograma con una burbuja por cada posición que el jugador ocupó de
// titular en el historial de partidos (ver playerPositionHistory): a
// diferencia de SquadDepthPitch (que es por equipo y solo muestra las
// posiciones del sistema actual), acá se plotea cualquier posición
// realmente jugada, esté o no en el sistema vigente — el número es cuántas
// veces jugó ahí, no cuántos jugadores distintos.
export function PlayerPositionPitch({ historial }: { historial: PlayerPositionCount[] }) {
  const spots = historial
    .map((h) => {
      const def = positionDef(h.posicion);
      return def ? { ...h, x: def.x, y: def.y, group: def.group } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const sinReconocer = historial.filter((h) => !positionDef(h.posicion));

  if (historial.length === 0) {
    return <p className="text-sm text-slate-400">Sin partidos con posición en cancha registrada para este jugador.</p>;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 320, background: 'linear-gradient(#1f7a3d, #1a6b35)', borderRadius: 8 }}
      >
        <g stroke="#ffffff" strokeOpacity={0.4} fill="none" strokeWidth={0.4}>
          <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} />
          <line x1={1} y1={VIEW_H / 2} x2={VIEW_W - 1} y2={VIEW_H / 2} />
          <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={11} />
        </g>
        {spots.map((s) => {
          const x = (s.x / 100) * VIEW_W;
          const y = (s.y / 100) * VIEW_H;
          const color = groupColor(s.group);
          return (
            <g key={s.posicion} transform={`translate(${x}, ${y})`}>
              <circle r={5.2} fill={color} stroke="white" strokeWidth={0.4} />
              <text
                textAnchor="middle"
                dy={1.2}
                fontSize={2.9}
                fontWeight={700}
                fill="white"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 0.4 }}
              >
                {positionAbbr(s.posicion)}
              </text>
              <g transform="translate(4.4, -4.4)">
                <circle r={2.6} fill="white" stroke={color} strokeWidth={0.5} />
                <text textAnchor="middle" dy={0.9} fontSize={2.7} fontWeight={700} fill={color}>
                  {s.count}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      {sinReconocer.length > 0 && (
        <p className="text-xs text-slate-400 mt-1">
          También jugó en: {sinReconocer.map((s) => `${s.posicion} (${s.count})`).join(', ')}.
        </p>
      )}
    </div>
  );
}
