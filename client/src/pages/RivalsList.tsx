import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { RivalListItem } from '../types';
import { Modal, ConfirmDialog } from '../components/Modal';
import { SystemSelect } from '../components/SystemSelect';
import { AppLogo } from '../components/AppLogo';
import { useIsViewer } from '../lib/authContext';
import { RivalsCalendar } from '../components/RivalsCalendar';

export default function RivalsList() {
  const [rivals, setRivals] = useState<RivalListItem[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<RivalListItem | null>(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista');
  const navigate = useNavigate();
  const isViewer = useIsViewer();

  const load = () => {
    api.rivals.list().then(setRivals).catch((e) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <AppLogo />
          <h1 className="text-2xl font-bold text-slate-900">Análisis de rival</h1>
        </div>
        {!isViewer && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Nuevo rival
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {rivals === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : rivals.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          <p>No hay rivales creados todavía.</p>
          {!isViewer && (
            <button className="btn-primary mt-4" onClick={() => setShowCreate(true)}>
              Crear el primer rival
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 text-sm mb-4">
            <button
              onClick={() => setVista('lista')}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                vista === 'lista' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setVista('calendario')}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                vista === 'calendario' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              Calendario
            </button>
          </div>

          {vista === 'lista' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rivals.map((r) => (
                <div key={r.id} className="card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-2">
                    {r.escudoUrl && <img src={r.escudoUrl} alt="" className="w-8 h-8 object-contain shrink-0" />}
                    <Link to={`/rivales/${r.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {r.nombre}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-500 flex gap-4">
                    <span>{r.matchCount} partido{r.matchCount === 1 ? '' : 's'}</span>
                    <span>{r.playerCount} jugador{r.playerCount === 1 ? '' : 'es'}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button className="btn-secondary text-xs" onClick={() => navigate(`/rivales/${r.id}`)}>
                      Abrir
                    </button>
                    {!isViewer && (
                      <button className="btn-danger text-xs" onClick={() => setToDelete(r)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <RivalsCalendar rivals={rivals} />
              <SinFecha rivals={rivals} />
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateRivalModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/rivales/${id}`);
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Eliminar rival"
          message={`Se eliminará "${toDelete.nombre}" junto con todos sus jugadores y partidos. Esta acción no se puede deshacer.`}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await api.rivals.remove(toDelete.id);
            setToDelete(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// Rivales sin "próximo partido" cargado (o sin fecha dentro de ese campo):
// no tienen dónde aparecer en el calendario, así que quedan aparte para no
// perderlos de vista.
function SinFecha({ rivals }: { rivals: RivalListItem[] }) {
  const sinFecha = rivals.filter((r) => !r.proximoPartido?.fecha);
  if (sinFecha.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-1">Sin fecha asignada</h3>
      <p className="text-xs text-slate-400 mb-3">Rivales sin un próximo partido cargado — no aparecen en el calendario.</p>
      <div className="flex flex-wrap gap-2">
        {sinFecha.map((r) => (
          <Link
            key={r.id}
            to={`/rivales/${r.id}`}
            className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-sm hover:border-emerald-400 hover:bg-emerald-50"
          >
            {r.escudoUrl && <img src={r.escudoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />}
            {r.nombre}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CreateRivalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [entrenador, setEntrenador] = useState('');
  const [sistemaPrincipal, setSistemaPrincipal] = useState('');
  const [sistemaAlternativo, setSistemaAlternativo] = useState('');
  const [escudo, setEscudo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const rival = await api.rivals.create({ nombre: nombre.trim(), entrenador, sistemaPrincipal, sistemaAlternativo });
      if (escudo) await api.rivals.uploadEscudo(rival.id, escudo);
      onCreated(rival.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nuevo rival" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Nombre del equipo rival</label>
          <input
            autoFocus
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ej: Everton"
          />
        </div>
        <div>
          <label className="label">Escudo (opcional)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="input"
            onChange={(e) => setEscudo(e.target.files?.[0] || null)}
          />
        </div>
        <div>
          <label className="label">Entrenador (opcional)</label>
          <input
            className="input"
            value={entrenador}
            onChange={(e) => setEntrenador(e.target.value)}
            placeholder="Nombre del entrenador"
          />
        </div>
        <div>
          <label className="label">Sistema predilecto</label>
          <SystemSelect value={sistemaPrincipal} onChange={setSistemaPrincipal} emptyLabel="Elegir más tarde" />
          <p className="text-xs text-slate-400 mt-1">Define qué 11 posiciones se muestran en el plantel.</p>
        </div>
        <div>
          <label className="label">Sistema alternativo (opcional)</label>
          <SystemSelect value={sistemaAlternativo} onChange={setSistemaAlternativo} emptyLabel="Sin alternativo" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={saving || !nombre.trim()} onClick={submit}>
            Crear
          </button>
        </div>
      </div>
    </Modal>
  );
}
