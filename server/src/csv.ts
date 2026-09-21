// Parser CSV simple compatible con exportaciones de Sportscode (soporta campos entre comillas con comas internas).
export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonEmpty.length === 0) return { columns: [], rows: [] };

  const columns = nonEmpty[0].map((c) => c.trim());
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, idx) => {
      obj[col] = (r[idx] ?? '').trim();
    });
    return obj;
  });

  return { columns, rows: dataRows };
}

// Categorías Sportscode a excluir según lo solicitado: transiciones y balón detenido.
export const EXCLUDED_CATEGORY_PATTERNS = [/transicion/i, /detenida/i];

export function isExcludedCategory(rowValue: string | undefined): boolean {
  if (!rowValue) return false;
  return EXCLUDED_CATEGORY_PATTERNS.some((re) => re.test(rowValue));
}
