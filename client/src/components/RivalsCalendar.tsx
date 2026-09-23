import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RivalListItem } from '../types';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Lunes primero (0) a domingo (6), a diferencia de Date.getDay() (0 = domingo).
function startWeekday(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

const today = new Date();
const TODAY_KEY = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

// Calendario mensual: cada rival aparece en la fecha de su "próximo
// partido" (rival.proximoPartido.fecha) — a medida que esa fecha pasa,
// sigue apareciendo ahí, solo que hay que retroceder en el calendario para
// volver a verlo, en vez de tener que buscarlo en una lista larga.
export function RivalsCalendar({ rivals }: { rivals: RivalListItem[] }) {
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const byDate = useMemo(() => {
    const map = new Map<string, RivalListItem[]>();
    for (const r of rivals) {
      const fecha = r.proximoPartido?.fecha;
      if (!fecha) continue;
      if (!map.has(fecha)) map.set(fecha, []);
      map.get(fecha)!.push(r);
    }
    return map;
  }, [rivals]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = startWeekday(year, month);
  const total = daysInMonth(year, month);
  const cellCount = Math.ceil((leading + total) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => {
    const day = i - leading + 1;
    return day >= 1 && day <= total ? day : null;
  });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <button className="btn-secondary text-xs" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ← Mes anterior
        </button>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800">
            {MESES[month]} {year}
          </h3>
          <button
            className="text-xs text-emerald-700 hover:underline"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </button>
        </div>
        <button className="btn-secondary text-xs" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          Mes siguiente →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[86px] rounded-md bg-slate-50/50" />;
          const key = `${year}-${pad(month + 1)}-${pad(day)}`;
          const rivalesDelDia = byDate.get(key) || [];
          const isToday = key === TODAY_KEY;
          return (
            <div
              key={i}
              className={`min-h-[86px] rounded-md border p-1 flex flex-col gap-1 ${
                isToday ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100'
              }`}
            >
              <span className={`text-xs ${isToday ? 'font-bold text-emerald-700' : 'text-slate-400'}`}>{day}</span>
              <div className="flex flex-wrap gap-1">
                {rivalesDelDia.map((r) => (
                  <Link
                    key={r.id}
                    to={`/rivales/${r.id}`}
                    className="w-1/2 aspect-square flex items-center justify-center bg-white border border-slate-200 rounded hover:border-emerald-400 hover:bg-emerald-50 p-0.5"
                    title={r.nombre}
                  >
                    {r.escudoUrl ? (
                      <img src={r.escudoUrl} alt={r.nombre} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {r.nombre.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
