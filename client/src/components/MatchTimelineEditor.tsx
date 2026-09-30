import { useState } from 'react';
import type { Match, MatchEvent, MatchEventType, Player, Substitution } from '../types';
import { BallIcon, CardIcon, EventIcon } from './MatchIcons';
import { PositionSelect } from './PositionSelect';
import { SystemSelect } from './SystemSelect';
import { SubLayoutEditor } from './SubstitutionsEditor';
import { MatchPitchTimeline } from './MatchPitchTimeline';
import { Modal } from './Modal';
import { onFieldBefore } from '../lib/pitchLayout';

type TimelinePatch = Partial<Pick<Match, 'events' | 'substitutions' | 'banca'>>;

type Item = { kind: 'event'; minuto: number; id: string; event: MatchEvent } | { kind: 'sub'; minuto: number; id: string; sub: Substitution };

const TYPE_LABELS: Record<MatchEventType, string> = {
  gol_favor: 'Gol del rival',
  gol_contra: 'Gol del oponente',
  amarilla: 'Amarilla',
  roja: 'Roja',
};

const newId = () => Math.random().toString(36).slice(2, 10);

function nombre(p: Player | undefined): string {
  if (!p) return '—';
  return `${p.dorsal ? `#${p.dorsal} ` : ''}${p.nombre}`;
}

function PlayerOptions({ list }: { list: Player[] }) {
  return (
    <>
      <option value="">—</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {nombre(p)}
        </option>
      ))}
    </>
  );
}

