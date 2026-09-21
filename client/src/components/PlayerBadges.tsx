import type { Player } from '../types';

export function PlayerBadges({ player, size = 'sm' }: { player: Player; size?: 'sm' | 'md' }) {
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';
  return (
    <span className="inline-flex gap-1 align-middle">
      {player.baja && (
        <span className={`badge bg-red-100 text-red-700 ${text}`} title="Baja">
          BAJA
        </span>
      )}
      {player.duda && (
        <span className={`badge bg-purple-100 text-purple-700 ${text}`} title="Duda">
          DUDA
        </span>
      )}
      {player.sub21 && (
        <span className={`badge bg-emerald-100 text-emerald-700 ${text}`} title="Sub-21">
          U21
        </span>
      )}
      {player.sub18 && (
        <span className={`badge bg-yellow-100 text-yellow-700 ${text}`} title="Sub-18">
          U18
        </span>
      )}
      {player.extranjero && (
        <span className={`badge bg-sky-100 text-sky-700 ${text}`} title="Extranjero">
          EXT
        </span>
      )}
      {player.enSeleccion && (
        <span className={`badge bg-indigo-100 text-indigo-700 ${text}`} title="Convocado a selección nacional">
          SEL
        </span>
      )}
    </span>
  );
}

export function PlayerNameWithBadges({ player }: { player: Player | undefined }) {
  if (!player) return <span className="text-slate-400 italic">Jugador eliminado</span>;
  return (
    <span className={player.baja ? 'text-slate-400' : ''}>
      {player.nombre}
      {'  '}
      <PlayerBadges player={player} />
    </span>
  );
}
