import type { TorneoRegla } from '../types';

function newRegla(): TorneoRegla {
  return {
    id: Math.random().toString(36).slice(2, 10),
    torneo: '',
    maxExtranjeros: null,
    minSub21: null,
    minMinutosSub21: null,
    exencionPorSeleccionado: null,
  };
}

export function TorneoReglasEditor({
  reglas,
  onChange,
  readOnly = false,
}: {
  reglas: TorneoRegla[];
  onChange: (reglas: TorneoRegla[]) => void;
  readOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<TorneoRegla>) => {
    const next = [...reglas];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => onChange(reglas.filter((_, i) => i !== index));

  return (
    <fieldset disabled={readOnly} className="space-y-2">
      <p className="text-xs text-slate-400 -mt-1 mb-1">
        Cupos de cada torneo en el que compite este rival (ej. máximo de extranjeros en cancha, mínimo de Sub-21), para
        contrastarlos contra el XI estimado cuando el próximo partido sea en ese torneo. La exención por seleccionado
        reduce el mínimo de Sub-21 por cada jugador del plantel marcado como "En selección". El mínimo de Sub-21 se
        carga de una de dos formas (no las dos a la vez): una cantidad fija de jugadores, o minutos Sub-21 acumulados
        por partido (ej. Copa Chile: 130' — como nadie llega solo a eso en 90', en la práctica exige 2 titulares).
      </p>
      {reglas.map((r, i) => (
        <div key={r.id} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="label">Torneo</label>
            <input
              className="input"
              value={r.torneo}
              onChange={(e) => update(i, { torneo: e.target.value })}
              placeholder="Ej: Copa Chile"
              list="torneos-regla-sugeridos"
            />
            <datalist id="torneos-regla-sugeridos">
              <option value="Torneo Nacional" />
              <option value="Primera B" />
              <option value="Copa Chile" />
              <option value="Copa Sudamericana" />
              <option value="Copa Libertadores" />
            </datalist>
          </div>
          <div className="w-36">
            <label className="label">Máx. extranjeros</label>
            <input
              type="number"
              min={0}
              className="input"
              value={r.maxExtranjeros ?? ''}
              onChange={(e) => update(i, { maxExtranjeros: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="Sin tope"
            />
          </div>
          <div className="w-36">
            <label className="label">Mín. Sub-21 (jugadores)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={r.minSub21 ?? ''}
              onChange={(e) =>
                update(i, {
                  minSub21: e.target.value === '' ? null : Number(e.target.value),
                  minMinutosSub21: e.target.value === '' ? r.minMinutosSub21 : null,
                })
              }
              placeholder="Sin mínimo"
            />
          </div>
          <div className="w-36">
            <label className="label" title="Suma de minutos jugados por Sub-21 exigida por partido (ej. Copa Chile: 130'), en vez de una cantidad fija de jugadores">
              Mín. Sub-21 (minutos)
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={r.minMinutosSub21 ?? ''}
              onChange={(e) =>
                update(i, {
                  minMinutosSub21: e.target.value === '' ? null : Number(e.target.value),
                  minSub21: e.target.value === '' ? r.minSub21 : null,
                })
              }
              placeholder="Sin mínimo"
            />
          </div>
          <div className="w-44">
            <label className="label" title="Cuánto reduce el mínimo de Sub-21 cada jugador del plantel convocado a una selección nacional">
              Exención x seleccionado
            </label>
            <input
              type="number"
              min={0}
              className="input"
              value={r.exencionPorSeleccionado ?? ''}
              onChange={(e) =>
                update(i, { exencionPorSeleccionado: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="Sin exención"
            />
          </div>
          {!readOnly && (
            <button className="text-slate-400 hover:text-red-600 text-lg leading-none px-1 pb-2" onClick={() => remove(i)}>
              &times;
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button className="btn-secondary" onClick={() => onChange([...reglas, newRegla()])}>
          + Agregar regla de torneo
        </button>
      )}
    </fieldset>
  );
}
