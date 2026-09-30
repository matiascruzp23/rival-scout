import type { PlayerPositionCount } from '../lib/stats';
import { groupColor, positionAbbr, positionDef } from '../lib/positions';

const VIEW_W = 90;
const VIEW_H = 118;

export interface PlayerPositionSeries {
  label: string;
  color: string;
  historial: PlayerPositionCount[];
}

// Campograma con una burbuja por cada posición que el/los jugador(es)
// ocuparon de titular en el historial de partidos (ver
// playerPositionHistory): a diferencia de SquadDepthPitch (que es por
// equipo y solo muestra las posiciones del sistema actual), acá se plotea
// cualquier posición realmente jugada, esté o no en el sistema vigente. Con
// una sola serie el color de cada burbuja es el de su línea (arco/defensa/
// medio/ataque, igual que el resto de los campogramas); al comparar 2
// jugadores, el color pasa a identificar a cada jugador (como el radar), y
// si ambos jugaron la misma posición sus burbujas se separan un poco para
// no quedar una tapada por la otra.
export function PlayerPositionPitch({ series }: { series: PlayerPositionSeries[] }) {
  const comparando = series.length > 1;

  const seriesPorPosicion = new Map<string, number>();
  for (const s of series) {
    for (const h of s.historial) {
      if (positionDef(h.posicion)) seriesPorPosicion.set(h.posicion, (seriesPorPosicion.get(h.posicion) || 0) + 1);
    }
  }

  const bubbles = series.flatMap((s, si) =>
    s.historial
      .map((h) => {
        const def = positionDef(h.posicion);
        if (!def) return null;
        const compartida = (seriesPorPosicion.get(h.posicion) || 0) > 1;
        const offsetX = compartida ? (si % 2 === 0 ? -3.4 : 3.4) : 0;
        return { posicion: h.posicion, count: h.count, x: def.x, y: def.y, group: def.group, color: s.color, offsetX };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
  );

  const sinReconocer = series.flatMap((s) =>
    s.historial.filter((h) => !positionDef(h.posicion)).map((h) => `${h.posicion} (${h.count})${comparando ? ` — ${s.label}` : ''}`)
  );

  const totalRegistros = series.reduce((sum, s) => sum + s.historial.length, 0);
  if (totalRegistros === 0) {
    return <p className="text-sm text-slate-400">Sin partidos con posición en cancha registrada.</p>;
  }

  return (
    <div>
      {comparando && (
        <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-sm text-slate-700">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 320, background: 'linear-gradient(#1f7a3d, #1a6b35)', borderRadius: 8 }}
      >
        <g stroke="#ffffff" strokeOpacity={0.4} fill="none" strokeWidth={0.4}>
          <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} />
          <line x1={1} y1={VIEW_H / 2} x2={VIEW_W - 1} y2={VIEW_H / 2} />
          <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={11} />
        </g>
        {bubbles.map((b, i) => {
          const x = (b.x / 100) * VIEW_W + b.offsetX;
          const y = (b.y / 100) * VIEW_H;
          const fill = comparando ? b.color : groupColor(b.group);
          return (
            <g key={`${b.posicion}-${i}`} transform={`translate(${x}, ${y})`}>
              <circle r={comparando ? 4.4 : 5.2} fill={fill} stroke="white" strokeWidth={0.4} />
              <text
                textAnchor="middle"
                dy={1.2}
                fontSize={2.9}
                fontWeight={700}
                fill="white"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 0.4 }}
              >
                {positionAbbr(b.posicion)}
              </text>
              <g transform="translate(4.0, -4.0)">
                <circle r={2.4} fill="white" stroke={fill} strokeWidth={0.5} />
                <text textAnchor="middle" dy={0.85} fontSize={2.5} fontWeight={700} fill={fill}>
                  {b.count}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      {sinReconocer.length > 0 && (
        <p className="text-xs text-slate-400 mt-1">También jugó en: {sinReconocer.join(', ')}.</p>
      )}
    </div>
  );
}
