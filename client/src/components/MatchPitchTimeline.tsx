import { useMemo, useState } from 'react';
import type { Match, Player } from '../types';
import { Pitch, type PitchToken } from './Pitch';
import { buildLayoutTimeline } from '../lib/pitchLayout';
import { playerMap, playerName } from '../lib/lookup';

export function MatchPitchTimeline({ match, players }: { match: Match; players: Player[] }) {
  const timeline = useMemo(() => buildLayoutTimeline(match), [match]);
  const map = playerMap(players);
  const [selected, setSelected] = useState(0);
  const checkpoint = timeline[Math.min(selected, timeline.length - 1)];

  const tokens: PitchToken[] = checkpoint.layout
    .filter((l) => l.playerId)
    .map((l) => ({
      key: l.playerId,
      x: l.x ?? 50,
      y: l.y ?? 50,
      posicion: l.posicion,
      player: players.find((p) => p.id === l.playerId),
    }));

  if (checkpoint.layout.length === 0) {
    return <p className="text-sm text-slate-400">Registra el XI inicial para ver el campograma del partido.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {timeline.map((cp, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
              i === selected ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
            }`}
          >
            {cp.label} ({cp.marcador.favor}-{cp.marcador.contra})
          </button>
        ))}
      </div>
      <Pitch tokens={tokens} />
      {(checkpoint.subs.length > 0 || checkpoint.rojas.length > 0) && (
        <div className="text-xs text-slate-500 mt-2 space-y-0.5">
          {checkpoint.subs.map((sub) => (
            <p key={sub.id}>
              {playerName(map, sub.jugadorSaleId)} → {playerName(map, sub.jugadorEntraId)} (min. {sub.minuto}')
              {sub.sistemaResultante ? ` · Sistema: ${sub.sistemaResultante}` : ''}
              {sub.sistemaResultante && sub.descripcion ? ` · ${sub.descripcion}` : ''}
            </p>
          ))}
          {checkpoint.rojas.map((event) => (
            <p key={event.id} className="text-red-600">
              Tarjeta roja: {playerName(map, event.jugadorId || '')} (min. {event.minuto}') · el equipo queda con un
              jugador menos
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
