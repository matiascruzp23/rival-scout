import { useState } from 'react';
import type { LineupEntry, MatchEvent, Player, Substitution } from '../types';
import { PositionSelect } from './PositionSelect';
import { SystemSelect } from './SystemSelect';
import { Pitch, type PitchToken } from './Pitch';
import { computeDefaultLayoutForSub, onFieldBefore } from '../lib/pitchLayout';

function newSub(): Substitution {
  return {
    id: Math.random().toString(36).slice(2, 10),
    minuto: 46,
    jugadorSaleId: '',
    jugadorEntraId: '',
    posicionSale: '',
    posicionEntra: '',
    descripcion: '',
    sistemaResultante: '',
  };
}

export function SubstitutionsEditor({
  players,
  lineup,
  substitutions,
  banca,
  events,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  lineup: LineupEntry[];
  substitutions: Substitution[];
  banca: string[];
  events: MatchEvent[];
  onChange: (subs: Substitution[]) => void;
  readOnly?: boolean;
}) {
  const [editingLayout, setEditingLayout] = useState<string | null>(null);

  const update = (index: number, patch: Partial<Substitution>) => {
    const next = [...substitutions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(substitutions.filter((_, i) => i !== index));
  };

  const sorted = substitutions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.minuto - b.s.minuto);

  return (
    <fieldset disabled={readOnly} className="space-y-3">
      {sorted.map(({ s, i }) => {
        const enCancha = onFieldBefore({ lineup, substitutions, events }, s.minuto, s.id);
        const enCanchaIds = new Set(enCancha.map((l) => l.playerId));
        const puedenSalir = players.filter((p) => enCanchaIds.has(p.id) || p.id === s.jugadorSaleId);
        // Solo quienes fueron citados (banca, o ya entraron en otro cambio)
        // pueden entrar: primero se completa la convocatoria y luego los
        // cambios, así acá no aparece nadie que no haya sido citado.
        const bancaIds = new Set([...banca, ...substitutions.map((sub) => sub.jugadorEntraId)]);
        const puedenEntrar = players.filter((p) => (bancaIds.has(p.id) && !enCanchaIds.has(p.id)) || p.id === s.jugadorEntraId);
        return (
        <div key={s.id} className="card p-3 border-slate-200">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2">
              <label className="label">Minuto</label>
              <input
                type="number"
                className="input"
                value={s.minuto}
                onChange={(e) => update(i, { minuto: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-3">
              <label className="label">Sale</label>
              <select className="input" value={s.jugadorSaleId} onChange={(e) => update(i, { jugadorSaleId: e.target.value })}>
                <option value="">—</option>
                {puedenSalir.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dorsal ? `#${p.dorsal} ` : ''}
                    {p.nombre}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-0.5">Solo quienes están en cancha en ese minuto.</p>
            </div>
            <div className="col-span-2">
              <label className="label">Pos. sale</label>
              <PositionSelect value={s.posicionSale} onChange={(v) => update(i, { posicionSale: v })} />
            </div>
            <div className="col-span-3">
              <label className="label">Entra</label>
              <select className="input" value={s.jugadorEntraId} onChange={(e) => update(i, { jugadorEntraId: e.target.value })}>
                <option value="">—</option>
                {puedenEntrar.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dorsal ? `#${p.dorsal} ` : ''}
                    {p.nombre}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-0.5">Solo quienes están en la banca.</p>
            </div>
            <div className="col-span-2">
              <label className="label">Pos. entra</label>
              <PositionSelect value={s.posicionEntra} onChange={(v) => update(i, { posicionEntra: v })} />
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2 items-end mt-2">
            <div className="col-span-4">
              <label className="label">Cambio de sistema (opcional)</label>
              <SystemSelect value={s.sistemaResultante || ''} onChange={(v) => update(i, { sistemaResultante: v })} emptyLabel="Sin cambio de sistema" />
            </div>
            {s.sistemaResultante && (
              <div className="col-span-8">
                <label className="label">Descripción breve</label>
                <input
                  className="input"
                  placeholder='Ej: "Pasa a línea de 5 para cerrar el partido"'
                  value={s.descripcion}
                  onChange={(e) => update(i, { descripcion: e.target.value })}
                />
              </div>
            )}
            {!readOnly && (
              <div className="col-span-12 flex justify-between items-center">
                <button
                  className="text-xs text-emerald-700 hover:underline"
                  onClick={() => setEditingLayout(editingLayout === s.id ? null : s.id)}
                  disabled={!s.jugadorSaleId || !s.jugadorEntraId}
                  title={!s.jugadorSaleId || !s.jugadorEntraId ? 'Selecciona quién sale y quién entra primero' : ''}
                >
                  {editingLayout === s.id ? 'Ocultar campograma' : 'Ajustar distribución en el campograma'}
                </button>
                <button className="text-xs text-red-600 hover:underline" onClick={() => remove(i)}>
                  Eliminar sustitución
                </button>
              </div>
            )}
          </div>

          {editingLayout === s.id && (
            <SubLayoutEditor
              players={players}
              lineup={lineup}
              substitutions={substitutions}
              events={events}
              subId={s.id}
              onSave={(layout) => {
                update(i, { layoutResultante: layout });
                setEditingLayout(null);
              }}
              onCancel={() => setEditingLayout(null)}
            />
          )}
        </div>
        );
      })}
      {!readOnly && (
        <button className="btn-secondary" onClick={() => onChange([...substitutions, newSub()])}>
          + Agregar sustitución
        </button>
      )}
    </fieldset>
  );
}

function SubLayoutEditor({
  players,
  lineup,
  substitutions,
  events,
  subId,
  onSave,
  onCancel,
}: {
  players: Player[];
  lineup: LineupEntry[];
  substitutions: Substitution[];
  events: MatchEvent[];
  subId: string;
  onSave: (layout: LineupEntry[]) => void;
  onCancel: () => void;
}) {
  const [layout, setLayout] = useState<LineupEntry[]>(() =>
    computeDefaultLayoutForSub({ lineup, substitutions, events }, subId)
  );

  const moveToken = (playerId: string, x: number, y: number) => {
    setLayout((prev) => prev.map((e) => (e.playerId === playerId ? { ...e, x, y } : e)));
  };

  const tokens: PitchToken[] = layout
    .filter((l) => l.playerId)
    .map((l) => ({
      key: l.playerId,
      x: l.x ?? 50,
      y: l.y ?? 50,
      posicion: l.posicion,
      player: players.find((p) => p.id === l.playerId),
    }));

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500 mb-2">
        Distribución de los 11 en cancha justo después de este cambio. Arrastra a cualquier jugador que también haya
        cambiado de posición (no solo al que entró).
      </p>
      <Pitch tokens={tokens} onMove={moveToken} height={300} />
      <div className="flex justify-end gap-2 mt-2">
        <button className="btn-secondary text-xs" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn-primary text-xs" onClick={() => onSave(layout)}>
          Guardar distribución
        </button>
      </div>
    </div>
  );
}