// Cronología del partido: goles, tarjetas y cambios en una sola lista, una
// fila por hecho, ordenada por minuto. Cada fila se edita en línea.
export function MatchTimelineEditor({
  players,
  citados,
  match,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  citados: Player[];
  match: Match;
  onChange: (patch: TimelinePatch) => void;
  readOnly?: boolean;
}) {
  const { events, substitutions, lineup, banca } = match;
  const byId = new Map(players.map((p) => [p.id, p]));
  const [editing, setEditing] = useState<string | null>(null);
  const [layoutFor, setLayoutFor] = useState<string | null>(null);
  const [showPitch, setShowPitch] = useState(false);

  const items: Item[] = [
    ...events.map((e) => ({ kind: 'event' as const, minuto: e.minuto, id: e.id, event: e })),
    ...substitutions.map((s) => ({ kind: 'sub' as const, minuto: s.minuto, id: s.id, sub: s })),
  ].sort((a, b) => a.minuto - b.minuto);

  const duracion = Math.max(match.duracionMinutos || 90, ...items.map((i) => i.minuto));

  const updateEvent = (id: string, patch: Partial<MatchEvent>) => onChange({ events: events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const updateSub = (id: string, patch: Partial<Substitution>) =>
    onChange({ substitutions: substitutions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const remove = (item: Item) => {
    if (item.kind === 'event') onChange({ events: events.filter((e) => e.id !== item.id) });
    else onChange({ substitutions: substitutions.filter((s) => s.id !== item.id) });
    if (editing === item.id) setEditing(null);
  };

  const lastMinuto = items.length ? items[items.length - 1].minuto : 1;

  const addEvent = (tipo: MatchEventType) => {
    const ev: MatchEvent = { id: newId(), minuto: lastMinuto, tipo, jugadorId: '', descripcion: '' };
    onChange({ events: [...events, ev] });
    setEditing(ev.id);
  };

  const addSub = () => {
    const sub: Substitution = {
      id: newId(),
      minuto: Math.max(46, lastMinuto),
      jugadorSaleId: '',
      jugadorEntraId: '',
      posicionSale: '',
      posicionEntra: '',
      descripcion: '',
      sistemaResultante: '',
    };
    onChange({ substitutions: [...substitutions, sub] });
    setEditing(sub.id);
  };

  // Al elegir quién sale, la posición del que entra se hereda de la suya.
  const setSale = (s: Substitution, saleId: string) => {
    const enCancha = onFieldBefore({ lineup, substitutions, events }, s.minuto, s.id);
    const pos = enCancha.find((l) => l.playerId === saleId)?.posicion || '';
    updateSub(s.id, { jugadorSaleId: saleId, posicionSale: pos, posicionEntra: s.posicionEntra || pos });
  };

  const setEntra = (s: Substitution, entraId: string) => {
    onChange({
      substitutions: substitutions.map((x) => (x.id === s.id ? { ...x, jugadorEntraId: entraId } : x)),
      banca: banca.filter((id) => id !== entraId),
    });
  };

  const icon = (item: Item) =>
    item.kind === 'sub' ? <span className="text-base leading-none text-emerald-700">⇄</span> : <EventIcon tipo={item.event.tipo} />;

  const summary = (item: Item) => {
    if (item.kind === 'event') {
      const e = item.event;
      return (
        <>
          {e.tipo === 'gol_contra' ? <span className="text-slate-600">Gol del oponente</span> : <span>{nombre(byId.get(e.jugadorId || ''))}</span>}
          {e.descripcion && <span className="text-slate-400"> · {e.descripcion}</span>}
        </>
      );
    }
    const s = item.sub;
    const sale = byId.get(s.jugadorSaleId);
    const entra = byId.get(s.jugadorEntraId);
    return (
      <>
        <span className="text-red-600">↓</span> {nombre(sale)}
        {s.posicionSale && <span className="text-slate-400"> ({s.posicionSale})</span>} <span className="ml-1 text-emerald-700">↑</span> {nombre(entra)}
        {s.posicionEntra && s.posicionEntra !== s.posicionSale && <span className="text-slate-400"> ({s.posicionEntra})</span>}
        {s.sistemaResultante && (
          <span className="badge ml-2 bg-amber-50 text-amber-700 border border-amber-200" title={s.descripcion || ''}>
            pasa a {s.sistemaResultante}
          </span>
        )}
        {s.layoutResultante && s.layoutResultante.length > 0 && <span className="ml-2 text-[11px] text-slate-400">distribución ajustada</span>}
      </>
    );
  };

  const eventForm = (e: MatchEvent) => (
    <div className="grid grid-cols-12 gap-2">
      <select className="input col-span-3 py-1 text-sm" value={e.tipo} onChange={(ev) => updateEvent(e.id, { tipo: ev.target.value as MatchEventType })}>
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {e.tipo !== 'gol_contra' && (
        <select className="input col-span-4 py-1 text-sm" value={e.jugadorId || ''} onChange={(ev) => updateEvent(e.id, { jugadorId: ev.target.value })}>
          <PlayerOptions list={citados} />
        </select>
      )}
      <input
        className={`input py-1 text-sm ${e.tipo === 'gol_contra' ? 'col-span-9' : 'col-span-5'}`}
        placeholder="Descripción (opcional): de penal, doble amarilla…"
        value={e.descripcion || ''}
        onChange={(ev) => updateEvent(e.id, { descripcion: ev.target.value })}
      />
    </div>
  );

  const subForm = (s: Substitution) => {
    const enCancha = onFieldBefore({ lineup, substitutions, events }, s.minuto, s.id);
    const enCanchaIds = new Set(enCancha.map((l) => l.playerId));
    const puedenSalir = players.filter((p) => enCanchaIds.has(p.id) || p.id === s.jugadorSaleId);
    const citadosIds = new Set([...banca, ...substitutions.map((x) => x.jugadorEntraId), ...match.bajas.map((b) => b.jugadorId)]);
    const puedenEntrar = players.filter((p) => (citadosIds.has(p.id) && !enCanchaIds.has(p.id)) || p.id === s.jugadorEntraId);
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <label className="col-span-4 text-[11px] text-slate-400">
            Sale
            <select className="input py-1 text-sm text-slate-800" value={s.jugadorSaleId} onChange={(e) => setSale(s, e.target.value)}>
              <PlayerOptions list={puedenSalir} />
            </select>
          </label>
          <label className="col-span-4 text-[11px] text-slate-400">
            Entra
            <select className="input py-1 text-sm text-slate-800" value={s.jugadorEntraId} onChange={(e) => setEntra(s, e.target.value)}>
              <PlayerOptions list={puedenEntrar} />
            </select>
          </label>
          <label className="col-span-4 text-[11px] text-slate-400">
            Posición del que entra
            <PositionSelect className="input py-1 text-sm text-slate-800" value={s.posicionEntra} onChange={(v) => updateSub(s.id, { posicionEntra: v })} />
          </label>
        </div>
        <div className="grid grid-cols-12 gap-2 items-center">
          <SystemSelect
            className="input col-span-4 py-1 text-sm"
            value={s.sistemaResultante || ''}
            onChange={(v) => updateSub(s.id, { sistemaResultante: v })}
            emptyLabel="Sin cambio de sistema"
          />
          {s.sistemaResultante ? (
            <input
              className="input col-span-5 py-1 text-sm"
              placeholder="Pasa a línea de 5 para cerrar el partido"
              value={s.descripcion || ''}
              onChange={(e) => updateSub(s.id, { descripcion: e.target.value })}
            />
          ) : (
            <span className="col-span-5" />
          )}
          <button
            type="button"
            className="col-span-3 text-right text-xs text-emerald-700 hover:underline disabled:text-slate-300 disabled:no-underline"
            disabled={!s.jugadorSaleId || !s.jugadorEntraId}
            title={!s.jugadorSaleId || !s.jugadorEntraId ? 'Elige quién sale y quién entra primero' : ''}
            onClick={() => setLayoutFor(s.id)}
          >
            Ajustar distribución
          </button>
        </div>
      </div>
    );
  };

  const layoutSub = substitutions.find((s) => s.id === layoutFor);

  return (
    <div>
      {!readOnly && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="btn-secondary py-1 text-xs" onClick={() => addEvent('gol_favor')}>
            <BallIcon color="#111827" size={13} /> Gol
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={() => addEvent('gol_contra')}>
            <BallIcon color="#dc2626" size={13} /> Gol del oponente
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={() => addEvent('amarilla')}>
            <CardIcon color="#eab308" size={10} /> Amarilla
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={() => addEvent('roja')}>
            <CardIcon color="#dc2626" size={10} /> Roja
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={addSub}>
            <span className="text-emerald-700">⇄</span> Cambio
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="relative mx-2 mb-2 h-7">
          <div className="absolute inset-x-0 top-3 h-0.5 rounded bg-slate-200" />
          <div className="absolute top-1 h-5 border-l border-dashed border-slate-300" style={{ left: `${(45 / duracion) * 100}%` }} />
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="absolute top-0.5 -translate-x-1/2 rounded bg-white px-0.5"
              style={{ left: `${(Math.min(item.minuto, duracion) / duracion) * 100}%` }}
              title={`${item.minuto}'`}
              onClick={() => !readOnly && setEditing(item.id)}
            >
              {icon(item)}
            </button>
          ))}
          <span className="absolute -bottom-1.5 left-0 text-[10px] text-slate-400">0'</span>
          <span className="absolute -bottom-1.5 right-0 text-[10px] text-slate-400">{duracion}'</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-2 text-sm text-slate-400">
          {readOnly ? 'Sin goles, tarjetas ni cambios registrados.' : 'Sin eventos todavía. Agrégalos con los botones de arriba o haciendo clic en un jugador de la cancha.'}
        </p>
      ) : (
        <fieldset disabled={readOnly} className="divide-y divide-slate-100 border-y border-slate-100">
          {items.map((item) => {
            const open = editing === item.id;
            return (
              <div key={item.id} className={open ? 'bg-slate-50 px-2 py-2' : 'group px-2 py-1.5 hover:bg-slate-50'}>
                <div className="flex items-center gap-3 text-sm">
                  {open ? (
                    <input
                      type="number"
                      min={0}
                      className="input w-16 py-1 text-sm"
                      value={item.minuto}
                      onChange={(e) =>
                        item.kind === 'event' ? updateEvent(item.id, { minuto: Number(e.target.value) }) : updateSub(item.id, { minuto: Number(e.target.value) })
                      }
                    />
                  ) : (
                    <span className="w-9 text-right font-semibold tabular-nums text-slate-500">{item.minuto}'</span>
                  )}
                  <span className="flex w-5 justify-center">{icon(item)}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => !readOnly && setEditing(open ? null : item.id)}
                  >
                    {open ? <span className="text-xs text-slate-400">{item.kind === 'sub' ? 'Cambio' : TYPE_LABELS[item.event.tipo]}</span> : summary(item)}
                  </button>
                  {!readOnly && (
                    <span className={`flex items-center gap-2 text-slate-400 ${open ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button type="button" className="text-xs hover:text-emerald-700" onClick={() => setEditing(open ? null : item.id)}>
                        {open ? 'Listo' : 'Editar'}
                      </button>
                      <button type="button" className="text-lg leading-none hover:text-red-600" aria-label="Eliminar" onClick={() => remove(item)}>
                        &times;
                      </button>
                    </span>
                  )}
                </div>
                {open && <div className="mt-2 pl-12">{item.kind === 'event' ? eventForm(item.event) : subForm(item.sub)}</div>}
              </div>
            );
          })}
        </fieldset>
      )}

      {lineup.length > 0 && (
        <div className="mt-3">
          <button className="text-xs text-emerald-700 hover:underline" onClick={() => setShowPitch((v) => !v)}>
            {showPitch ? 'Ocultar campograma por minuto' : 'Ver campograma por minuto'}
          </button>
          {showPitch && (
            <div className="mt-2 max-w-md">
              <MatchPitchTimeline match={match} players={players} />
            </div>
          )}
        </div>
      )}

      {layoutSub && (
        <Modal title={`Distribución tras el cambio del ${layoutSub.minuto}'`} onClose={() => setLayoutFor(null)}>
          <SubLayoutEditor
            players={players}
            lineup={lineup}
            substitutions={substitutions}
            events={events}
            subId={layoutSub.id}
            onSave={(layout) => {
              updateSub(layoutSub.id, { layoutResultante: layout });
              setLayoutFor(null);
            }}
            onCancel={() => setLayoutFor(null)}
          />
        </Modal>
      )}
    </div>
  );
}
