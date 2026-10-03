import type { Player } from '../types';
import { positionDef } from './positions';
import { boxesForSystem } from './plantelLayout';
import { shortName } from './lookup';

// Exporta el plantel a una presentación .pptx, que Keynote abre de forma
// nativa (el formato .key es cerrado y no se puede generar desde el
// navegador). Todo queda como texto y formas editables, no como imagen.

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pptx['addSlide']>;
type TextRun = { text: string; options?: Record<string, unknown> };

// Diapositiva 16:9 en pulgadas.
const W = 13.333;
const H = 7.5;
const MARGIN = 0.4;

// Mismos colores de la app (paleta de Tailwind, sin '#').
const C = {
  slate800: '1E293B',
  slate500: '64748B',
  slate400: '94A3B8',
  slate200: 'E2E8F0',
  slate50: 'F8FAFC',
  emerald700: '047857',
  red700: 'B91C1C',
  purple700: '7E22CE',
  sky700: '0369A1',
  yellow700: 'A16207',
  indigo700: '4338CA',
};

const LEGEND: [string, string][] = [
  ['EXTRANJERO', C.sky700],
  ['SUB21', C.emerald700],
  ['SUB19', C.yellow700],
  ['BAJAS', C.red700],
  ['DUDAS', C.purple700],
  ['SELECCIÓN', C.indigo700],
];

function categoryColor(p: Player): string {
  if (p.baja) return C.red700;
  if (p.duda) return C.purple700;
  if (p.extranjero) return C.sky700;
  if (p.sub21) return C.emerald700;
  if (p.sub19) return C.yellow700;
  return C.slate800;
}

// Fondo suave de la fila según la categoría (bg-*-50 de la app).
function categoryFill(p: Player): string {
  if (p.baja) return 'FEF2F2';
  if (p.duda) return 'FAF5FF';
  if (p.extranjero) return 'F0F9FF';
  if (p.sub21) return 'ECFDF5';
  if (p.sub19) return 'FEFCE8';
  return 'FFFFFF';
}

function pieAbbr(p: Player): string {
  if (p.pie === 'Derecho') return 'D.';
  if (p.pie === 'Izquierdo') return 'I.';
  if (p.pie === 'Ambidiestro') return 'A.';
  return '';
}

function addTitle(slide: Slide, title: string, subtitle: string) {
  slide.addText(title, {
    x: MARGIN, y: 0.25, w: W - 2 * MARGIN, h: 0.5,
    fontSize: 24, bold: true, color: C.slate800, fontFace: 'Helvetica Neue', margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN, y: 0.72, w: W - 2 * MARGIN, h: 0.3,
      fontSize: 12, color: C.slate500, fontFace: 'Helvetica Neue', margin: 0,
    });
  }
}

function addLegend(slide: Slide) {
  const runs: TextRun[] = LEGEND.map(([label, color], i) => ({
    text: i < LEGEND.length - 1 ? `${label}      ` : label,
    options: { color, bold: true },
  }));
  slide.addText(runs, {
    x: MARGIN, y: H - 0.5, w: W - 2 * MARGIN, h: 0.3,
    fontSize: 10, align: 'center', fontFace: 'Helvetica Neue', margin: 0,
  });
}

// Contenido de la celda de un jugador: toda su información en una sola fila.
function playerCell(p: Player, fontSize: number): TextRun[] {
  const extra = [p.estatura ? `${p.estatura.toFixed(2)}m` : '', pieAbbr(p)].filter(Boolean).join(' · ');
  const runs: TextRun[] = [];
  if (p.dorsal !== null) runs.push({ text: `${p.dorsal}  `, options: { color: C.slate400, bold: true } });
  runs.push({ text: shortName(p.nombre), options: { color: categoryColor(p), bold: true } });
  if (p.enSeleccion) runs.push({ text: ' (SEL)', options: { color: C.indigo700, bold: true, fontSize: fontSize - 2 } });
  if (extra) runs.push({ text: `   ${extra}`, options: { color: C.slate400, fontSize: fontSize - 1 } });
  return runs;
}

