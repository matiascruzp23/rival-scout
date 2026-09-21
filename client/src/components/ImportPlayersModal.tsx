import { useRef, useState } from 'react';
import { api } from '../api';
import { Modal } from './Modal';
import { PositionSelect } from './PositionSelect';
import type { ImportedPlayerRow, PieHabil } from '../types';

interface EditableRow extends ImportedPlayerRow {
  incluir: boolean;
}

// Importa jugadores desde una planilla (export de Wyscout u otra armada a
// mano): el servidor la convierte a nuestro formato (server/src/playerImport.ts)
// según encabezados conocidos (Jugador, Posición específica, Edad, Pasaporte,
// Pie, Altura...), y acá el analista revisa/corrige cada fila —
// especialmente la posición, que en algunos códigos de Wyscout no distingue
// lado y queda marcada para revisión — antes de confirmar la creación.
export function ImportPlayersModal({
  rivalId,
  onClose,
  onImported,
}: {
  rivalId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [columnasNoReconocidas, setColumnasNoReconocidas] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const result = await api.players.importPreview(rivalId, file);
      setRows(result.rows.map((r) => ({ ...r, incluir: true })));
      setColumnasNoReconocidas(result.columnasNoReconocidas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const update = (index: number, patch: Partial<EditableRow>) => {
    if (!rows) return;
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setRows(next);
  };

  const seleccionados = rows?.filter((r) => r.incluir) || [];

  const confirmar = async () => {
    if (!rows) return;
    setSaving(true);
    setError('');
    try {
      await api.players.importConfirm(rivalId, seleccionados);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Importar jugadores desde planilla" onClose={onClose} wide>
      <div className="space-y-3">
        {!rows && (
          <>
            <p className="text-sm text-slate-600">
              Sube un archivo .xlsx/.xls/.csv (por ejemplo, un export de Wyscout) con la plantilla de jugadores. Se
              reconocen columnas como <em>Jugador</em>, <em>Posición específica</em>, <em>Edad</em>,{' '}
              <em>Pasaporte</em>, <em>Pie</em> y <em>Altura</em>.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              disabled={loading}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {loading && <p className="text-sm text-slate-400">Leyendo archivo…</p>}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rows && (
          <>
            {columnasNoReconocidas.length > 0 && (
              <p className="text-xs text-slate-400">
                Columnas del archivo que no se usaron: {columnasNoReconocidas.join(', ')}.
              </p>
            )}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              Revisa sobre todo las filas marcadas en amarillo: su código de posición original no distingue lado
              (izquierdo/derecho) y se completó con la opción más parecida — corrígela si no calza.
            </p>
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">Incluir</th>
                    <th className="p-2 text-left">Nombre</th>
                    <th className="p-2 text-left">Dorsal</th>
                    <th className="p-2 text-left">Posición</th>
                    <th className="p-2 text-left">Pie</th>
                    <th className="p-2 text-left">Altura (m)</th>
                    <th className="p-2 text-left">Sub-21</th>
                    <th className="p-2 text-left">Sub-18</th>
                    <th className="p-2 text-left">Extranjero</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 ${r.posicionNecesitaRevision ? 'bg-amber-50' : ''}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={r.incluir} onChange={(e) => update(i, { incluir: e.target.checked })} />
                      </td>
                      <td className="p-2">
                        <input
                          className="input"
                          value={r.nombre}
                          onChange={(e) => update(i, { nombre: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          className="input w-16"
                          value={r.dorsal ?? ''}
                          onChange={(e) => update(i, { dorsal: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-2">
                        <PositionSelect value={r.posicion} onChange={(v) => update(i, { posicion: v })} />
                        {r.posicionNecesitaRevision && (
                          <p className="text-[10px] text-amber-700 mt-0.5">original: {r.posicionOriginal}</p>
                        )}
                      </td>
                      <td className="p-2">
                        <select
                          className="input"
                          value={r.pie || ''}
                          onChange={(e) => update(i, { pie: (e.target.value || null) as PieHabil | null })}
                        >
                          <option value="">Sin especificar</option>
                          <option value="Derecho">Derecho</option>
                          <option value="Izquierdo">Izquierdo</option>
                          <option value="Ambidiestro">Ambidiestro</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          className="input w-20"
                          value={r.estatura ?? ''}
                          onChange={(e) => update(i, { estatura: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={r.sub21} onChange={(e) => update(i, { sub21: e.target.checked })} />
                      </td>
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={r.sub18} onChange={(e) => update(i, { sub18: e.target.checked })} />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!r.extranjero}
                          onChange={(e) => update(i, { extranjero: e.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          {rows && (
            <button className="btn-primary" disabled={saving || seleccionados.length === 0} onClick={confirmar}>
              {saving ? 'Importando…' : `Importar ${seleccionados.length} jugador${seleccionados.length === 1 ? '' : 'es'}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
