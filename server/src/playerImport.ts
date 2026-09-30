import * as XLSX from 'xlsx';
import type { PieHabil } from './types.js';

// País de referencia para decidir "extranjero": comparado contra el
// pasaporte del jugador. La app está pensada para plantillas chilenas; si
// algún día se escoutea una liga de otro país, este valor tendría que
// poder configurarse, pero por ahora es un supuesto razonable y simple.
const PAIS_LOCAL = 'chile';

// Códigos de posición de Wyscout (columna "Posición específica" de sus
// exports, ej. "RWB, CF, RB" — se usa el primero, que es la posición
// principal). Los que no distinguen lado (CB, DMF, CMF, RDMF/LDMF,
// RAMF/LAMF) no tienen un mapeo 1 a 1 confiable a nuestro catálogo (que sí
// distingue lado), así que quedan marcados para que el analista los revise.
const WYSCOUT_POSITION_MAP: Record<string, { posicion: string; needsReview?: boolean }> = {
  GK: { posicion: 'Arquero' },
  RB: { posicion: 'Lateral derecho' },
  LB: { posicion: 'Lateral izquierdo' },
  RCB: { posicion: 'Central derecho' },
  LCB: { posicion: 'Central izquierdo' },
  CB: { posicion: 'Central', needsReview: true },
  RWB: { posicion: 'Carrilero derecho' },
  LWB: { posicion: 'Carrilero izquierdo' },
  DMF: { posicion: 'Volante central', needsReview: true },
  RDMF: { posicion: 'Volante central', needsReview: true },
  LDMF: { posicion: 'Volante central', needsReview: true },
  CMF: { posicion: 'Volante central', needsReview: true },
  RCMF: { posicion: 'Medio centro derecho' },
  LCMF: { posicion: 'Medio centro izquierdo' },
  RAMF: { posicion: 'Medio centro derecho', needsReview: true },
  LAMF: { posicion: 'Medio centro izquierdo', needsReview: true },
  AMF: { posicion: 'Mediapunta' },
  RW: { posicion: 'Extremo derecho' },
  LW: { posicion: 'Extremo izquierdo' },
  RWF: { posicion: 'Extremo derecho' },
  LWF: { posicion: 'Extremo izquierdo' },
  SS: { posicion: 'Segundo delantero' },
  CF: { posicion: 'Delantero centro' },
};

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Distintos exports (Wyscout, o una planilla armada a mano) pueden nombrar
// las columnas un poco distinto — se listan alias razonables por campo en
// vez de exigir el encabezado exacto.
const HEADER_ALIASES: Record<string, string[]> = {
  nombre: ['jugador', 'nombre', 'name', 'player'],
  posicion: ['posicion especifica', 'posicion', 'position'],
  edad: ['edad', 'age'],
  pasaporte: ['pasaporte', 'passport'],
  paisNacimiento: ['pais de nacimiento', 'birth country'],
  pie: ['pie', 'foot'],
  altura: ['altura', 'height'],
};

function findColumn(headers: string[], field: string): string | null {
  const aliases = HEADER_ALIASES[field] || [];
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));
  for (const alias of aliases) {
    const match = normalized.find((h) => h.norm === alias);
    if (match) return match.original;
  }
  return null;
}

function primeraPosicion(raw: string): { posicion: string; needsReview: boolean; original: string } {
  const codigo = (raw.split(',')[0] || '').trim().toUpperCase();
  const mapped = WYSCOUT_POSITION_MAP[codigo];
  if (!mapped) return { posicion: '', needsReview: true, original: raw };
  return { posicion: mapped.posicion, needsReview: !!mapped.needsReview, original: raw };
}

// Sub-21/Sub-19 incluyen a quienes CUMPLEN esa edad en algún momento de la
// temporada en curso (nacidos el año actual menos 21/19 o después), no a
// quienes todavía no tengan esa edad exacta hoy — un jugador nacido en
// marzo de ese año sigue siendo Sub-21 aunque ya haya cumplido 21 en marzo.
// Antes esto se calculaba con la edad exacta del día (edad < 21), lo que
// dejaba afuera a cualquiera que ya hubiese cumplido años este año.
function categoriasPorAnioNacimiento(anioNacimiento: number): { sub21: boolean; sub19: boolean } {
  const anioActual = new Date().getFullYear();
  return { sub21: anioNacimiento >= anioActual - 21, sub19: anioNacimiento >= anioActual - 19 };
}

// Cuando la planilla no trae año/fecha de nacimiento (solo una edad exacta
// ya calculada, ej. el export genérico de Wyscout) no se puede aplicar el
// criterio de arriba con precisión — se aproxima con la edad tal cual,
// sabiendo que un jugador que ya cumplió años este mes puede quedar
// afuera de su categoría real. El analista siempre puede corregir el
// checkbox a mano en la vista previa antes de confirmar la importación.
function categoriasPorEdadAproximada(edad: number): { sub21: boolean; sub19: boolean } {
  return { sub21: edad <= 21, sub19: edad <= 19 };
}