function addPlantelSlide(pptx: Pptx, rivalNombre: string, players: Player[], sistema: string, alternativo: boolean) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addTitle(
    slide,
    `Plantel ${rivalNombre}`,
    sistema ? `Sistema ${alternativo ? 'alternativo' : 'predilecto'}: ${sistema}` : '',
  );

  const posicionActiva = (p: Player) => (alternativo ? p.posicionAlternativa || p.posicion : p.posicion);
  const boxes = boxesForSystem(sistema);
  const byPosition = new Map<string, Player[]>();
  for (const p of players) {
    const def = positionDef(posicionActiva(p));
    const key = def ? def.label : posicionActiva(p) || '';
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key)!.push(p);
  }
  for (const list of byPosition.values()) list.sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));
  const classified = new Set(boxes.map((b) => b.label));
  const sinClasificar = players.filter((p) => {
    const def = positionDef(posicionActiva(p));
    return !def || !classified.has(def.label);
  });

  const rows = Array.from(new Set(boxes.map((b) => b.row))).sort((a, b) => a - b);
  const top = 1.15;
  const bottom = H - 0.6 - (sinClasificar.length > 0 ? 0.55 : 0);
  const gap = 0.12;
  const colW = (W - 2 * MARGIN - 4 * gap) / 5;
  const headerH = 0.26;

  // Alto de cada fila proporcional a su caja más cargada, para que una línea
  // con 5 jugadores en una posición no aplaste al resto.
  const rowLoad = rows.map((row) =>
    Math.max(0, ...boxes.filter((b) => b.row === row).map((b) => (byPosition.get(b.label) || []).length)),
  );
  const totalLoad = rowLoad.reduce((a, b) => a + b, 0);
  const available = bottom - top - gap * (rows.length - 1);
  const lineH = Math.min(0.3, (available - headerH * rows.length) / totalLoad);
  const fontSize = Math.max(7, Math.min(11, Math.floor(lineH * 37)));

  // Cada posición es una tabla de una sola columna: una fila de encabezado
  // (posición + cantidad) y una fila por jugador.
  let y = top;
  rows.forEach((row, ri) => {
    const rowH = headerH + rowLoad[ri] * lineH;
    for (const box of boxes.filter((b) => b.row === row)) {
      const x = MARGIN + (box.col - 1) * (colW + gap);
      const list = byPosition.get(box.label) || [];
      const tableRows = [
        [
          {
            text: [
              { text: box.label.toUpperCase(), options: { color: C.slate500 } },
              { text: `  ${list.length}`, options: { color: C.slate400 } },
            ],
            options: { bold: true, fontSize: 8, fill: { color: C.slate50 } },
          },
        ],
        ...list.map((p) => [{ text: playerCell(p, fontSize), options: { fill: { color: categoryFill(p) } } }]),
      ];
      slide.addTable(tableRows, {
        x, y, w: colW, colW: [colW],
        rowH: [headerH, ...list.map(() => lineH)],
        fontSize, fontFace: 'Helvetica Neue', valign: 'middle', margin: [0, 5, 0, 5],
        border: { type: 'solid', pt: 0.75, color: C.slate200 },
      });
    }
    y += rowH + gap;
  });

  if (sinClasificar.length > 0) {
    const runs: TextRun[] = [{ text: 'Sin posición reconocida:  ', options: { color: C.slate500, bold: true } }];
    sinClasificar.forEach((p, i) => {
      runs.push({ text: shortName(p.nombre), options: { color: categoryColor(p), bold: true } });
      runs.push({ text: ` (${p.posicion || 'sin posición'})${i < sinClasificar.length - 1 ? '   ' : ''}`, options: { color: C.slate400 } });
    });
    slide.addText(runs, {
      x: MARGIN, y: H - 1.1, w: W - 2 * MARGIN, h: 0.45, fontSize: 9, valign: 'middle', margin: 0, fontFace: 'Helvetica Neue',
    });
  }

  addLegend(slide);
}

export async function exportPlantelKeynote({
  rivalNombre,
  players,
  sistemaPrincipal = '',
  sistemaAlternativo = '',
}: {
  rivalNombre: string;
  players: Player[];
  sistemaPrincipal?: string;
  sistemaAlternativo?: string;
}) {
  // Import dinámico: la librería pesa y solo se usa al exportar.
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `Plantel ${rivalNombre}`;

  addPlantelSlide(pptx, rivalNombre, players, sistemaPrincipal, false);
  if (sistemaPrincipal && sistemaAlternativo) addPlantelSlide(pptx, rivalNombre, players, sistemaAlternativo, true);

  const safeName = rivalNombre.replace(/[\\/:*?"<>|]/g, '').trim() || 'rival';
  await pptx.writeFile({ fileName: `Plantel ${safeName}.pptx` });
}
