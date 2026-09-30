import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { LeagueStatsImport } from '../types';
import { construirConclusiones } from '../lib/conclusionesReglas';
import { MarkdownLite } from '../components/MarkdownLite';

export default function ConclusionesPage() {
  const { rival } = useOutletContext<RivalContext>();
  const [leagueStats, setLeagueStats] = useState<LeagueStatsImport | null | undefined>(undefined);

  useEffect(() => {
    api.leagueStats
      .get()
      .then(setLeagueStats)
      .catch(() => setLeagueStats(null));
  }, []);

  const texto = useMemo(
    () => (leagueStats === undefined ? null : construirConclusiones(rival, leagueStats)),
    [rival, leagueStats]
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Conclusiones</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Lectura automática de qué tener en cuenta para neutralizar a {rival.nombre} y de qué manera se le puede
          hacer daño. Se actualiza sola a medida que cambian los datos.
        </p>
      </div>

      {texto == null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <section className="card p-4">
          <MarkdownLite text={texto} />
        </section>
      )}
    </div>
  );
}
