import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import LoginPage from '../pages/LoginPage';

// Envuelve toda la app: sin sesión de Supabase Auth muestra el login: con
// sesión, muestra la app normal más un botón para cerrar sesión.
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="px-6 py-10 text-sm text-slate-400">Cargando…</div>;
  if (!session) return <LoginPage />;

  return (
    <>
      {children}
      <button
        onClick={() => supabase.auth.signOut()}
        className="no-print fixed top-3 right-3 z-50 text-xs text-slate-400 hover:text-slate-600 bg-white/80 backdrop-blur px-2 py-1 rounded border border-slate-200"
      >
        Cerrar sesión
      </button>
    </>
  );
}
