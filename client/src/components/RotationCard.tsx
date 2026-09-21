import type { Player } from '../types';
import type { PositionRotation } from '../lib/stats';
import { playerName } from '../lib/lookup';

export function rotationLevel(jugadoresDistintos: number): { label: string; className: string } {
  if (jugadoresDistintos <= 1) return { label: 'Posición fija', className: 'bg-emerald-100 text-emerald-700' };
  if (jugadoresDistintos === 2) return { label: 'Rotación moderada', className: 'bg-amber-100 text-amber-700' };
  return { label: 'Rotación alta', className: 'bg-red-100 text-red-700' };
}

export function RotationCard({
  data,
  players,
  compact = false,
}: {
  data: PositionRotation;
  players: Map<string, Player>;
  compact?: boolean;
}) {
  const level = rotationLevel(data.jugadoresDistintos);
  return (
    <div className={compact ? 'card p-2.5' : 'card p-4'}>
      <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-3'}`}>
        <div>
          <span className={`font-semibold text-slate-800 ${compact ? 'text-sm' : ''}`}>{data.posicion}</span>
          {!compact && (
            <span className="text-xs text-slate-400 ml-2">
              {data.jugadoresDistintos} jugador{data.jugadoresDistintos === 1 ? '' : 'es'} utilizado
              {data.jugadoresDistintos === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className={`badge ${level.className} ${compact ? 'text-[10px] px-1 py-0' : ''}`}>{level.label}</span>
      </div>
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {data.jugadores.map((j) => {
          const pct = data.titularidadesTotales > 0 ? (j.count / data.titularidadesTotales) * 100 : 0;
          return (
            <div key={j.playerId}>
              <div className={`flex justify-between mb-0.5 ${compact ? 'text-[11px]' : 'text-sm'}`}>
                <span>{playerName(players, j.playerId)}</span>
                <span className="text-slate-400">
                  {j.count} tit. ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className={`bg-slate-100 rounded-full overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}>
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
