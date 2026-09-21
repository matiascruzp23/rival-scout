import { useEffect, useState } from 'react';
import type { LineupEntry, Player } from '../types';
import { PositionSelect } from './PositionSelect';
import { Pitch, type PitchToken } from './Pitch';
import { defaultCoordsFor, symmetrizeDoublePivote, symmetrizeForwardPair } from '../lib/positions';
import { formationSlots } from '../lib/formations';

// Para la posición de un slot, ordena primero a quienes juegan ahí de
// titular (según su ficha), luego a quienes la juegan en el sistema
// alternativo, y al final al resto — así el desplegable recomienda antes de
// que el analista tenga que buscar en toda la plantilla.
function playersForPosition(players: Player[], posicion: string): Player[] {
  if (!posicion) return players;
  const tier = (p: Player) => (p.posicion === posicion ? 0 : p.posicionAlternativa === posicion ? 1 : 2);
  return [...players].sort((a, b) => tier(a) - tier(b));
}

export function LineupEditor({
  players,
  lineup,
  system,
  previousLineup,
  onChange,
}: {
  players: Player[];
  lineup: LineupEntry[];
  system: string;
  previousLineup?: { fecha: string; oponente: string; lineup: LineupEntry[] } | null;
  onChange: (lineup: LineupEntry[]) => void;
}) {
  const [showBaja, setShowBaja] = useState(false);
  const [view, setView] = useState<'lista' | 'campograma'>('lista');
  const usedIds = new Set(lineup.map((l) => l.playerId));
  const selectable = players.filter((p) => showBaja || !p.baja);
  const template = formationSlots(system);

  const copyPrevious = () => {
    if (!previousLineup) return;
    if (
      lineup.some((l) => l.playerId) &&
      !window.confirm(`Esto reemplaza el XI actual por el del ${previousLineup.fecha}. ¿Continuar?`)
    ) {
      return;
    }
    onChange(previousLineup.lineup.map((l) => ({ ...l })));
  };

  const applyTemplate = () => {
    if (!template) return;
    if (
      lineup.some((l) => l.playerId) &&
      !window.confirm(`Esto reemplaza el XI actual por las posiciones del sistema ${system}. ¿Continuar?`)
    ) {
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
    onChange(next);
  };

  // Al elegir un sistema en un partido sin XI cargado todavía, se reparten
  // automáticamente las posiciones de ese sistema; si ya hay jugadores
  // cargados, no se pisan solos (requiere el botón de abajo) para no perder
  // trabajo ya hecho.
  useEffect(() => {
    if (template && lineup.length === 0) applyTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  const addSlot = () => {
    const next = selectable.find((p) => !usedIds.has(p.id));
    const { x, y } = defaultCoordsFor('', lineup);
    onChange([...lineup, { playerId: next?.id || '', posicion: '', x, y }]);
  };

  const update = (index: number, entry: Partial<LineupEntry>) => {
    const next = [...lineup];
    const merged = { ...next[index], ...entry };
    if (entry.posicion !== undefined && (next[index].x === undefined || next[index].posicion !== entry.posicion)) {
      const coords = defaultCoordsFor(entry.posicion, lineup.filter((_, i) => i !== index));
      merged.x = coords.x;
      merged.y = coords.y;
    }
    next[index] = merged;
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(lineup.filter((_, i) => i !== index));
  };

  const moveToken = (playerKey: string, x: number, y: number) => {
    const idx = lineup.findIndex((l) => l.playerId === playerKey);
    if (idx === -1) return;
    const next = [...lineup];
    next[idx] = { ...next[idx], x, y };
    onChange(next);
  };

  const sinCoord = (e: LineupEntry) => e.x === undefined || e.y === undefined;
  const dcEntry = lineup.find((l) => l.posicion === 'Delantero centro');
  const sdEntry = lineup.find((l) => l.posicion === 'Segundo delantero');
  const parSimetrico = !!dcEntry && !!sdEntry && sinCoord(dcEntry) && sinCoord(sdEntry);

  const hasVolanteCentral = lineup.some((l) => l.posicion === 'Volante central');
  const interDerEntry = lineup.find((l) => l.posicion === 'Interior derecho');
  const interIzqEntry = lineup.find((l) => l.posicion === 'Interior izquierdo');
  const parPivote =
    !hasVolanteCentral && !!interDerEntry && !!interIzqEntry && sinCoord(interDerEntry) && sinCoord(interIzqEntry);

  const tokens: PitchToken[] = [];
  for (const l of lineup) {
    if (!l.playerId) continue;
    if (parSimetrico && (l === dcEntry || l === sdEntry)) continue;
    if (parPivote && (l === interDerEntry || l === interIzqEntry)) continue;
    let { x, y } = l;
    if (x === undefined || y === undefined) {
      const coords = defaultCoordsFor(l.posicion, tokens);
      x = coords.x;
      y = coords.y;
    }
    tokens.push({ key: l.playerId, x, y, posicion: l.posicion, player: players.find((p) => p.id === l.playerId) });
  }
  if (parSimetrico && dcEntry && sdEntry) {
    const pair: PitchToken[] = [
      { key: dcEntry.playerId, x: 0, y: 0, posicion: dcEntry.posicion, player: players.find((p) => p.id === dcEntry.playerId) },
      { key: sdEntry.playerId, x: 0, y: 0, posicion: sdEntry.posicion, player: players.find((p) => p.id === sdEntry.playerId) },
    ];
    symmetrizeForwardPair(pair);
    tokens.push(...pair);
  }
  if (parPivote && interDerEntry && interIzqEntry) {
    const pivotePair: PitchToken[] = [
      {
        key: interDerEntry.playerId,
        x: 0,
        y: 0,
        posicion: interDerEntry.posicion,
        player: players.find((p) => p.id === interDerEntry.playerId),
      },
      {
        key: interIzqEntry.playerId,
        x: 0,
        y: 0,
        posicion: interIzqEntry.posicion,
        player: players.find((p) => p.id === interIzqEntry.playerId),
      },
    ];
    symmetrizeDoublePivote(pivotePair);
    tokens.push(...pivotePair);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-sm text-slate-500">{lineup.length}/11 jugadores en el XI</span>
        <div className="flex items-center gap-3">
          {previousLineup && (
            <button className="btn-secondary text-xs" onClick={copyPrevious}>
              Copiar XI de {previousLineup.fecha}
              {previousLineup.oponente ? ` (vs ${previousLineup.oponente})` : ''}
            </button>
          )}
          {template && (
            <button className="btn-secondary text-xs" onClick={applyTemplate}>
              Aplicar posiciones de {system}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showBaja} onChange={(e) => setShowBaja(e.target.checked)} />
            Mostrar jugadores marcados como baja
          </label>
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setView('lista')}
              className={`px-2 py-1 rounded border ${view === 'lista' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'}`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('campograma')}
              className={`px-2 py-1 rounded border ${view === 'campograma' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'}`}
            >
              Campograma
            </button>
          </div>
        </div>
      </div>

      {!system && (
        <p className="text-xs text-slate-400 mb-2">
          Elige un sistema/formación en los datos generales del partido para que las posiciones a rellenar se repartan
          automáticamente.
        </p>
      )}

      {view === 'campograma' && (
        <div className="mb-3">
          <Pitch tokens={tokens} onMove={moveToken} />
          <p className="text-xs text-slate-400 mt-1">Arrastra a cada jugador para ubicarlo según cómo se paró realmente en cancha.</p>
        </div>
      )}

      <div className="space-y-2">
        {lineup.map((entry, i) => {
          const player = players.find((p) => p.id === entry.playerId);
          return (
            <div key={i} className="flex gap-2 items-center">
              <select
                className="input flex-1"
                value={entry.playerId}
                onChange={(e) => update(i, { playerId: e.target.value })}
              >
                <option value="">Seleccionar jugador…</option>
                {playersForPosition(players, entry.posicion)
                  .filter((p) => showBaja || !p.baja || p.id === entry.playerId)
                  .map((p) => (
                    <option key={p.id} value={p.id} disabled={usedIds.has(p.id) && p.id !== entry.playerId}>
                      {p.posicion === entry.posicion && entry.posicion ? '★ ' : ''}
                      {p.dorsal ? `#${p.dorsal} ` : ''}
                      {p.nombre} {p.baja ? '(baja)' : ''}
                    </option>
                  ))}
              </select>
              {template ? (
                <span className="input w-48 bg-slate-50 text-slate-600 flex items-center">{entry.posicion || '—'}</span>
              ) : (
                <PositionSelect className="input w-48" value={entry.posicion} onChange={(v) => update(i, { posicion: v })} />
              )}
              {player?.baja && <span className="badge bg-red-100 text-red-700 text-[10px]">BAJA</span>}
              <button className="text-slate-400 hover:text-red-600 text-lg leading-none px-1" onClick={() => remove(i)}>
                &times;
              </button>
            </div>
          );
        })}
      </div>
      {!template && (
        <button className="btn-secondary mt-3" onClick={addSlot} disabled={lineup.length >= 14}>
          + Agregar jugador al XI
        </button>
      )}
    </div>
  );
}