// Primer año de 4 dígitos (19xx/20xx) que aparece en la celda de
// nacimiento del paste de Transfermarkt (ej. "15.03.2005 (21)" o
// "Mar 15, 2005 (21)") — el otro número de esa celda es la edad, entre
// paréntesis, nunca un año de 4 dígitos.
function anioNacimientoDeCelda(cell: string): number | null {
  const match = cell.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function mapPie(raw: string): PieHabil | null {
  const v = normalizeHeader(raw);
  if (v === 'derecho' || v === 'right') return 'Derecho';
  if (v === 'izquierdo' || v === 'left') return 'Izquierdo';
  if (v === 'ambidiestro' || v === 'both' || v === 'ambos') return 'Ambidiestro';
  return null;
}

function esExtranjero(pasaporte: string, paisNacimiento: string): boolean | null {
  const fuente = pasaporte || paisNacimiento;
  if (!fuente) return null;
  const paises = fuente.split(',').map((p) => normalizeHeader(p));
  return !paises.includes(PAIS_LOCAL);
}

// Posiciones tal como aparecen en una tabla de plantel de Transfermarkt
// (en español). A diferencia de Wyscout, sus laterales/extremos ya
// distinguen lado; solo "Defensa central" no lo hace, igual que el CB de
// Wyscout, así que queda igual marcada para revisión.
const TRANSFERMARKT_POSITION_MAP: Record<string, { posicion: string; needsReview?: boolean }> = {
  portero: { posicion: 'Arquero' },
  'defensa central': { posicion: 'Central', needsReview: true },
  'lateral derecho': { posicion: 'Lateral derecho' },
  'lateral izquierdo': { posicion: 'Lateral izquierdo' },
  'carrilero derecho': { posicion: 'Carrilero derecho' },
  'carrilero izquierdo': { posicion: 'Carrilero izquierdo' },
  pivote: { posicion: 'Volante central' },
  mediocentro: { posicion: 'Volante central' },
  'mediocentro defensivo': { posicion: 'Volante central' },
  'interior derecho': { posicion: 'Medio centro derecho' },
  'interior izquierdo': { posicion: 'Medio centro izquierdo' },
  'mediocentro ofensivo': { posicion: 'Mediapunta' },
  'extremo derecho': { posicion: 'Extremo derecho' },
  'extremo izquierdo': { posicion: 'Extremo izquierdo' },
  'segundo delantero': { posicion: 'Segundo delantero' },
  'delantero centro': { posicion: 'Delantero centro' },
};

function mapTransfermarktPosicion(raw: string): { posicion: string; needsReview: boolean } {
  const mapped = TRANSFERMARKT_POSITION_MAP[normalizeHeader(raw)];
  if (!mapped) return { posicion: '', needsReview: true };
  return { posicion: mapped.posicion, needsReview: !!mapped.needsReview };
}

// Una tabla de plantel de Transfermarkt copiada/pegada directo a Excel no
// trae fila de encabezado, y cada jugador ocupa 2 filas (datos, posición) o
// 3 cuando el nombre no entra en la fila de datos (queda en la fila
// siguiente) — se ve al copiar filas con un escudo de club en la celda de
// procedencia. Se detecta esta forma por su ausencia de encabezados
// reconocibles (ver looksLikeTransfermarktPaste) y se reconstruye cada
// jugador recorriendo filas: columna A = dorsal marca el inicio de un
// jugador nuevo; columnas D–G (misma fila) traen nacimiento+edad,
// nacionalidad, altura y pie; el nombre está en la propia fila (columna B)
// salvo que la columna C venga vacía, en cuyo caso está en la fila
// siguiente; la fila después de eso trae la posición.
function looksLikeTransfermarktPaste(headers: string[]): boolean {
  if (headers.length < 5) return false;
  if (!/^\d{1,3}$/.test(headers[0].trim())) return false;
  return headers.some((h) => /\(\d+\)/.test(h));
}

function parseTransfermarktRows(aoa: string[][]): ImportedPlayerRow[] {
  const result: ImportedPlayerRow[] = [];
  let i = 0;
  while (i < aoa.length) {
    const row = aoa[i] || [];
    const dorsalRaw = (row[0] || '').trim();
    if (!/^\d+$/.test(dorsalRaw)) {
      i++;
      continue;
    }

    const dorsal = Number(dorsalRaw);
    const birthCell = row[3] || '';
    const nacionalidad = (row[4] || '').trim();
    const alturaCell = row[5] || '';
    const pieCell = row[6] || '';
    const hasNameInline = !!(row[2] || '').trim();

    i++;
    let nombre: string;
    if (hasNameInline) {
      nombre = (row[1] || '').trim();
    } else {
      const nameRow = aoa[i] || [];
      nombre = (nameRow[1] || '').trim();
      i++;
    }

    const posRow = aoa[i] || [];
    const posicionRaw = (posRow[1] || '').trim();
    i++;

    const edadMatch = birthCell.match(/\((\d+)\)/);
    const edad = edadMatch ? Number(edadMatch[1]) : null;
    const anioNacimiento = anioNacimientoDeCelda(birthCell);
    const categorias =
      anioNacimiento !== null
        ? categoriasPorAnioNacimiento(anioNacimiento)
        : edad !== null
          ? categoriasPorEdadAproximada(edad)
          : { sub21: false, sub19: false };
    const alturaMatch = alturaCell.match(/([\d]+(?:[,.]\d+)?)\s*m/i);
    const estatura = alturaMatch ? Number(alturaMatch[1].replace(',', '.')) : null;
    const posicionInfo = mapTransfermarktPosicion(posicionRaw);

    result.push({
      nombre,
      dorsal: Number.isNaN(dorsal) ? null : dorsal,
      posicion: posicionInfo.posicion,
      posicionOriginal: posicionRaw,
      posicionNecesitaRevision: posicionInfo.needsReview,
      edad,
      estatura,
      pie: mapPie(pieCell),
      sub21: categorias.sub21,
      sub19: categorias.sub19,
      extranjero: nacionalidad ? normalizeHeader(nacionalidad) !== PAIS_LOCAL : false,
    });
  }
  return result.filter((r) => r.nombre);
}

export interface ImportedPlayerRow {
  nombre: string;
  dorsal: number | null;
  posicion: string;
  posicionOriginal: string;
  posicionNecesitaRevision: boolean;
  edad: number | null;
  estatura: number | null;
  pie: PieHabil | null;
  sub21: boolean;
  sub19: boolean;
  extranjero: boolean | null;
}

export interface ParsePlayerImportResult {
  rows: ImportedPlayerRow[];
  columnasReconocidas: string[];
  columnasNoReconocidas: string[];
}

export function parsePlayerImportFile(buffer: Buffer): ParsePlayerImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (raw.length === 0) {
    return { rows: [], columnasReconocidas: [], columnasNoReconocidas: [] };
  }

  const headers = Object.keys(raw[0]);

  if (looksLikeTransfermarktPaste(headers)) {
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
    return { rows: parseTransfermarktRows(aoa), columnasReconocidas: [], columnasNoReconocidas: [] };
  }

  const col = {
    nombre: findColumn(headers, 'nombre'),
    posicion: findColumn(headers, 'posicion'),
    edad: findColumn(headers, 'edad'),
    pasaporte: findColumn(headers, 'pasaporte'),
    paisNacimiento: findColumn(headers, 'paisNacimiento'),
    pie: findColumn(headers, 'pie'),
    altura: findColumn(headers, 'altura'),
  };

  const columnasReconocidas = Object.values(col).filter((c): c is string => !!c);
  const columnasNoReconocidas = headers.filter((h) => !columnasReconocidas.includes(h));

  const rows: ImportedPlayerRow[] = raw
    .map((r) => {
      const nombre = (col.nombre ? r[col.nombre] : '').trim();
      const edadStr = col.edad ? r[col.edad] : '';
      const edad = edadStr && !Number.isNaN(Number(edadStr)) ? Number(edadStr) : null;
      const alturaStr = col.altura ? r[col.altura] : '';
      const alturaNum = alturaStr && !Number.isNaN(Number(alturaStr)) ? Number(alturaStr) : null;
      // Algunas filas traen "0" en vez de la celda vacía cuando no hay dato:
      // una estatura real nunca es 0, así que se trata igual que "sin dato".
      const estatura = alturaNum && alturaNum > 0 ? alturaNum / 100 : null;
      const posicionInfo = primeraPosicion(col.posicion ? r[col.posicion] : '');

      return {
        nombre,
        dorsal: null,
        posicion: posicionInfo.posicion,
        posicionOriginal: posicionInfo.original,
        posicionNecesitaRevision: posicionInfo.needsReview,
        edad,
        estatura,
        pie: mapPie(col.pie ? r[col.pie] : ''),
        ...(edad !== null ? categoriasPorEdadAproximada(edad) : { sub21: false, sub19: false }),
        extranjero: esExtranjero(col.pasaporte ? r[col.pasaporte] : '', col.paisNacimiento ? r[col.paisNacimiento] : '') ?? false,
      };
    })
    .filter((r) => r.nombre);

  return { rows, columnasReconocidas, columnasNoReconocidas };
}
