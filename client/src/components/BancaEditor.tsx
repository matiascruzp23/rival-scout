import type { LineupEntry, Player, Substitution } from '../types';

export function BancaEditor({
  players,
  lineup,
  substitutions,
  banca,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  lineup: LineupEntry[];
  substitutions: Substitution[];
  banca: string[];
  onChange: (banca: string[]) => void;
  readOnly?: boolean;
}) {
  const enXI = new Set(lineup.map((l) => l.playerId).filter(Boolean));
  const entraronDeCambio = new Set(substitutions.map((s) => s.jugadorEntraId).filter(Boolean));

  const update = (index: number, playerId: string) => {
    const next = [...banca];
    next[index] = playerId;
    onChange(next);
  };

  const remove = (index: number) => onChange(banca.filter((_, i) => i !== index));

  return (
    <fieldset disabled={readOnly} className="space-y-2">
      <p className="text-xs text-slate-400 -mt-1 mb-1">
        Suplentes que fueron convocados (banca) pero no llegaron a jugar. Quien no esté ni en el XI, ni acá, ni entró de
        cambio, se considera no citado a este partido.
      </p>
      {banca.map((playerId, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select className="input flex-1" value={playerId} onChange={(e) => update(i, e.target.value)}>
            <option value="">Seleccionar jugador…</option>
            {players.map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={
                  p.id !== playerId && (enXI.has(p.id) || entraronDeCambio.has(p.id) || banca.includes(p.id))
                }
              >
                {p.dorsal ? `#${p.dorsal} ` : ''}
                {p.nombre}
              </option>
            ))}
          </select>
          {!readOnly && (
            <button className="text-slate-400 hover:text-red-600 text-lg leading-none px-1" onClick={() => remove(i)}>
              &times;
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button className="btn-secondary" onClick={() => onChange([...banca, ''])}>
          + Agregar suplente a la banca
        </button>
      )}
    </fieldset>
  );
}
