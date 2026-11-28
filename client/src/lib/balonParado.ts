// Balón parado: frecuencia de envíos del rival en córners a favor, a partir
// de CSV de Sportscode cargados aparte (pestaña "Balón parado"), no de los
// CSV de cada partido.
//
// En las filas "DETENIDAS A FAVOR" con "Acciones a balon parado" = Corner,
// el analista etiqueta además:
//   - Ungrouped: pateador (ej. OYARZO).
//   - Notes: zona de destino (códigos de ZONAS_CORNER).
//   - Flags: lado de lanzamiento y perfil (ej. "Izquierda, Cerrado"). El lado
//     es según el equipo que ataca (mirando al arco rival).

import type { BalonParadoArchivo, BalonParadoData, CornerBP, LadoCorner, PerfilCorner, ZonaCorner } from '../types';

export const ZONAS_CORNER: { codigo: ZonaCorner; nombre: string }[] = [
  { codigo: 'C', nombre: 'Corto' },
  { codigo: '1P', nombre: '1er palo' },
  { codigo: 'ACH', nombre: 'Área chica' },
  { codigo: '2P', nombre: '2º palo' },
  { codigo: 'PP', nombre: 'Punto penal' },
  { codigo: 'R', nombre: 'Rebote' },
];

const CODIGOS = new Set<string>(ZONAS_CORNER.map((z) => z.codigo));

export function nombreZona(codigo: ZonaCorner): string {
  return ZONAS_CORNER.find((z) => z.codigo === codigo)?.nombre ?? codigo;
}

