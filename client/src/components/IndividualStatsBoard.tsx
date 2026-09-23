import type { IndividualStatsImport } from '../types';
import { INDIVIDUAL_STAT_GROUPS, topJugadores, umbralMinutos } from '../lib/individualStats';

// Líderes del plantel por categoría (Goleadores, %Duelos aéreos, etc.),
// compartido entre la vista web (GraficosPage) y el Informe impreso
// (InformePage) para no duplicar el cálculo/orden de categorías en los dos
// lugares.
export function IndividualStatsBoard({ data }: { data: IndividualStatsImport }) {
  const grupos = INDIVIDUAL_STAT_GROUPS.map((g) => ({
    titulo: g.titulo,
    categorias: g.categorias
      .map((c) => ({ ...c, top: topJugadores(data, c.columna) }))
      .filter((c) => c.top.length > 0),
  })).filter((g) => g.categorias.length > 0);

  const umbral = umbralMinutos(data);

  if (grupos.length === 0) {
    return <p className="text-sm text-slate-400">Ninguna de las categorías conocidas tiene datos en esta planilla.</p>;
  }

  return (
    <div className="space-y-4">
      {umbral.activo && (
        <p className="text-xs text-slate-400">
          Solo se consideran jugadores con al menos {Math.round(umbral.minMinutos)}' jugados (mitad de los{' '}
          {umbral.partidosDisputados} partidos disputados hasta ahora) — para no destacar a alguien por una muestra
          muy chica.
        </p>
      )}
      {grupos.map((g) => (
        <div key={g.titulo}>
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{g.titulo}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {g.categorias.map((c) => (
              <div key={c.columna} className="card p-3">
                <div className="text-xs font-semibold text-slate-700 mb-1.5">{c.etiqueta}</div>
                <ul className="space-y-0.5">
                  {c.top.map((j, i) => (
                    <li key={j.nombre} className="flex justify-between gap-2 text-sm">
                      <span className="text-slate-700 truncate">
                        {i + 1}. {j.nombre}
                      </span>
                      <span className="text-slate-400 font-medium shrink-0">{c.formato(j.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
