import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import { sortMatchesDesc } from '../lib/stats';
import { ConfirmDialog } from '../components/Modal';
import { playerMap, playerName } from '../lib/lookup';
import type { Match } from '../types';
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
            Últimos {matches.length} de 10 recomendados. Se ordenan por fecha, del más reciente al más antiguo.
          </p>
        </div>
        {!isViewer && (
          <button className="btn-primary" disabled={creating} onClick={createMatch}>
            + Agregar partido
          </button>
        )}
      </div>

      {matches.length > 10 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
          Hay {matches.length} partidos registrados. Considera mantener solo los últimos 10 para un análisis más
          representativo.
        </p>
      )}

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
              <th>Bajas (lesión/susp.)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const bajasPorLesionOSuspension = m.bajas.filter((b) => b.tipo === 'lesion' || b.tipo === 'suspension');
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
                  <td className="text-xs text-slate-600 max-w-[220px]">
                    {bajasPorLesionOSuspension.length > 0
                      ? bajasPorLesionOSuspension
                          .map((b) => `${playerName(players, b.jugadorId)} (${b.tipo === 'lesion' ? 'lesión' : 'susp.'})`)
                          .join(', ')
                      : '—'}
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
