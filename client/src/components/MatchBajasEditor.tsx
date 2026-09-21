import type { MatchBaja, MotivoBaja, Player } from '../types';

const TIPO_OPTIONS: { value: MotivoBaja; label: string }[] = [
  { value: 'lesion', label: 'Lesión' },
  { value: 'suspension', label: 'Suspensión' },
  { value: 'desconocido', label: 'Se desconoce' },
  { value: 'otro', label: 'Otro motivo' },
];

// La lista de "no citados" ya viene armada sola (ver MatchDetailPage: es
// todo jugador activo que no está en el XI ni en la banca), así que aquí
// solo se completa el motivo de cada uno, no se agregan ni quitan jugadores.
export function MatchBajasEditor({
  players,
  bajas,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  bajas: MatchBaja[];
  onChange: (bajas: MatchBaja[]) => void;
  readOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<MatchBaja>) => {
    const next = [...bajas];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  if (bajas.length === 0) {
    return <p className="text-sm text-slate-400">Todo el plantel activo está citado (en el XI o en la banca).</p>;
  }

  return (
    <fieldset disabled={readOnly} className="space-y-2">
      {bajas.map((b, i) => {
        const player = players.find((p) => p.id === b.jugadorId);
        return (
          <div key={b.id} className="flex gap-2 items-center">
            <span className="input flex-1 bg-slate-50 text-slate-700 flex items-center">
              {player ? `${player.dorsal ? `#${player.dorsal} ` : ''}${player.nombre}` : '(jugador eliminado)'}
            </span>
            <select className="input w-40" value={b.tipo} onChange={(e) => update(i, { tipo: e.target.value as MotivoBaja })}>
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="input flex-1"
              placeholder="Detalle (opcional): ej. fractura de tobillo, 4ta amarilla"
              value={b.motivo || ''}
              onChange={(e) => update(i, { motivo: e.target.value })}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
