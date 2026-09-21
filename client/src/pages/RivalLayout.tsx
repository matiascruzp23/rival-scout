import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { RivalDetail } from '../types';
import { AppLogo } from '../components/AppLogo';

export interface RivalContext {
  rival: RivalDetail;
  reload: () => void;
}

const tabs = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'jugadores', label: 'Jugadores' },
  { to: 'partidos', label: 'Partidos' },
  { to: 'xi-rotaciones', label: 'XI y Rotaciones' },
  { to: 'sustituciones', label: 'Sustituciones' },
  { to: 'analisis-csv', label: 'Análisis' },
  { to: 'informe', label: 'Informe' },
];

export default function RivalLayout() {
  const { rivalId } = useParams();
  const [rival, setRival] = useState<RivalDetail | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!rivalId) return;
    api.rivals.get(rivalId).then(setRival).catch((e) => setError(e.message));
  }, [rivalId]);

  useEffect(reload, [reload]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-red-600 text-sm">{error}</p>
        <Link to="/" className="text-emerald-700 text-sm underline">
          Volver
        </Link>
      </div>
    );
  }

  if (!rival) return <div className="px-6 py-10 text-sm text-slate-400">Cargando…</div>;

  return (
    <div className="min-h-screen">
      <header className="no-print bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <AppLogo />
            <div>
              <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
                ← Rivales
              </Link>
              <h1 className="text-xl font-bold text-slate-900">{rival.nombre}</h1>
            </div>
          </div>
          {rival.escudoUrl && (
            <img
              src={rival.escudoUrl}
              alt=""
              className="w-10 h-10 object-contain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          )}
          <div className="text-xs text-slate-500 text-right">
            <div>{rival.matches.length} partido{rival.matches.length === 1 ? '' : 's'} registrado{rival.matches.length === 1 ? '' : 's'}</div>
            <div>{rival.players.length} jugador{rival.players.length === 1 ? '' : 'es'} en plantilla</div>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  isActive
                    ? 'border-emerald-700 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">
        <Outlet context={{ rival, reload } satisfies RivalContext} />
      </main>
    </div>
  );
}
