import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AppUser } from '../types';
import { useCurrentUser } from '../lib/authContext';

// Selector de "rival privado": null = público (visible para todos, el
// comportamiento de siempre); un array (incluso vacío) restringe el rival a
// su creador más quien esté marcado acá. El propio usuario nunca aparece en
// la lista porque como creador siempre puede verlo.
export function UserSharePicker({
  value,
  onChange,
}: {
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const currentUser = useCurrentUser();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState('');
  const privado = value !== null;

  useEffect(() => {
    if (privado && users === null) {
      api.users.list().then(setUsers).catch((e) => setError(e.message));
    }
  }, [privado, users]);

  const otros = (users || []).filter((u) => u.id !== currentUser?.id);

  const toggle = (userId: string) => {
    const actuales = value || [];
    onChange(actuales.includes(userId) ? actuales.filter((id) => id !== userId) : [...actuales, userId]);
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={privado} onChange={(e) => onChange(e.target.checked ? [] : null)} />
        Rival privado (solo lo ven ciertos usuarios)
      </label>
      {privado && (
        <div className="mt-2 border border-slate-200 rounded-md p-2.5 bg-slate-50">
          <p className="text-xs text-slate-500 mb-1.5">
            Vos siempre lo ves. Elegí qué otros usuarios también pueden verlo:
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {users === null ? (
            <p className="text-xs text-slate-400">Cargando usuarios…</p>
          ) : otros.length === 0 ? (
            <p className="text-xs text-slate-400">No hay otros usuarios creados todavía.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {otros.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={(value || []).includes(u.id)} onChange={() => toggle(u.id)} />
                  {u.username}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
