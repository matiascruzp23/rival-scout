import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import { sortMatchesDesc } from '../lib/stats';
import { ConfirmDialog } from '../components/Modal';
import { playerMap, playerName } from '../lib/lookup';
import type { Match, MatchBaja } from '../types';
import { useIsViewer } from '../lib/authContext';

export default function MatchesPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Match | null>(null);
  const isViewer = useIsViewer();

  const matches = sortMatchesDesc(rival.matches);
  const players = playerMap(rival.players);

  const createMatch = async () => {
    setCreating(true);
    try {
      const match = await api.matches.create(rival.id, {
        fecha: new Date().toISOString().slice(0, 10),
        condicion: 'Local',
        duracionMinutos: 90,
      });
      navigate(`/rivales/${rival.id}/partidos/${match.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Partidos</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {matches.length} partido{matches.length === 1 ? '' : 's'} registrado{matches.length === 1 ? '' : 's'}. Se
            ordenan por fecha, del más reciente al más antiguo.
          </p>
        </div>
        {!isViewer && (
          <button className="btn-primary" disabled={creating} onClick={createMatch}>
            + Agregar partido
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Oponente</th>
              <th>Cond.</th>
              <th>Competencia</th>
              <th>Jornada</th>
              <th>Resultado</th>
              <th>Sistema</th>
              <th>XI</th>
              <th>Cambios</th>
              <th>CSV</th>
              <th>Bajas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const bajas = bajasRelevantes(m.bajas);
              return (
                <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/rivales/${rival.id}/partidos/${m.id}`)}>
                  <td className="whitespace-nowrap">
                    {m.fecha}
                    {m.enVivo && <span className="badge bg-red-100 text-red-700 ml-1.5">EN VIVO</span>}
                  </td>
                  <td>{m.oponente || '—'}</td>
                  <td>{m.condicion}</td>
                  <td>{m.competencia || '—'}</td>
                  <td>{m.jornada || '—'}</td>
                  <td>
                    {m.golesFavor ?? '-'} - {m.golesContra ?? '-'}
                  </td>
                  <td>{m.sistema || '—'}</td>
                  <td>{m.lineup.length}/11</td>
                  <td>{m.substitutions.length}</td>
                  <td>
                    {m.csv ? (
                      <span className="badge bg-emerald-100 text-emerald-700">{m.csv.rows.length} filas</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td
                    className="text-xs text-slate-600 max-w-[220px]"
                    title={bajas.map((b) => `${playerName(players, b.jugadorId)} (${b.categoria})`).join(', ')}
                  >
                    {bajas.length === 0
                      ? '—'
                      : bajas.length > MAX_BAJAS_CON_NOMBRE
                        ? CATEGORIAS_BAJA.map((c) => ({ c, n: bajas.filter((b) => b.categoria === c.key).length }))
                            .filter((x) => x.n > 0)
                            .map((x) => (
                              <div key={x.c.key} className="whitespace-nowrap">
                                {x.n} {x.n === 1 ? 'jugador' : 'jugadores'} ({x.n === 1 ? x.c.singular : x.c.plural})
                              </div>
                            ))
                        : bajas.map((b) => `${playerName(players, b.jugadorId)} (${b.categoria})`).join(', ')}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!isViewer && (
                      <button className="text-xs text-red-600 hover:underline" onClick={() => setToDelete(m)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {matches.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center text-slate-400 py-8">
                  No hay partidos registrados. Agrega el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Eliminar partido"
          message={`Se eliminará el partido del ${toDelete.fecha} contra ${toDelete.oponente || 'rival desconocido'}.`}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await api.matches.remove(toDelete.id);
            setToDelete(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// Con más bajas que esto la celda pasa a un resumen por motivo ("10
// jugadores (lesionados)…") en vez de listar nombres, que la estiraba hacia
// abajo y costaba leer. El detalle queda en el tooltip y en el partido.
const MAX_BAJAS_CON_NOMBRE = 3;

const CATEGORIAS_BAJA = [
  { key: 'lesión', singular: 'lesionado', plural: 'lesionados' },
  { key: 'suspensión', singular: 'suspendido', plural: 'suspendidos' },
  { key: 'selección', singular: 'selección', plural: 'selección' },
] as const;
type CategoriaBaja = (typeof CATEGORIAS_BAJA)[number]['key'];

// Bajas que explican una ausencia: lesión, suspensión y selección (que se
// carga como "otro motivo" con un texto tipo "Selección sub17"). Las de
// motivo desconocido no aportan y se omiten, igual que antes.
function bajasRelevantes(bajas: MatchBaja[]): (MatchBaja & { categoria: CategoriaBaja })[] {
  const out: (MatchBaja & { categoria: CategoriaBaja })[] = [];
  for (const b of bajas) {
    if (b.tipo === 'lesion') out.push({ ...b, categoria: 'lesión' });
    else if (b.tipo === 'suspension') out.push({ ...b, categoria: 'suspensión' });
    else if (b.tipo === 'otro' && /selecci/i.test(b.motivo || '')) out.push({ ...b, categoria: 'selección' });
  }
  return out;
}
