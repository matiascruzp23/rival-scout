import { useMemo, useState } from 'react';
import type { Player } from '../types';
import { POSITIONS, positionDef } from '../lib/positions';
import { formationSlots } from '../lib/formations';
import { api } from '../api';
import { shortName } from '../lib/lookup';
import { SystemSelect } from './SystemSelect';

interface BoxSpec {
  label: string;
  row: number;
  col: number;
}

// Cuántas columnas (de 5) ocupa una línea de N posiciones, centradas.
const COLUMNS_FOR_COUNT: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

// Para una línea de 3 con las posiciones realmente cerca entre sí en la
// cancha (p. ej. los dos interiores + el volante central, o los 3 centrales
// de una línea de 3), usar las columnas de los extremos (1 y 5) las mostraba
// mucho más separadas de lo que están en la realidad.
const TIGHT_COLUMNS_FOR_THREE = [2, 3, 4];
const TIGHT_RANGE_THRESHOLD = 35;

// A qué línea (fila) del campograma en cajas pertenece una posición, según
// su profundidad (y) en el catálogo: ataque arriba, arco abajo, igual que el
// campograma vertical del resto de la app.
function rowForY(y: number): number {
  if (y < 30) return 1;
  if (y < 45) return 2;
  if (y < 70) return 3;
  if (y < 90) return 4;
  return 5;
}

// Las cajas a mostrar: si el rival tiene un sistema reconocido, solo las 11
// posiciones de ese sistema; si no, el catálogo completo (comportamiento
// anterior, para rivales sin sistema definido todavía).
function boxesForSystem(sistema: string): BoxSpec[] {
  const slots = formationSlots(sistema);
  const labels = slots ? Array.from(new Set(slots)) : POSITIONS.map((p) => p.label);
  // Con línea de 5 en el fondo, los carrileros son parte de esa línea (junto
  // a los 3 centrales), no del mediocampo: se muestran a la misma altura que
  // los centrales para que no se lean como laterales sueltos en otra fila.
  const lineaDeCinco = /^5-/.test(sistema);
  const byRow = new Map<number, string[]>();
  for (const label of labels) {
    const def = positionDef(label);
    if (!def) continue;
    const esCarrilero = label === 'Carrilero derecho' || label === 'Carrilero izquierdo';
    const row = lineaDeCinco && esCarrilero ? rowForY(positionDef('Central derecho')!.y) : rowForY(def.y);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(label);
  }
  const boxes: BoxSpec[] = [];
  for (const [row, rowLabels] of byRow) {
    rowLabels.sort((a, b) => (positionDef(a)?.x ?? 50) - (positionDef(b)?.x ?? 50));
    const xs = rowLabels.map((label) => positionDef(label)?.x ?? 50);
    const range = Math.max(...xs) - Math.min(...xs);
    const tight = rowLabels.length === 3 && range < TIGHT_RANGE_THRESHOLD;
    const cols = tight ? TIGHT_COLUMNS_FOR_THREE : COLUMNS_FOR_COUNT[rowLabels.length] || rowLabels.map((_, i) => i + 1);
    rowLabels.forEach((label, i) => boxes.push({ label, row, col: cols[i] }));
  }
  return boxes;
}

function categoryClass(p: Player): string {
  if (p.baja) return 'text-red-700';
  if (p.duda) return 'text-purple-700';
  if (p.extranjero) return 'text-sky-700';
  if (p.sub21) return 'text-emerald-700';
  if (p.sub18) return 'text-yellow-700';
  return 'text-slate-800';
}

function categoryBg(p: Player): string {
  if (p.baja) return 'bg-red-50';
  if (p.duda) return 'bg-purple-50';
  if (p.extranjero) return 'bg-sky-50';
  if (p.sub21) return 'bg-emerald-50';
  if (p.sub18) return 'bg-yellow-50';
  return '';
}

function pieAbbr(p: Player): string {
  if (p.pie === 'Derecho') return 'D.';
  if (p.pie === 'Izquierdo') return 'I.';
  if (p.pie === 'Ambidiestro') return 'A.';
  return '';
}

