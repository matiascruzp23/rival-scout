import type { MatchWindow } from '../lib/stats';

const OPCIONES: MatchWindow[] = ['todos', 10, 5, 3];

// Selector de cuántos partidos considerar: por defecto todos los registrados,
// con atajos para mirar solo los más recientes.
export function MatchWindowSelector({
  value,
  onChange,
  total,
  label = 'Partidos:',
}: {
  value: MatchWindow;
  onChange: (w: MatchWindow) => void;
  total: number;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-slate-500 mr-1">{label}</span>
      {OPCIONES.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
            value === n ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
          }`}
        >
          {n === 'todos' ? `Todos (${total})` : `últimos ${n}`}
        </button>
      ))}
    </div>
  );
}
