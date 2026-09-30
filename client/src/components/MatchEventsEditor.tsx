import type { MatchEvent, MatchEventType, Player } from '../types';
import { BallIcon, CardIcon, EventIcon } from './MatchIcons';

const TYPE_LABELS: Record<MatchEventType, string> = {
  gol_favor: 'Gol a favor (del rival)',
  gol_contra: 'Gol en contra (del oponente)',
  amarilla: 'Tarjeta amarilla',
  roja: 'Tarjeta roja',
};

function needsPlayer(tipo: MatchEventType): boolean {
  return tipo !== 'gol_contra';
}

function newEvent(tipo: MatchEventType): MatchEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    minuto: 1,
    tipo,
    jugadorId: '',
    descripcion: '',
  };
}

export function MatchEventsEditor({
  players,
  events,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  events: MatchEvent[];
  onChange: (events: MatchEvent[]) => void;
  readOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<MatchEvent>) => {
    const next = [...events];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => onChange(events.filter((_, i) => i !== index));

  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.minuto - b.e.minuto);

  return (
    <fieldset disabled={readOnly} className="space-y-3">
      {sorted.map(({ e, i }) => (
        <div key={e.id} className="card p-3 border-slate-200">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2">
              <label className="label">Minuto</label>
              <input type="number" className="input" value={e.minuto} onChange={(ev) => update(i, { minuto: Number(ev.target.value) })} />
            </div>
            <div className="col-span-3">
              <label className="label flex items-center gap-1">
                <EventIcon tipo={e.tipo} /> Tipo
              </label>
              <select className="input" value={e.tipo} onChange={(ev) => update(i, { tipo: ev.target.value as MatchEventType })}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {needsPlayer(e.tipo) && (
              <div className="col-span-7">
                <label className="label">Jugador</label>
                <select className="input" value={e.jugadorId || ''} onChange={(ev) => update(i, { jugadorId: ev.target.value })}>
                  <option value="">—</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.dorsal ? `#${p.dorsal} ` : ''}
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-12">
              <label className="label">Descripción (opcional)</label>
              <input
                className="input"
                placeholder="Ej: de penal, doble amarilla, falta táctica…"
                value={e.descripcion || ''}
                onChange={(ev) => update(i, { descripcion: ev.target.value })}
              />
            </div>
            {!readOnly && (
              <div className="col-span-12 flex justify-end">
                <button className="text-xs text-red-600 hover:underline" onClick={() => remove(i)}>
                  Eliminar evento
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => onChange([...events, newEvent('gol_favor')])}>
            <BallIcon color="#111827" /> Agregar gol
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => onChange([...events, newEvent('gol_contra')])}>
            <BallIcon color="#dc2626" /> Gol en contra
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => onChange([...events, newEvent('amarilla')])}>
            <CardIcon color="#eab308" /> Tarjeta amarilla
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => onChange([...events, newEvent('roja')])}>
            <CardIcon color="#dc2626" /> Tarjeta roja
          </button>
        </div>
      )}
    </fieldset>
  );
}
