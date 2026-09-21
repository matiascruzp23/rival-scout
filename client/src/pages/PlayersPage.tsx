import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { Player, PieHabil } from '../types';
import { Modal, ConfirmDialog } from '../components/Modal';
import { PlayerBadges } from '../components/PlayerBadges';
import { PositionSelect } from '../components/PositionSelect';
import { ImportPlayersModal } from '../components/ImportPlayersModal';
import { computeAllPlayerStats, computePlayerEventStats, formatPct, lastN, type PlayerStats } from '../lib/stats';
import { positionOrderIndex } from '../lib/positions';
import { useIsViewer } from '../lib/authContext';

type SortKey = 'nombre' | 'posicion' | 'partidosJugados' | 'titularidades' | 'minutosJugados' | 'porcentajeMinutos';

export default function PlayersPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const [window, setWindowSize] = useState<3 | 5 | 10>(10);
  const [search, setSearch] = useState('');
  const [onlySub21, setOnlySub21] = useState(false);
  const [onlySub18, setOnlySub18] = useState(false);
  const [onlyExtranjero, setOnlyExtranjero] = useState(false);
  const [onlyBaja, setOnlyBaja] = useState(false);
  const [onlyDuda, setOnlyDuda] = useState(false);
  const [onlyEnSeleccion, setOnlyEnSeleccion] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('posicion');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Player | null>(null);
  const [importing, setImporting] = useState(false);
  const isViewer = useIsViewer();

  const matchesWindow = useMemo(() => lastN(rival.matches, window), [rival.matches, window]);
  const stats = useMemo(() => computeAllPlayerStats(rival.players, matchesWindow), [rival.players, matchesWindow]);

  const filtered = useMemo(() => {
    let list = stats;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.player.nombre.toLowerCase().includes(q) || s.player.posicion.toLowerCase().includes(q));
    }
    // Todo Sub-18 es, por edad, también Sub-21, así que el filtro Sub-21 los incluye.
    if (onlySub21) list = list.filter((s) => s.player.sub21 || s.player.sub18);
    if (onlySub18) list = list.filter((s) => s.player.sub18);
    if (onlyExtranjero) list = list.filter((s) => s.player.extranjero);
    if (onlyBaja) list = list.filter((s) => s.player.baja);
    if (onlyDuda) list = list.filter((s) => s.player.duda);
    if (onlyEnSeleccion) list = list.filter((s) => s.player.enSeleccion);
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'nombre') cmp = a.player.nombre.localeCompare(b.player.nombre);
      else if (sortKey === 'posicion') {
        cmp = positionOrderIndex(a.player.posicion) - positionOrderIndex(b.player.posicion);
        if (cmp === 0) cmp = (a.player.dorsal ?? 999) - (b.player.dorsal ?? 999);
      } else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return cmp * sortDir;
    });
  }, [stats, search, onlySub21, onlySub18, onlyExtranjero, onlyBaja, onlyDuda, onlyEnSeleccion, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(key === 'nombre' || key === 'posicion' ? 1 : -1);
    }
  };

  const quickToggleBaja = async (p: Player) => {
    await api.players.update(p.id, { baja: !p.baja });
    reload();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Jugadores</h2>
        {!isViewer && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setImporting(true)}>
              Importar planilla
            </button>
            <button className="btn-primary" onClick={() => setEditing('new')}>
              + Nuevo jugador
            </button>
          </div>
        )}
      </div>

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Buscar nombre o posición…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlySub21} onChange={(e) => setOnlySub21(e.target.checked)} /> Sub-21
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlySub18} onChange={(e) => setOnlySub18(e.target.checked)} /> Sub-18
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyExtranjero} onChange={(e) => setOnlyExtranjero(e.target.checked)} /> Extranjero
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyBaja} onChange={(e) => setOnlyBaja(e.target.checked)} /> Baja
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyDuda} onChange={(e) => setOnlyDuda(e.target.checked)} /> Duda
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={onlyEnSeleccion} onChange={(e) => setOnlyEnSeleccion(e.target.checked)} /> En
          selección
        </label>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <span className="text-slate-500 mr-1">Participación en últimos:</span>
          {[3, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => setWindowSize(n as 3 | 5 | 10)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                window === n ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <Th label="Jugador" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
              <Th label="Posición" active={sortKey === 'posicion'} dir={sortDir} onClick={() => toggleSort('posicion')} />
              <Th
                label="PJ"
                title="Partidos jugados"
                active={sortKey === 'partidosJugados'}
                dir={sortDir}
                onClick={() => toggleSort('partidosJugados')}
              />
              <Th
                label="Titular"
                active={sortKey === 'titularidades'}
                dir={sortDir}
                onClick={() => toggleSort('titularidades')}
              />
              <Th
                label="Minutos"
                active={sortKey === 'minutosJugados'}
                dir={sortDir}
                onClick={() => toggleSort('minutosJugados')}
              />
              <Th
                label="% Min. posibles"
                active={sortKey === 'porcentajeMinutos'}
                dir={sortDir}
                onClick={() => toggleSort('porcentajeMinutos')}
              />
              <th>Goles</th>
              <th title="Tarjetas amarillas / rojas">TA/TR</th>
              <th>Condiciones</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <PlayerRow
                key={s.player.id}
                stats={s}
                events={computePlayerEventStats(s.player.id, matchesWindow)}
                onEdit={() => setEditing(s.player)}
                onDelete={() => setToDelete(s.player)}
                onToggleBaja={() => quickToggleBaja(s.player)}
                isViewer={isViewer}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-400 py-6">
                  Sin jugadores que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PlayerFormModal
          player={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          rivalId={rival.id}
          sistemaAlternativo={rival.sistemaAlternativo}
        />
      )}

      {importing && (
        <ImportPlayersModal
          rivalId={rival.id}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            reload();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Eliminar jugador"
          message={`Se eliminará a "${toDelete.nombre}" y sus registros en XI/sustituciones.`}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await api.players.remove(toDelete.id);
            setToDelete(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Th({
  label,
  title,
  active,
  dir,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th className="cursor-pointer select-none" onClick={onClick} title={title}>
      {label} {active ? (dir === 1 ? '▲' : '▼') : ''}
    </th>
  );
}

function PlayerRow({
  stats,
  events,
  onEdit,
  onDelete,
  onToggleBaja,
  isViewer,
}: {
  stats: PlayerStats;
  events: { goles: number; amarillas: number; rojas: number };
  onEdit: () => void;
  onDelete: () => void;
  onToggleBaja: () => void;
  isViewer: boolean;
}) {
  const { player } = stats;
  return (
    <tr className={player.baja ? 'opacity-60' : ''}>
      <td className="text-slate-400">{player.dorsal ?? '—'}</td>
      <td className="font-medium text-slate-800">{player.nombre}</td>
      <td>{player.posicion || '—'}</td>
      <td>{stats.partidosJugados}</td>
      <td>{stats.titularidades}</td>
      <td>{Math.round(stats.minutosJugados)}'</td>
      <td>{formatPct(stats.porcentajeMinutos)}</td>
      <td>{events.goles}</td>
      <td>
        {events.amarillas > 0 && <span className="text-amber-600 font-medium">{events.amarillas}</span>}
        {events.amarillas > 0 && events.rojas > 0 && ' / '}
        {events.rojas > 0 && <span className="text-red-600 font-medium">{events.rojas}</span>}
        {events.amarillas === 0 && events.rojas === 0 && '—'}
      </td>
      <td>
        <PlayerBadges player={player} size="md" />
      </td>
      <td className="whitespace-nowrap">
        {!isViewer && (
          <>
            <button className="text-xs text-emerald-700 hover:underline mr-3" onClick={onToggleBaja}>
              {player.baja ? 'Quitar baja' : 'Marcar baja'}
            </button>
            <button className="text-xs text-slate-500 hover:underline mr-3" onClick={onEdit}>
              Editar
            </button>
            <button className="text-xs text-red-600 hover:underline" onClick={onDelete}>
              Eliminar
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function PlayerFormModal({
  player,
  rivalId,
  sistemaAlternativo,
  onClose,
  onSaved,
}: {
  player: Player | null;
  rivalId: string;
  sistemaAlternativo?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(player?.nombre || '');
  const [dorsal, setDorsal] = useState(player?.dorsal != null ? String(player.dorsal) : '');
  const [posicion, setPosicion] = useState(player?.posicion || '');
  const [posicionAlternativa, setPosicionAlternativa] = useState(player?.posicionAlternativa || '');
  const [estatura, setEstatura] = useState(player?.estatura != null ? String(player.estatura) : '');
  const [pie, setPie] = useState<PieHabil | ''>(player?.pie || '');
  const [sub21, setSub21] = useState(player?.sub21 || false);
  const [sub18, setSub18] = useState(player?.sub18 || false);
  const [extranjero, setExtranjero] = useState(player?.extranjero || false);
  const [baja, setBaja] = useState(player?.baja || false);
  const [duda, setDuda] = useState(player?.duda || false);
  const [enSeleccion, setEnSeleccion] = useState(player?.enSeleccion || false);
  const [notas, setNotas] = useState(player?.notas || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const data = {
        nombre: nombre.trim(),
        dorsal: dorsal.trim() === '' ? null : Number(dorsal),
        posicion: posicion.trim(),
        posicionAlternativa: posicionAlternativa.trim(),
        estatura: estatura.trim() === '' ? null : Number(estatura),
        pie: pie || null,
        sub21,
        sub18,
        extranjero,
        baja,
        duda,
        enSeleccion,
        notas,
      };
      if (player) await api.players.update(player.id, data);
      else await api.players.create(rivalId, data);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={player ? 'Editar jugador' : 'Nuevo jugador'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Nombre</label>
            <input autoFocus className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="label">Dorsal</label>
            <input
              type="number"
              className="input"
              value={dorsal}
              onChange={(e) => setDorsal(e.target.value)}
              placeholder="Ej: 9"
            />
          </div>
          <div className="col-span-2">
            <label className="label">Posición</label>
            <PositionSelect value={posicion} onChange={setPosicion} />
          </div>
          {sistemaAlternativo && (
            <div className="col-span-3">
              <label className="label">Posición con sistema alternativo ({sistemaAlternativo})</label>
              <PositionSelect value={posicionAlternativa} onChange={setPosicionAlternativa} />
              <p className="text-xs text-slate-400 mt-1">
                Si no se define, se muestra en el plantel con su posición principal.
              </p>
            </div>
          )}
          <div>
            <label className="label">Estatura (m)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={estatura}
              onChange={(e) => setEstatura(e.target.value)}
              placeholder="Ej: 1.85"
            />
          </div>
          <div className="col-span-3">
            <label className="label">Pie hábil</label>
            <select className="input" value={pie} onChange={(e) => setPie(e.target.value as PieHabil | '')}>
              <option value="">Sin especificar</option>
              <option value="Derecho">Derecho</option>
              <option value="Izquierdo">Izquierdo</option>
              <option value="Ambidiestro">Ambidiestro</option>
            </select>
          </div>
        </div>
        <div className="flex gap-5 pt-1 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={sub21} onChange={(e) => setSub21(e.target.checked)} /> Sub-21
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={sub18} onChange={(e) => setSub18(e.target.checked)} /> Sub-18
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={extranjero} onChange={(e) => setExtranjero(e.target.checked)} /> Extranjero
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={baja} onChange={(e) => setBaja(e.target.checked)} /> Baja
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={duda} onChange={(e) => setDuda(e.target.checked)} /> Duda
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={enSeleccion} onChange={(e) => setEnSeleccion(e.target.checked)} /> En
            selección
          </label>
        </div>
        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={saving || !nombre.trim()} onClick={submit}>
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
