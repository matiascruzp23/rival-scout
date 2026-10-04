import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { LineupEntry, Match, MatchBaja, MatchEvent, MatchEventType, MotivoBaja, Player, Substitution } from '../types';
import { Markings, VIEW_H, VIEW_W } from './Pitch';
import { PositionSelect } from './PositionSelect';
import { SystemSelect } from './SystemSelect';
import { defaultCoordsFor, groupColor, positionAbbr, positionDef, symmetrizeBackThree, symmetrizeDoublePivote, symmetrizeForwardPair } from '../lib/positions';
import { formationSlots } from '../lib/formations';
import { onFieldBefore, withDefaults } from '../lib/pitchLayout';
import { shortName } from '../lib/lookup';
import { BallIcon, CardIcon } from './MatchIcons';

type BoardPatch = Partial<Pick<Match, 'lineup' | 'banca' | 'bajas' | 'substitutions' | 'events' | 'sistema'>>;

const MOTIVOS: { value: MotivoBaja; label: string; icon: string }[] = [
  { value: 'lesion', label: 'Lesión', icon: '✚' },
  { value: 'suspension', label: 'Suspensión', icon: '▮' },
  { value: 'desconocido', label: 'Se desconoce', icon: '?' },
  { value: 'otro', label: 'Otro motivo', icon: '…' },
];

const newId = () => Math.random().toString(36).slice(2, 10);

function dorsalNombre(p: Player | undefined): string {
  if (!p) return '(jugador eliminado)';
  return `${p.dorsal ? `#${p.dorsal} ` : ''}${p.nombre}`;
}

// Para un puesto, primero quienes lo juegan de titular según su ficha,
// luego quienes lo tienen como posición alternativa y al final el resto.
function tierFor(p: Player, posicion: string): number {
  if (!posicion) return 0;
  return p.posicion === posicion ? 0 : p.posicionAlternativa === posicion ? 1 : 2;
}

type Popover =
  | { kind: 'slot'; index: number; view: 'menu' | 'buscar' | 'sale' }
  | { kind: 'player'; playerId: string; view: 'menu' | 'sale' }
  | { kind: 'chip'; playerId: string };

