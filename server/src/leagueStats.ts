import * as XLSX from 'xlsx';

export interface ParsedLeagueStats {
  columns: string[];
  rows: Record<string, string | number>[];
}

// La planilla mezcla celdas numéricas reales con texto que usa coma como
// separador decimal (ej. "9,40" en vez de 9.4): una celda numérica real ya
// llega como number (con toda su precisión, `raw: true` más abajo evita que
// sheet_to_json la trunque al formato de visualización de la celda); una
// celda de texto con coma se normaliza probando el número con la coma
// reemplazada, y si no da un número válido, se deja como texto tal cual (es
// el caso de la columna "Equipo").
function parseCell(raw: string | number): string | number {
  if (typeof raw === 'number') return raw;
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const normalized = trimmed.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
  return trimmed;
}

// Lee la primera hoja de la planilla de estadísticas de liga: una fila por
// equipo (más una fila "PROMEDIO" ya calculada en el propio Excel). La
// primera columna identifica al equipo (su código/abreviación); el resto
// son métricas numéricas. Filas sin nada en esa primera columna (huecos al
// final de la hoja) se descartan.
export function parseLeagueStatsFile(buffer: Buffer): ParsedLeagueStats {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (raw.length === 0) return { columns: [], rows: [] };

  const columns = Object.keys(raw[0]).filter((c) => c && !c.startsWith('__EMPTY'));
  if (columns.length === 0) return { columns: [], rows: [] };
  const equipoCol = columns[0];

  const rows = raw
    .map((r) => {
      const equipo = String(r[equipoCol] ?? '').trim();
      if (!equipo) return null;
      const out: Record<string, string | number> = { [equipoCol]: equipo };
      for (const col of columns.slice(1)) out[col] = parseCell(r[col] ?? '');
      return out;
    })
    .filter((r): r is Record<string, string | number> => !!r);

  return { columns, rows };
}