// Mismo parser que server/src/csv.ts (campos entre comillas con comas
// internas), acá porque esta carga se procesa en el navegador.
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
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
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const columns = nonEmpty[0].map((c) => c.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, idx) => (obj[col] = (r[idx] ?? '').trim()));
    return obj;
  });
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// "OYARZO" / "oyarzo" → "Oyarzo"; "MÉNDEZ" → "Méndez".
function nombrePropio(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/(^|[\s.\-'])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

function leerFlags(flags: string): { lado: LadoCorner | ''; perfil: PerfilCorner | '' } {
  let lado: LadoCorner | '' = '';
  let perfil: PerfilCorner | '' = '';
  for (const parte of flags.split(',').map(norm)) {
    if (parte === 'izquierda') lado = 'Izquierda';
    else if (parte === 'derecha') lado = 'Derecha';
    else if (parte === 'abierto') perfil = 'Abierto';
    else if (parte === 'cerrado') perfil = 'Cerrado';
  }
  return { lado, perfil };
}

export function extraerCorners(text: string, nombreArchivo: string): BalonParadoArchivo {
  const rows = parseCsv(text);
  const partido = rows.find((r) => r['Timeline'])?.['Timeline'] || nombreArchivo.replace(/\.csv$/i, '');
  const corners: CornerBP[] = rows
    .filter((r) => norm(r['Row'] || '') === 'detenidas a favor' && norm(r['Acciones a balon parado'] || '') === 'corner')
    .map((r): CornerBP => {
      const zonaRaw = (r['Notes'] || '').trim().toUpperCase();
      const { lado, perfil } = leerFlags(r['Flags'] || '');
      return {
        inicio: Number(r['Start time']) || 0,
        pateador: r['Ungrouped'] ? nombrePropio(r['Ungrouped']) : '',
        zona: CODIGOS.has(zonaRaw) ? (zonaRaw as ZonaCorner) : '',
        zonaOriginal: zonaRaw && !CODIGOS.has(zonaRaw) ? zonaRaw : undefined,
        lado,
        perfil,
        resultado: r['RESULTADO'] || '',
      };
    })
    .sort((a, b) => a.inicio - b.inicio);
  return { nombre: nombreArchivo, partido, subidoEn: new Date().toISOString(), corners };
}

export interface CornerConPartido extends CornerBP {
  partido: string;
}

export function todosLosCorners(data: BalonParadoData | null | undefined): CornerConPartido[] {
  return (data?.archivos ?? []).flatMap((a) => a.corners.map((c) => ({ ...c, partido: a.partido })));
}

export function minuto(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Córners a los que les falta algún dato, para avisar que se completen en
// Sportscode y se vuelva a cargar el CSV.
export function cornersIncompletos(corners: CornerConPartido[]): { corner: CornerConPartido; faltan: string[] }[] {
  return corners
    .map((c) => {
      const faltan: string[] = [];
      if (!c.zona) faltan.push(c.zonaOriginal ? `zona (código "${c.zonaOriginal}" no reconocido)` : 'zona');
      if (!c.lado) faltan.push('lado');
      if (!c.perfil) faltan.push('perfil');
      if (!c.pateador) faltan.push('pateador');
      return { corner: c, faltan };
    })
    .filter((x) => x.faltan.length > 0);
}

export interface FiltroCorners {
  lado?: LadoCorner | '';
  pateador?: string;
  perfil?: PerfilCorner | '';
}

export function filtrarCorners<T extends CornerBP>(corners: T[], f: FiltroCorners): T[] {
  return corners.filter(
    (c) => (!f.lado || c.lado === f.lado) && (!f.pateador || c.pateador === f.pateador) && (!f.perfil || c.perfil === f.perfil),
  );
}

export type ConteoZonas = Record<ZonaCorner, number>;

export interface DistribucionZonas {
  conteo: ConteoZonas;
  // Córners con zona válida: base del %.
  total: number;
}

export function distribucionZonas(corners: CornerBP[]): DistribucionZonas {
  const conteo = Object.fromEntries(ZONAS_CORNER.map((z) => [z.codigo, 0])) as ConteoZonas;
  let total = 0;
  for (const c of corners) {
    if (!c.zona) continue;
    conteo[c.zona]++;
    total++;
  }
  return { conteo, total };
}

export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export interface FilaPateador {
  pateador: string;
  total: number;
  izquierda: number;
  derecha: number;
  abierto: number;
  cerrado: number;
  zonas: DistribucionZonas;
  zonaFrecuente: ZonaCorner | null;
}

export function resumenPorPateador(corners: CornerBP[]): FilaPateador[] {
  const porPateador = new Map<string, CornerBP[]>();
  for (const c of corners) {
    const k = c.pateador || 'Sin pateador';
    porPateador.set(k, [...(porPateador.get(k) ?? []), c]);
  }
  return [...porPateador.entries()]
    .map(([pateador, cs]) => {
      const zonas = distribucionZonas(cs);
      const max = Math.max(0, ...Object.values(zonas.conteo));
      const zonaFrecuente = max > 0 ? ZONAS_CORNER.find((z) => zonas.conteo[z.codigo] === max)!.codigo : null;
      return {
        pateador,
        total: cs.length,
        izquierda: cs.filter((c) => c.lado === 'Izquierda').length,
        derecha: cs.filter((c) => c.lado === 'Derecha').length,
        abierto: cs.filter((c) => c.perfil === 'Abierto').length,
        cerrado: cs.filter((c) => c.perfil === 'Cerrado').length,
        zonas,
        zonaFrecuente,
      };
    })
    .sort((a, b) => b.total - a.total || a.pateador.localeCompare(b.pateador));
}

export function pateadores(corners: CornerBP[]): string[] {
  return resumenPorPateador(corners)
    .map((f) => f.pateador)
    .filter((p) => p !== 'Sin pateador');
}

// Cómo se lee cada zona en una frase ("Abierto al 1er palo").
const FRASE_ZONA: Record<ZonaCorner, string> = {
  C: 'en corto',
  '1P': 'al 1er palo',
  ACH: 'al área chica',
  '2P': 'al 2º palo',
  PP: 'al punto penal',
  R: 'al rebote',
};

export interface Tendencia {
  texto: string;
  n: number;
  // % sobre los córners de la vista.
  p: number;
}

// Combinaciones perfil + zona más repetidas (ej. "Abierto al 1er palo").
// Empates: se respeta el orden de ZONAS_CORNER y Abierto antes que Cerrado.
export function tendenciasPerfilZona(corners: CornerBP[], k = 2): Tendencia[] {
  const out: Tendencia[] = [];
  for (const z of ZONAS_CORNER) {
    for (const perfil of ['Abierto', 'Cerrado'] as const) {
      const n = corners.filter((c) => c.zona === z.codigo && c.perfil === perfil).length;
      if (n > 0) out.push({ texto: `${perfil} ${FRASE_ZONA[z.codigo]}`, n, p: pct(n, corners.length) });
    }
  }
  return out.sort((a, b) => b.n - a.n).slice(0, k);
}

export function pateadoresFrecuentes(corners: CornerBP[], k = 2): Tendencia[] {
  return resumenPorPateador(corners)
    .filter((f) => f.pateador !== 'Sin pateador')
    .slice(0, k)
    .map((f) => ({ texto: f.pateador, n: f.total, p: pct(f.total, corners.length) }));
}