export function PlantelView({
  players,
  editable = false,
  sistemaPrincipal = '',
  sistemaAlternativo = '',
  onChanged,
  onSaveSistemas,
}: {
  players: Player[];
  editable?: boolean;
  sistemaPrincipal?: string;
  sistemaAlternativo?: string;
  onChanged?: () => void;
  onSaveSistemas?: (data: { sistemaPrincipal: string; sistemaAlternativo: string }) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAlternativo, setShowAlternativo] = useState(false);
  const [editingSistemas, setEditingSistemas] = useState(false);

  const sistemaActivo = showAlternativo && sistemaAlternativo ? sistemaAlternativo : sistemaPrincipal;
  const boxes = useMemo(() => boxesForSystem(sistemaActivo), [sistemaActivo]);

  // Con sistema alternativo activo, cada jugador se ubica según la posición
  // que tiene definida para ESE sistema (posicionAlternativa); si no la
  // definió, se lo sigue mostrando en su posición principal.
  const posicionActiva = (p: Player) => (showAlternativo ? p.posicionAlternativa || p.posicion : p.posicion);

  const byPosition = useMemo(() => {
    const map = new Map<string, Player[]>();
    for (const p of players) {
      const def = positionDef(posicionActiva(p));
      const key = def ? def.label : posicionActiva(p) || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    for (const list of map.values()) list.sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, showAlternativo]);

  const classified = new Set(boxes.map((b) => b.label));
  const sinClasificar = players.filter((p) => {
    const def = positionDef(posicionActiva(p));
    return !def || !classified.has(def.label);
  });

  const movePlayer = async (playerId: string, posicion: string) => {
    setSaving(playerId);
    try {
      await api.players.update(playerId, showAlternativo ? { posicionAlternativa: posicion } : { posicion });
      onChanged?.();
    } finally {
      setSaving(null);
    }
  };

  const rows = Array.from(new Set(boxes.map((b) => b.row))).sort((a, b) => a - b);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800">Plantel</h3>
        <div className="flex items-center gap-2">
          {sistemaPrincipal && sistemaAlternativo && (
            <div className="flex items-center gap-1 text-xs no-print">
              <button
                onClick={() => setShowAlternativo(false)}
                className={`px-2 py-0.5 rounded border ${!showAlternativo ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                {sistemaPrincipal}
              </button>
              <button
                onClick={() => setShowAlternativo(true)}
                className={`px-2 py-0.5 rounded border ${showAlternativo ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                {sistemaAlternativo} (alt.)
              </button>
            </div>
          )}
          {onSaveSistemas && !editingSistemas && (
            <button
              className="text-xs text-emerald-700 hover:underline no-print"
              onClick={() => setEditingSistemas(true)}
            >
              {sistemaPrincipal ? 'Editar sistemas' : '+ Definir sistema'}
            </button>
          )}
          {saving && <span className="text-xs text-slate-400">Guardando…</span>}
        </div>
      </div>
      {editable && (
        <p className="text-xs text-slate-500 mb-3">
          Arrastra a un jugador a otra posición para reasignarlo
          {showAlternativo ? ` en el sistema ${sistemaAlternativo}` : sistemaPrincipal ? ` en el sistema ${sistemaPrincipal}` : ''}.
        </p>
      )}

      {onSaveSistemas && editingSistemas && (
        <SistemasEditor
          sistemaPrincipal={sistemaPrincipal}
          sistemaAlternativo={sistemaAlternativo}
          onCancel={() => setEditingSistemas(false)}
          onSave={async (data) => {
            await onSaveSistemas(data);
            setEditingSistemas(false);
          }}
        />
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="grid grid-cols-5 gap-2">
            {boxes.filter((b) => b.row === row).map((box) => (
              <div key={box.label} style={{ gridColumnStart: box.col }}>
                <PositionBox
                  label={box.label}
                  players={byPosition.get(box.label) || []}
                  editable={editable}
                  isDragOver={dragOver === box.label}
                  onDragOverBox={() => setDragOver(box.label)}
                  onDragLeaveBox={() => setDragOver((v) => (v === box.label ? null : v))}
                  onDropPlayer={(playerId) => {
                    setDragOver(null);
                    movePlayer(playerId, box.label);
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {sinClasificar.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Sin posición reconocida</h4>
          <div className="border border-dashed border-slate-300 rounded-md p-2 flex flex-wrap gap-2">
            {sinClasificar.map((p) => (
              <PlayerChip key={p.id} player={p} editable={editable} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mt-4 pt-3 border-t border-slate-100 text-xs font-semibold">
        <span className="text-sky-700">EXTRANJERO</span>
        <span className="text-emerald-700">SUB21</span>
        <span className="text-yellow-700">SUB18</span>
        <span className="text-red-700">BAJAS</span>
        <span className="text-purple-700">DUDAS</span>
        <span className="text-indigo-700">SELECCIÓN</span>
      </div>
    </section>
  );
}

function SistemasEditor({
  sistemaPrincipal,
  sistemaAlternativo,
  onSave,
  onCancel,
}: {
  sistemaPrincipal: string;
  sistemaAlternativo: string;
  onSave: (data: { sistemaPrincipal: string; sistemaAlternativo: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [principal, setPrincipal] = useState(sistemaPrincipal);
  const [alternativo, setAlternativo] = useState(sistemaAlternativo);
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-2 mb-3 p-2 border border-slate-200 rounded-md bg-slate-50 no-print">
      <div>
        <label className="label">Sistema predilecto</label>
        <SystemSelect value={principal} onChange={setPrincipal} emptyLabel="Sin definir" />
      </div>
      <div>
        <label className="label">Sistema alternativo</label>
        <SystemSelect value={alternativo} onChange={setAlternativo} emptyLabel="Sin alternativo" />
      </div>
      <button className="btn-secondary text-xs" onClick={onCancel}>
        Cancelar
      </button>
      <button
        className="btn-primary text-xs"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({ sistemaPrincipal: principal, sistemaAlternativo: alternativo });
          } finally {
            setSaving(false);
          }
        }}
      >
        Guardar
      </button>
    </div>
  );
}

function PositionBox({
  label,
  players,
  editable,
  isDragOver,
  onDragOverBox,
  onDragLeaveBox,
  onDropPlayer,
}: {
  label: string;
  players: Player[];
  editable: boolean;
  isDragOver: boolean;
  onDragOverBox: () => void;
  onDragLeaveBox: () => void;
  onDropPlayer: (playerId: string) => void;
}) {
  return (
    <div
      className={`border rounded-md h-full min-h-[86px] ${isDragOver ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200'}`}
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        onDragOverBox();
      }}
      onDragLeave={onDragLeaveBox}
      onDrop={(e) => {
        if (!editable) return;
        e.preventDefault();
        const playerId = e.dataTransfer.getData('text/plain');
        if (playerId) onDropPlayer(playerId);
      }}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 bg-slate-50 rounded-t-md">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className="text-[11px] font-bold text-slate-400">{players.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} editable={editable} />
        ))}
        {players.length === 0 && <div className="px-2 py-2 text-[11px] text-slate-300 italic">Vacío</div>}
      </div>
    </div>
  );
}

function PlayerRow({ player, editable }: { player: Player; editable: boolean }) {
  const extra = [player.estatura ? `${player.estatura.toFixed(2)}m` : '', pieAbbr(player)].filter(Boolean).join(' · ');
  return (
    <div
      draggable={editable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', player.id)}
      className={`px-2 py-1.5 text-xs flex items-baseline gap-1.5 ${categoryBg(player)} ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {player.dorsal !== null && <span className="text-slate-400 font-semibold w-4 shrink-0">{player.dorsal}</span>}
      <span className={`font-medium truncate ${categoryClass(player)}`} title={player.nombre}>
        {shortName(player.nombre)}
      </span>
      {player.enSeleccion && <SeleccionBadge />}
      {extra && <span className="text-slate-400 text-[11px] ml-auto whitespace-nowrap shrink-0">{extra}</span>}
    </div>
  );
}

function PlayerChip({ player, editable }: { player: Player; editable: boolean }) {
  return (
    <div
      draggable={editable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', player.id)}
      className={`text-xs px-2 py-1 rounded border border-slate-200 ${categoryBg(player)} ${categoryClass(player)} ${editable ? 'cursor-grab' : ''}`}
    >
      {player.nombre} <span className="text-slate-400">({player.posicion || 'sin posición'})</span>
      {player.enSeleccion && <SeleccionBadge />}
    </div>
  );
}

// Aviso de que el jugador no está disponible por estar convocado a
// selección: se muestra siempre además de su color de categoría (Sub-21,
// Extranjero, etc.), que se deja intacto para no perder esa información.
function SeleccionBadge() {
  return (
    <span
      className="badge bg-indigo-100 text-indigo-700 text-[9px] ml-1 shrink-0"
      title="Convocado a selección: no disponible para este partido"
    >
      SEL
    </span>
  );
}
