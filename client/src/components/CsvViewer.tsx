import { useMemo, useState } from 'react';
import type { MatchCsv } from '../types';

export function CsvViewer({ csv }: { csv: MatchCsv }) {
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const filterableColumns = useMemo(
    () =>
      csv.columns.filter((c) => {
        const distinct = new Set(csv.rows.map((r) => r[c]).filter(Boolean));
        return distinct.size > 1 && distinct.size <= 20;
      }),
    [csv]
  );

  const filtered = useMemo(() => {
    let rows = csv.rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => csv.columns.some((c) => (r[c] || '').toLowerCase().includes(q)));
    }
    for (const [col, val] of Object.entries(columnFilters)) {
      if (val) rows = rows.filter((r) => r[col] === val);
    }
    return rows;
  }, [csv, search, columnFilters]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = row[groupBy] || '(vacío)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered, groupBy]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
        <span>
          {csv.fileName} · {csv.rows.length} registros · importado {new Date(csv.importedAt).toLocaleString('es-CL')}
        </span>
        {csv.excludedCategories.length > 0 && (
          <span title="Excluidas por ser transición o balón detenido">
            Categorías excluidas: {csv.excludedCategories.join(', ')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="input max-w-xs"
          placeholder="Buscar en todos los campos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[200px]" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="">Sin agrupar</option>
          {csv.columns.map((c) => (
            <option key={c} value={c}>
              Agrupar por: {c}
            </option>
          ))}
        </select>
        {filterableColumns.map((col) => {
          const options = Array.from(new Set(csv.rows.map((r) => r[col]).filter(Boolean))).sort();
          return (
            <select
              key={col}
              className="input max-w-[190px]"
              value={columnFilters[col] || ''}
              onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))}
            >
              <option value="">{col}: todos</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          );
        })}
        {(search || groupBy || Object.values(columnFilters).some(Boolean)) && (
          <button
            className="text-xs text-slate-500 hover:underline"
            onClick={() => {
              setSearch('');
              setGroupBy('');
              setColumnFilters({});
            }}
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} de {csv.rows.length} filas</span>
      </div>

      {grouped ? (
        <div className="space-y-4">
          {grouped.map(([key, rows]) => (
            <div key={key} className="card overflow-x-auto">
              <div className="px-3 py-2 bg-slate-100 text-xs font-semibold text-slate-600 border-b border-slate-200">
                {key} <span className="text-slate-400 font-normal">({rows.length})</span>
              </div>
              <CsvTable columns={csv.columns} rows={rows} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto max-h-[520px] overflow-y-auto">
          <CsvTable columns={csv.columns} rows={filtered} />
        </div>
      )}
    </div>
  );
}

function CsvTable({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  const visibleColumns = columns.filter((c) => rows.some((r) => r[c]));
  return (
    <table>
      <thead>
        <tr>
          {visibleColumns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {visibleColumns.map((c) => (
              <td key={c} className="whitespace-nowrap">
                {r[c] || ''}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={visibleColumns.length || 1} className="text-center text-slate-400 py-4">
              Sin registros.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