// Editor del XI y la convocatoria sobre la cancha: se hace clic en un puesto
// para elegir jugador, se arrastran las fichas para ubicarlas y, desde el
// menú de cada jugador, se registran goles, tarjetas y cambios sin bajar a
// formularios aparte.
export function MatchSquadBoard({
  players,
  match,
  previousLineup,
  onChange,
  readOnly = false,
}: {
  players: Player[];
  match: Match;
  previousLineup?: { fecha: string; oponente: string; lineup: LineupEntry[] } | null;
  onChange: (patch: BoardPatch) => void;
  readOnly?: boolean;
}) {
  const { lineup, banca, bajas, substitutions, events, sistema } = match;
  const template = formationSlots(sistema);
  const byId = new Map(players.map((p) => [p.id, p]));

  const wrapRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [search, setSearch] = useState('');
  const [minuto, setMinuto] = useState('');
  const [minutoError, setMinutoError] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [dropZone, setDropZone] = useState<string | null>(null);
  const drag = useRef<{ index: number; startX: number; startY: number; moved: boolean } | null>(null);

  const close = () => setPopover(null);

  useLayoutEffect(() => {
    if (popover) popRef.current?.querySelector('input')?.focus();
  }, [popover]);

  useEffect(() => {
    if (!popover) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover]);

  const openAt = (el: Element, next: Popover) => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!wrap) return;
    const width = 232;
    let left = r.left - wrap.left + r.width / 2 - width / 2;
    left = Math.max(0, Math.min(left, wrap.width - width));
    setAnchor({ top: r.bottom - wrap.top + 6, left });
    setSearch('');
    setMinuto('');
    setMinutoError(false);
    setPopover(next);
  };

  // ---- Plantilla del sistema ----------------------------------------------

  const applyTemplate = (confirmar = true) => {
    if (!template) return;
    if (confirmar && lineup.some((l) => l.playerId) && !window.confirm(`Esto reemplaza el XI actual por las posiciones del sistema ${sistema}. ¿Continuar?`)) {
      return;
    }
    const placed: { posicion: string; x: number; y: number }[] = [];
    const next: LineupEntry[] = template.map((posicion) => {
      const { x, y } = defaultCoordsFor(posicion, placed);
      placed.push({ posicion, x, y });
      return { playerId: '', posicion, x, y };
    });
    symmetrizeForwardPair(next);
    symmetrizeDoublePivote(next);
    symmetrizeBackThree(next);
    onChange({ lineup: next });
  };

  // Partido sin XI: al elegir sistema se reparten solos los puestos.
  useEffect(() => {
    if (!readOnly && template && lineup.length === 0) applyTemplate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema]);

  const copyPrevious = () => {
    if (!previousLineup) return;
    if (lineup.some((l) => l.playerId) && !window.confirm(`Esto reemplaza el XI actual por el del ${previousLineup.fecha}. ¿Continuar?`)) return;
    const ids = new Set(previousLineup.lineup.map((l) => l.playerId));
    onChange({ lineup: previousLineup.lineup.map((l) => ({ ...l })), banca: banca.filter((id) => !ids.has(id)) });
  };

  const addSlot = () => {
    const { x, y } = defaultCoordsFor('', lineup);
    onChange({ lineup: [...lineup, { playerId: '', posicion: '', x, y }] });
  };

  // ---- Movimientos de convocatoria ----------------------------------------

  const entraronIds = new Set(substitutions.map((s) => s.jugadorEntraId).filter(Boolean));
  const xiIds = new Set(lineup.map((l) => l.playerId).filter(Boolean));

  const assignToSlot = (index: number, playerId: string) => {
    const next = lineup.map((l) => ({ ...l }));
    const prevOccupant = next[index].playerId;
    const otherIdx = next.findIndex((l, i) => i !== index && l.playerId === playerId);
    // Si el jugador ya estaba en otro puesto, se intercambian.
    if (otherIdx !== -1) next[otherIdx].playerId = prevOccupant;
    next[index].playerId = playerId;
    onChange({ lineup: next, banca: banca.filter((id) => id !== playerId) });
    close();
  };

  const clearFromXI = (playerId: string) => lineup.map((l) => (l.playerId === playerId ? { ...l, playerId: '' } : l));

  const toBanca = (playerId: string) => {
    onChange({ lineup: clearFromXI(playerId), banca: banca.includes(playerId) ? banca : [...banca.filter(Boolean), playerId] });
    close();
  };

  const toNoCitado = (playerId: string) => {
    onChange({ lineup: clearFromXI(playerId), banca: banca.filter((id) => id !== playerId) });
    close();
  };

  const updateBaja = (playerId: string, patch: Partial<MatchBaja>) => {
    onChange({ bajas: bajas.map((b) => (b.jugadorId === playerId ? { ...b, ...patch } : b)) });
  };

  const removeSlot = (index: number) => {
    onChange({ lineup: lineup.filter((_, i) => i !== index) });
    close();
  };

  const updateSlot = (index: number, patch: Partial<LineupEntry>) => {
    const next = [...lineup];
    const merged = { ...next[index], ...patch };
    if (patch.posicion !== undefined && patch.posicion !== next[index].posicion) {
      const c = defaultCoordsFor(patch.posicion, lineup.filter((_, i) => i !== index));
      merged.x = c.x;
      merged.y = c.y;
    }
    next[index] = merged;
    onChange({ lineup: next });
  };

  // ---- Goles, tarjetas y cambios ------------------------------------------

  const readMinuto = (): number | null => {
    const n = Number(minuto);
    if (minuto.trim() === '' || !Number.isFinite(n) || n < 0) {
      setMinutoError(true);
      return null;
    }
    return Math.round(n);
  };

  const addEvent = (tipo: MatchEventType, playerId: string) => {
    const m = readMinuto();
    if (m === null) return;
    const ev: MatchEvent = { id: newId(), minuto: m, tipo, jugadorId: playerId, descripcion: '' };
    onChange({ events: [...events, ev] });
    close();
  };

  const startSale = () => {
    if (readMinuto() === null) return;
    setPopover((p) => (p && p.kind !== 'chip' ? { ...p, view: 'sale' } : p));
  };

  const addSub = (saleId: string, entraId: string) => {
    const m = readMinuto();
    if (m === null) return;
    const enCancha = onFieldBefore({ lineup, substitutions, events }, m);
    const posicion = enCancha.find((l) => l.playerId === saleId)?.posicion || '';
    const sub: Substitution = {
      id: newId(),
      minuto: m,
      jugadorSaleId: saleId,
      jugadorEntraId: entraId,
      posicionSale: posicion,
      posicionEntra: posicion,
      descripcion: '',
      sistemaResultante: '',
    };
    onChange({ substitutions: [...substitutions, sub], banca: banca.filter((id) => id !== entraId) });
    close();
  };

  // ---- Fichas en cancha ----------------------------------------------------

  const withIdx = withDefaults(lineup.map((l, i) => ({ ...l, _i: i })));
  const coordsByIdx = new Map(withIdx.map((l) => [l._i, { x: l.x ?? 50, y: l.y ?? 50 }]));

  const statsFor = (playerId: string) => ({
    goles: events.filter((e) => e.tipo === 'gol_favor' && e.jugadorId === playerId).length,
    amarillas: events.filter((e) => e.tipo === 'amarilla' && e.jugadorId === playerId).length,
    roja: events.some((e) => e.tipo === 'roja' && e.jugadorId === playerId),
    sale: substitutions.find((s) => s.jugadorSaleId === playerId)?.minuto,
    entra: substitutions.find((s) => s.jugadorEntraId === playerId)?.minuto,
  });

  const toPct = (clientX: number, clientY: number) => {
    const r = pitchRef.current!.getBoundingClientRect();
    return {
      x: Math.min(97, Math.max(3, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(97, Math.max(3, ((clientY - r.top) / r.height) * 100)),
    };
  };

  const onTokenPointerDown = (index: number) => (e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    drag.current = { index, startX: e.clientX, startY: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onTokenPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    if (!d.moved) close();
    d.moved = true;
    const { x, y } = toPct(e.clientX, e.clientY);
    const next = [...lineup];
    next[d.index] = { ...next[d.index], x, y };
    onChange({ lineup: next });
  };

  const justDragged = useRef(false);

  const onTokenPointerUp = () => {
    justDragged.current = !!drag.current?.moved;
    drag.current = null;
  };

  const onTokenClick = (index: number) => (e: React.MouseEvent) => {
    if (readOnly || justDragged.current) return;
    const entry = lineup[index];
    openAt(e.currentTarget, { kind: 'slot', index, view: entry.playerId ? 'menu' : 'buscar' });
  };

  const onDropSlot = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropZone(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id && byId.has(id) && !entraronIds.has(id)) assignToSlot(index, id);
  };

  // ---- Listas del panel lateral -------------------------------------------

  const matchesFiltro = (p: Player | undefined) => {
    if (!p || !filtro.trim()) return true;
    const q = filtro.trim().toLowerCase();
    return p.nombre.toLowerCase().includes(q) || String(p.dorsal ?? '') === q;
  };

  const bancaPlayers = banca.filter(Boolean).map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const entraron = [...substitutions]
    .filter((s) => s.jugadorEntraId)
    .sort((a, b) => a.minuto - b.minuto)
    .map((s) => ({ sub: s, player: byId.get(s.jugadorEntraId) }))
    .filter((x): x is { sub: Substitution; player: Player } => !!x.player);

  const onDropZone = (zone: 'banca' | 'nocitados') => (e: React.DragEvent) => {
    e.preventDefault();
    setDropZone(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id || !byId.has(id) || entraronIds.has(id)) return;
    if (zone === 'banca') toBanca(id);
    else toNoCitado(id);
  };

  const zoneProps = (zone: 'banca' | 'nocitados') =>
    readOnly
      ? {}
      : {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setDropZone(zone);
          },
          onDragLeave: () => setDropZone(null),
          onDrop: onDropZone(zone),
        };

  const chip = (p: Player, extra: ReactNode, opts: { draggable?: boolean; tone?: string } = {}) => (
    <button
      key={p.id}
      type="button"
      draggable={!readOnly && opts.draggable !== false}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
      onClick={(e) => !readOnly && openAt(e.currentTarget, entraronIds.has(p.id) ? { kind: 'player', playerId: p.id, view: 'menu' } : { kind: 'chip', playerId: p.id })}
      className={`inline-flex items-center gap-1 rounded-md border bg-white px-1.5 py-0.5 text-xs text-slate-700 whitespace-nowrap ${
        readOnly ? 'cursor-default' : 'cursor-grab hover:border-emerald-600'
      } ${opts.tone || 'border-slate-200'}`}
      title={p.nombre}
    >
      {p.dorsal != null && <span className="font-semibold text-slate-400">{p.dorsal}</span>}
      {shortName(p.nombre)}
      {extra}
    </button>
  );

  // ---- Popover -------------------------------------------------------------

  const minutoInput = (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="text-xs text-slate-500">Minuto</span>
      <input
        type="number"
        min={0}
        className={`input w-16 py-0.5 text-sm ${minutoError ? 'border-red-500' : ''}`}
        value={minuto}
        onChange={(e) => {
          setMinuto(e.target.value);
          setMinutoError(false);
        }}
      />
      {minutoError && <span className="text-[11px] text-red-600">Ingresa el minuto</span>}
    </div>
  );

  const item = (label: ReactNode, onClick: () => void, cls = '') => (
    <button type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${cls}`} onClick={onClick}>
      {label}
    </button>
  );

  const eventActions = (playerId: string, puedeSalir: boolean) => (
    <>
      {minutoInput}
      <div className="grid grid-cols-2 gap-0.5">
        {item(<><BallIcon color="#111827" /> Gol</>, () => addEvent('gol_favor', playerId))}
        {item(<><CardIcon color="#eab308" /> Amarilla</>, () => addEvent('amarilla', playerId))}
        {item(<><CardIcon color="#dc2626" /> Roja</>, () => addEvent('roja', playerId))}
        {puedeSalir && item(<><span className="text-emerald-700">⇄</span> Sale</>, startSale)}
      </div>
    </>
  );

  const saleList = (saleId: string) => {
    const candidatos = [...bancaPlayers, ...bajas.map((b) => byId.get(b.jugadorId)).filter((p): p is Player => !!p)];
    return (
      <>
        <p className="px-2 pt-1 pb-1 text-xs text-slate-500">
          Sale {shortName(byId.get(saleId)?.nombre || '')} al {minuto}'. ¿Quién entra?
        </p>
        <div className="max-h-56 overflow-y-auto">
          {candidatos.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No hay suplentes disponibles.</p>}
          {candidatos.map((p) =>
            item(
              <>
                <span className="w-6 text-right text-xs font-semibold text-slate-400">{p.dorsal ?? ''}</span>
                {p.nombre}
                {!banca.includes(p.id) && <span className="ml-auto text-[10px] text-slate-400">no citado</span>}
              </>,
              () => addSub(saleId, p.id)
            )
          )}
        </div>
      </>
    );
  };

  const buscarJugador = (index: number) => {
    const posicion = lineup[index]?.posicion || '';
    const q = search.trim().toLowerCase();
    const candidatos = players
      .filter((p) => !entraronIds.has(p.id) && lineup[index]?.playerId !== p.id)
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || String(p.dorsal ?? '') === q)
      .sort((a, b) => Number(xiIds.has(a.id)) - Number(xiIds.has(b.id)) || tierFor(a, posicion) - tierFor(b, posicion) || (a.dorsal ?? 999) - (b.dorsal ?? 999));
    return (
      <>
        <input
          className="input mb-1 py-1 text-sm"
          placeholder={posicion ? `${posicion}: nombre o dorsal` : 'Nombre o dorsal'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && candidatos[0] && assignToSlot(index, candidatos[0].id)}
        />
        <div className="max-h-64 overflow-y-auto">
          {candidatos.map((p) => {
            const tier = tierFor(p, posicion);
            return item(
              <>
                <span className="w-6 text-right text-xs font-semibold text-slate-400">{p.dorsal ?? ''}</span>
                <span className="truncate">{p.nombre}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                  {posicion && tier === 0 && <span className="text-amber-500">★</span>}
                  {posicion && tier === 1 && 'alt.'}
                  {xiIds.has(p.id) && 'en XI'}
                  {banca.includes(p.id) && 'banca'}
                </span>
              </>,
              () => assignToSlot(index, p.id)
            );
          })}
        </div>
      </>
    );
  };

  const posicionControls = (index: number) =>
    !template && (
      <div className="flex items-center gap-1 border-t border-slate-100 px-2 pt-1.5 mt-1">
        <PositionSelect className="input py-0.5 text-xs flex-1" value={lineup[index].posicion} onChange={(v) => updateSlot(index, { posicion: v })} />
        <button type="button" className="text-xs text-red-600 hover:underline px-1" onClick={() => removeSlot(index)}>
          Quitar puesto
        </button>
      </div>
    );

  let popContent: ReactNode = null;
  if (popover?.kind === 'slot') {
    const entry = lineup[popover.index];
    const p = entry && byId.get(entry.playerId);
    if (!entry) popContent = null;
    else if (popover.view === 'buscar' || !p) {
      popContent = (
        <>
          {buscarJugador(popover.index)}
          {posicionControls(popover.index)}
        </>
      );
    } else if (popover.view === 'sale') {
      popContent = saleList(p.id);
    } else {
      const st = statsFor(p.id);
      popContent = (
        <>
          <p className="px-2 pt-1 text-sm font-semibold text-slate-800 truncate">{dorsalNombre(p)}</p>
          <p className="px-2 text-xs text-slate-400">{entry.posicion || 'Sin posición'}</p>
          {eventActions(p.id, st.sale === undefined && !st.roja)}
          <div className="border-t border-slate-100 mt-1 pt-1">
            {item(<span className="text-slate-600">Cambiar jugador</span>, () => setPopover({ kind: 'slot', index: popover.index, view: 'buscar' }))}
            {item(<span className="text-slate-600">Mandar a la banca</span>, () => toBanca(p.id))}
            {item(<span className="text-slate-600">Marcar como no citado</span>, () => toNoCitado(p.id))}
          </div>
          {posicionControls(popover.index)}
        </>
      );
    }
  } else if (popover?.kind === 'player') {
    const p = byId.get(popover.playerId);
    const st = statsFor(popover.playerId);
    popContent = p && (
      <>
        {popover.view === 'sale' ? (
          saleList(p.id)
        ) : (
          <>
            <p className="px-2 pt-1 text-sm font-semibold text-slate-800 truncate">{dorsalNombre(p)}</p>
            <p className="px-2 text-xs text-slate-400">Entró al {st.entra}'</p>
            {eventActions(p.id, st.sale === undefined && !st.roja)}
          </>
        )}
      </>
    );
  } else if (popover?.kind === 'chip') {
    const p = byId.get(popover.playerId);
    const baja = bajas.find((b) => b.jugadorId === popover.playerId);
    const vacios = lineup.map((l, i) => ({ l, i })).filter(({ l }) => !l.playerId);
    popContent = p && (
      <>
        <p className="px-2 pt-1 pb-1 text-sm font-semibold text-slate-800 truncate">{dorsalNombre(p)}</p>
        {vacios.length > 0 && (
          <div className="px-2 pb-1">
            <p className="text-[11px] text-slate-400 mb-1">Al XI como</p>
            <div className="flex flex-wrap gap-1">
              {vacios.map(({ l, i }) => (
                <button
                  key={i}
                  type="button"
                  className={`rounded border px-1.5 py-0.5 text-xs hover:border-emerald-600 ${tierFor(p, l.posicion) === 0 && l.posicion ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
                  onClick={() => assignToSlot(i, p.id)}
                  title={l.posicion}
                >
                  {l.posicion ? positionAbbr(l.posicion) : 'Puesto'}
                </button>
              ))}
            </div>
          </div>
        )}
        {banca.includes(p.id)
          ? item(<span className="text-slate-600">Marcar como no citado</span>, () => toNoCitado(p.id))
          : item(<span className="text-slate-600">Pasar a la banca</span>, () => toBanca(p.id))}
        {baja && (
          <div className="border-t border-slate-100 mt-1 px-2 pt-2 space-y-1.5">
            <p className="text-[11px] text-slate-400">Motivo de no citado</p>
            <div className="flex flex-wrap gap-1">
              {MOTIVOS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => updateBaja(p.id, { tipo: m.value })}
                  className={`rounded border px-1.5 py-0.5 text-xs ${baja.tipo === m.value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              className="input py-1 text-xs"
              placeholder="Detalle (opcional): fractura de tobillo, 4ta amarilla…"
              value={baja.motivo || ''}
              onChange={(e) => updateBaja(p.id, { motivo: e.target.value })}
            />
          </div>
        )}
      </>
    );
  }

  // ---- Render --------------------------------------------------------------

  const filled = lineup.filter((l) => l.playerId).length;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${filled === 11 ? 'text-emerald-700' : 'text-slate-500'}`}>{filled}/11 en el XI</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && previousLineup && (
            <button className="btn-secondary text-xs" onClick={copyPrevious}>
              Copiar XI de {previousLineup.fecha}
              {previousLineup.oponente ? ` (vs ${previousLineup.oponente})` : ''}
            </button>
          )}
          {!readOnly && template && lineup.length > 0 && (
            <button className="btn-secondary text-xs" onClick={() => applyTemplate()}>
              Reiniciar posiciones
            </button>
          )}
          {!readOnly && !template && (
            <button className="btn-secondary text-xs" onClick={addSlot} disabled={lineup.length >= 14}>
              + Agregar puesto
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Sistema
            <SystemSelect className="input w-28 py-1 text-xs" value={sistema} onChange={(v) => onChange({ sistema: v })} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div>
          <div
            ref={pitchRef}
            className="relative w-full select-none overflow-hidden rounded-lg"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, background: 'linear-gradient(#1f7a3d, #1a6b35)', touchAction: 'none' }}
          >
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              <Markings />
            </svg>
            {lineup.length === 0 && (
              <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-white/80">
                {readOnly ? 'Sin XI registrado.' : 'Elige el sistema arriba para repartir los puestos, o agrega puestos a mano.'}
              </p>
            )}
            {lineup.map((entry, i) => {
              const { x, y } = coordsByIdx.get(i) ?? { x: 50, y: 50 };
              const p = byId.get(entry.playerId);
              const color = groupColor(positionDef(entry.posicion)?.group);
              const st = p ? statsFor(p.id) : null;
              const abierto = popover?.kind === 'slot' && popover.index === i;
              return (
                <div
                  key={i}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${x}%`, top: `${y}%`, cursor: readOnly ? 'default' : p ? 'grab' : 'pointer', zIndex: abierto ? 5 : 1 }}
                  onPointerDown={onTokenPointerDown(i)}
                  onPointerMove={onTokenPointerMove}
                  onPointerUp={onTokenPointerUp}
                  onClick={onTokenClick(i)}
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setDropZone(`slot-${i}`);
                  }}
                  onDragLeave={() => setDropZone(null)}
                  onDrop={readOnly ? undefined : onDropSlot(i)}
                >
                  <div
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      p ? 'text-white border-2 border-white' : 'border-2 border-dashed border-white/80 text-white text-[11px]'
                    } ${abierto || dropZone === `slot-${i}` ? 'ring-4 ring-yellow-300' : ''} ${st?.sale !== undefined || st?.roja ? 'opacity-70' : ''}`}
                    style={p ? { background: color } : undefined}
                    title={entry.posicion}
                  >
                    {p ? (p.dorsal ?? '·') : entry.posicion ? positionAbbr(entry.posicion) : '+'}
                    {st && st.goles > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex items-center rounded-full bg-white px-0.5 text-[9px] font-bold text-slate-900 leading-none">
                        <BallIcon color="#111827" size={11} />
                        {st.goles > 1 && <span className="px-0.5">{st.goles}</span>}
                      </span>
                    )}
                    {st && (st.amarillas > 0 || st.roja) && (
                      <span className="absolute -left-1.5 -top-1.5 flex gap-px">
                        {st.amarillas > 0 && <CardIcon color="#eab308" size={9} />}
                        {(st.roja || st.amarillas > 1) && <CardIcon color="#dc2626" size={9} />}
                      </span>
                    )}
                    {st?.sale !== undefined && (
                      <span className="absolute -bottom-1.5 -right-2.5 rounded bg-red-600 px-0.5 text-[9px] font-bold leading-tight text-white">↓{st.sale}'</span>
                    )}
                  </div>
                  <span className="mt-0.5 whitespace-nowrap rounded bg-black/40 px-1 text-[11px] leading-tight text-white">
                    {p ? shortName(p.nombre) : readOnly ? entry.posicion : 'Elegir…'}
                  </span>
                </div>
              );
            })}
          </div>
          {!readOnly && lineup.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-400">
              Clic en un puesto para elegir jugador o registrar gol, tarjeta o cambio. Arrastra las fichas para ubicarlas.
            </p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <input className="input py-1 text-sm" placeholder="Filtrar por nombre o dorsal" value={filtro} onChange={(e) => setFiltro(e.target.value)} />

          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
              <span>Banca</span>
              <span className="text-slate-400">{bancaPlayers.length}</span>
            </div>
            <div
              {...zoneProps('banca')}
              className={`flex min-h-10 flex-wrap gap-1 rounded-md border border-dashed p-1.5 ${dropZone === 'banca' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`}
            >
              {bancaPlayers.filter(matchesFiltro).map((p) => chip(p, null))}
              {bancaPlayers.length === 0 && <span className="px-1 text-xs text-slate-400">{readOnly ? 'Sin banca registrada.' : 'Arrastra acá a los suplentes citados.'}</span>}
            </div>
          </div>

          {entraron.length > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                <span>Entraron</span>
                <span className="text-slate-400">{entraron.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {entraron
                  .filter(({ player }) => matchesFiltro(player))
                  .map(({ sub, player }) => {
                    const st = statsFor(player.id);
                    return chip(
                      player,
                      <>
                        <span className="text-[10px] font-semibold text-emerald-700">↑{sub.minuto}'</span>
                        {st.goles > 0 && <BallIcon color="#111827" size={11} />}
                        {st.amarillas > 0 && <CardIcon color="#eab308" size={8} />}
                        {st.roja && <CardIcon color="#dc2626" size={8} />}
                        {st.sale !== undefined && <span className="text-[10px] font-semibold text-red-600">↓{st.sale}'</span>}
                      </>,
                      { draggable: false, tone: 'border-emerald-200' }
                    );
                  })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
              <span>No citados</span>
              <span className="text-slate-400">{bajas.length}</span>
            </div>
            <div
              {...zoneProps('nocitados')}
              className={`flex min-h-10 flex-wrap gap-1 rounded-md border border-dashed p-1.5 ${dropZone === 'nocitados' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`}
            >
              {bajas
                .map((b) => ({ b, p: byId.get(b.jugadorId) }))
                .filter((x): x is { b: MatchBaja; p: Player } => !!x.p && matchesFiltro(x.p))
                .map(({ b, p }) => {
                  const motivo = MOTIVOS.find((m) => m.value === b.tipo);
                  const conocido = b.tipo === 'lesion' || b.tipo === 'suspension';
                  return chip(
                    p,
                    <span className={`text-[10px] font-bold ${conocido ? 'text-red-600' : 'text-slate-400'}`} title={`${motivo?.label}${b.motivo ? `: ${b.motivo}` : ''}`}>
                      {motivo?.icon}
                    </span>,
                    { tone: conocido ? 'border-red-200' : 'border-slate-200' }
                  );
                })}
              {bajas.length === 0 && <span className="px-1 text-xs text-slate-400">Todo el plantel activo está citado.</span>}
            </div>
            {!readOnly && bajas.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Quien no esté en el XI ni en la banca queda como no citado. Clic en un jugador para indicar el motivo
                (✚ lesión, ▮ suspensión, ? se desconoce).
              </p>
            )}
          </div>

        </div>
      </div>

      {popover && popContent && (
        <div ref={popRef} className="absolute z-30 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" style={{ top: anchor.top, left: anchor.left, width: 232 }}>
          {popContent}
        </div>
      )}
    </div>
  );
}
