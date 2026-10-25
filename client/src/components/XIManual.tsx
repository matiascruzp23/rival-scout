import { useState } from 'react';
import type { LineupEntry, Player, RivalDetail } from '../types';
import type { PitchToken } from './Pitch';
import { LineupEditor } from './LineupEditor';
import { Modal } from './Modal';
import { api } from '../api';
import { sortMatchesDesc, type XIEstimate } from '../lib/stats';
import { defaultCoordsFor } from '../lib/positions';

// XI que se muestra en Dashboard e Informe: el ajustado a mano por el
// analista (rival.xiManual) si existe, si no el estimado automáticamente
// (estimateNextXI). Los avisos señalan jugadores del XI manual que hoy no
// podrían jugar (de baja, en selección) o que ya no están en el plantel.
export interface XIMostrado {
  manual: boolean;
  tokens: PitchToken[];
  picks: { posicion: string; player: Player; reemplazadoPorRegla?: Player }[];
  deBaja: Player[];
  enSeleccion: Player[];
  // Posiciones del XI manual cuyo jugador ya no está en el plantel.
  fueraDelPlantel: string[];
}

export function resolveXIMostrado(rival: RivalDetail, estimado: XIEstimate, estimadoTokens: PitchToken[]): XIMostrado {
  const manual = rival.xiManual;
  if (!manual || manual.length === 0) {
    return {
      manual: false,
      tokens: estimadoTokens,
      picks: estimado.picks,
      deBaja: [],
      enSeleccion: [],
      fueraDelPlantel: [],
    };
  }
  const tokens: PitchToken[] = [];
  const fueraDelPlantel: string[] = [];
  for (const e of manual) {
    const player = rival.players.find((p) => p.id === e.playerId);
    if (!player) {
      fueraDelPlantel.push(e.posicion || 'sin posición');
      continue;
    }
    const coords = e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : defaultCoordsFor(e.posicion, tokens);
    tokens.push({ key: player.id, x: coords.x, y: coords.y, posicion: e.posicion, player });
  }
  const picks = tokens.map((t) => ({ posicion: t.posicion, player: t.player! }));
  return {
    manual: true,
    tokens,
    picks,
    deBaja: picks.filter((p) => p.player.baja).map((p) => p.player),
    enSeleccion: picks.filter((p) => p.player.enSeleccion && !p.player.baja).map((p) => p.player),
    fueraDelPlantel,
  };
}

// Marca "XI ajustado a mano" con sus avisos y, para editores, los botones
// para editarlo o volver al estimado automático (ocultos al imprimir).
export function XIManualControls({
  rival,
  xi,
  estimadoTokens,
  editable,
  onChanged,
}: {
  rival: RivalDetail;
  xi: XIMostrado;
  estimadoTokens: PitchToken[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const restablecer = async () => {
    if (!window.confirm('Se descarta el XI ajustado a mano y se vuelve al estimado automático. ¿Continuar?')) return;
    setResetting(true);
    try {
      await api.rivals.update(rival.id, { xiManual: null });
      onChanged();
    } catch (err) {
      window.alert(`No se pudo restablecer el XI: ${(err as Error).message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      {(xi.manual || editable) && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          {xi.manual ? (
            <span className="badge bg-amber-50 text-amber-700 border border-amber-200">XI ajustado a mano</span>
          ) : (
            <span />
          )}
          {editable && (
            <div className="flex gap-2 no-print">
              <button className="btn-secondary text-xs" onClick={() => setEditing(true)}>
                {xi.manual ? 'Editar XI' : 'Ajustar XI a mano'}
              </button>
              {xi.manual && (
                <button className="btn-secondary text-xs" disabled={resetting} onClick={restablecer}>
                  Volver al estimado automático
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {xi.deBaja.length > 0 && (
        <p className="text-xs text-red-600 mb-1">
          En el XI ajustado pero de baja: {xi.deBaja.map((p) => p.nombre).join(', ')}.
        </p>
      )}
      {xi.enSeleccion.length > 0 && (
        <p className="text-xs text-red-600 mb-1">
          En el XI ajustado pero en selección: {xi.enSeleccion.map((p) => p.nombre).join(', ')}.
        </p>
      )}
      {xi.fueraDelPlantel.length > 0 && (
        <p className="text-xs text-red-600 mb-1">
          {xi.fueraDelPlantel.length === 1 ? 'Un jugador' : `${xi.fueraDelPlantel.length} jugadores`} del XI ajustado ya
          no {xi.fueraDelPlantel.length === 1 ? 'está' : 'están'} en el plantel ({xi.fueraDelPlantel.join(', ')}).
        </p>
      )}
      {editing && (
        <XIManualEditorModal
          rival={rival}
          initial={xi.manual ? rival.xiManual! : estimadoTokens.map(tokenToEntry)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function tokenToEntry(t: PitchToken): LineupEntry {
  return { playerId: t.key, posicion: t.posicion, x: t.x, y: t.y };
}

function XIManualEditorModal({
  rival,
  initial,
  onClose,
  onSaved,
}: {
  rival: RivalDetail;
  initial: LineupEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Solo se ofrecen jugadores que siguen en el plantel; los que ya no
  // están se descartan al abrir el editor.
  const [lineup, setLineup] = useState<LineupEntry[]>(() =>
    initial.filter((e) => rival.players.some((p) => p.id === e.playerId)).map((e) => ({ ...e }))
  );
  const [saving, setSaving] = useState(false);
  const ultimo = sortMatchesDesc(rival.matches).find((m) => m.lineup.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      await api.rivals.update(rival.id, { xiManual: lineup.filter((e) => e.playerId) });
      onSaved();
    } catch (err) {
      window.alert(`No se pudo guardar el XI: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Ajustar XI estimado" onClose={onClose} wide>
      <p className="text-xs text-slate-500 mb-3">
        Cambia jugadores o posiciones del XI estimado; en el campograma puedes arrastrar las fichas. Al guardar, el
        Dashboard y el Informe muestran este XI en vez del estimado automático.
      </p>
      <LineupEditor
        players={rival.players}
        lineup={lineup}
        system=""
        showSystemHint={false}
        previousLineup={ultimo ? { fecha: ultimo.fecha, oponente: ultimo.oponente, lineup: ultimo.lineup } : null}
        onChange={setLineup}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={saving} onClick={save}>
          Guardar XI
        </button>
      </div>
    </Modal>
  );
}
