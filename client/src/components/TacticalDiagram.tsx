import type { ReactNode } from 'react';
import { ROLE_ORDER } from '../lib/csvGlossary';

// Diagramas tácticos generados a partir del patrón más repetido en un
// bloque del análisis CSV (p. ej. "Construccion 4+1" o "Presionan en
// 4-4-2"). Son una representación genérica del patrón de texto, no una
// reconstrucción exacta de una jugada real, pero mantienen el mismo
// lenguaje visual que el resto de la app (cancha verde, fichas azules) en
// vez del estilo del ejemplo de referencia.
//
// Cada diagrama define su propio recorte (viewW/viewH): uno solo para
// todos dejaba de lado mucho espacio verde vacío, porque una construcción
// o una presión de salida solo ocupan una franja de la cancha (el área
// propia o la rival), a diferencia del dibujo táctico completo que sí
// necesita el ancho completo para las líneas de un equipo entero.

const BLUE = '#2563eb';
const RIVAL_RED = '#dc2626';
const GK_AMBER = '#d97706';
const LINE = 'rgba(255,255,255,0.55)';

export interface Spot {
  x: number;
  y: number;
}

// Reparte "count" fichas en x, dentro de los márgenes [margin, 100-margin],
// a una altura y fijas. Todo en porcentaje del recorte (0-100), no del
// viewBox real.
export function evenlySpaced(count: number, y: number, margin: number): Spot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 50, y }];
  const usable = 100 - margin * 2;
  return Array.from({ length: count }, (_, i) => ({ x: margin + (usable * i) / (count - 1), y }));
}

export function Pitch({ viewW, viewH, children }: { viewW: number; viewH: number; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: 230,
        aspectRatio: `${viewW} / ${viewH}`,
        margin: '0 auto',
        background: 'linear-gradient(#1f7a3d, #1a6b35)',
        borderRadius: 8,
      }}
    >
      {children}
    </svg>
  );
}

export function Token({
  x,
  y,
  viewW,
  viewH,
  label,
  rival = false,
  gk = false,
}: {
  x: number;
  y: number;
  viewW: number;
  viewH: number;
  label?: string;
  rival?: boolean;
  gk?: boolean;
}) {
  const cx = (x / 100) * viewW;
  const cy = (y / 100) * viewH;
  const fill = gk ? GK_AMBER : rival ? RIVAL_RED : BLUE;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={4.4} fill={fill} stroke="white" strokeWidth={0.5} />
      {label && (
        <text textAnchor="middle" dy={1.3} fontSize={3.8} fontWeight={700} fill="white">
          {label}
        </text>
      )}
    </g>
  );
}

export function BoxOutline({
  x,
  y,
  width,
  height,
  viewW,
  viewH,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewW: number;
  viewH: number;
}) {
  return (
    <rect
      x={(x / 100) * viewW}
      y={(y / 100) * viewH}
      width={(width / 100) * viewW}
      height={(height / 100) * viewH}
      fill="none"
      stroke={LINE}
      strokeWidth={0.5}
    />
  );
}

// Flecha de A a B para marcar un desplazamiento o desmarque. "dashed" para
// un movimiento sin balón (desmarque); sólida para una conducción con
// balón. "curve" desplaza el punto medio para dibujar una trayectoria
// curva en vez de una línea recta.
export function MoveArrow({
  from,
  to,
  viewW,
  viewH,
  dashed = false,
  curve = 0,
  fromRadius = 0,
  toRadius = 0,
}: {
  from: Spot;
  to: Spot;
  viewW: number;
  viewH: number;
  dashed?: boolean;
  curve?: number;
  // Radio (en unidades del viewBox) de la ficha/balón del que sale la
  // flecha, para que arranque tocando su borde en vez de nacer en el centro.
  fromRadius?: number;
  // Mismo recorte pero en el destino, para que la punta de la flecha quede
  // justo tocando el borde de la ficha de llegada en vez de dentro de ella.
  toRadius?: number;
}) {
  const x1raw = (from.x / 100) * viewW;
  const y1raw = (from.y / 100) * viewH;
  const x2raw = (to.x / 100) * viewW;
  const y2raw = (to.y / 100) * viewH;
  const mx = (x1raw + x2raw) / 2 + curve;
  const my = (y1raw + y2raw) / 2;
  // La flecha sale tangente hacia el punto de control si es curva, o
  // directo al destino si es recta; se recorta esa misma distancia desde el
  // origen para que el trazo arranque en el borde de la ficha/balón.
  const initialTargetX = curve !== 0 ? mx : x2raw;
  const initialTargetY = curve !== 0 ? my : y2raw;
  const dx0 = initialTargetX - x1raw;
  const dy0 = initialTargetY - y1raw;
  const dist0 = Math.hypot(dx0, dy0) || 1;
  const x1 = x1raw + (dx0 / dist0) * fromRadius;
  const y1 = y1raw + (dy0 / dist0) * fromRadius;
  // Mismo recorte en el destino: se acerca al origen (o al punto de control
  // si es curva) para que la flecha termine en el borde de la ficha, no en
  // su centro.
  const finalSourceX = curve !== 0 ? mx : x1raw;
  const finalSourceY = curve !== 0 ? my : y1raw;
  const dx1 = x2raw - finalSourceX;
  const dy1 = y2raw - finalSourceY;
  const dist1 = Math.hypot(dx1, dy1) || 1;
  const x2 = x2raw - (dx1 / dist1) * toRadius;
  const y2 = y2raw - (dy1 / dist1) * toRadius;
  const angle = curve !== 0 ? Math.atan2(y2 - my, x2 - mx) : Math.atan2(y2 - y1, x2 - x1);
  const headLen = 2.4;
  const spread = 0.4;
  const hx1 = x2 - headLen * Math.cos(angle - spread);
  const hy1 = y2 - headLen * Math.sin(angle - spread);
  const hx2 = x2 - headLen * Math.cos(angle + spread);
  const hy2 = y2 - headLen * Math.sin(angle + spread);
  const path = curve !== 0 ? `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}` : `M ${x1} ${y1} L ${x2} ${y2}`;
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="white"
        strokeWidth={0.6}
        strokeOpacity={0.9}
        strokeDasharray={dashed ? '1.6 1.4' : undefined}
      />
      <polygon points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`} fill="white" fillOpacity={0.9} />
    </g>
  );
}

// Zona sombreada (espacio libre, hueco que deja un jugador, etc.).
export function Zone({
  x,
  y,
  width,
  height,
  viewW,
  viewH,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewW: number;
  viewH: number;
}) {
  return (
    <rect
      x={(x / 100) * viewW}
      y={(y / 100) * viewH}
      width={(width / 100) * viewW}
      height={(height / 100) * viewH}
      fill="rgba(255,255,255,0.16)"
      stroke="rgba(255,255,255,0.7)"
      strokeDasharray="1.4 1.2"
      strokeWidth={0.5}
    />
  );
}

// Flecha corta que sale desde justo arriba de una ficha apuntando hacia el
// área (más arriba en el recorte), para marcar que ese jugador presiona
// hacia ahí.
function PressArrow({ x, y, viewW, viewH }: { x: number; y: number; viewW: number; viewH: number }) {
  const cx = (x / 100) * viewW;
  const cy = (y / 100) * viewH;
  const tailY = cy - 5.2;
  const tipY = tailY - 6.5;
  return (
    <g>
      <line x1={cx} y1={tailY} x2={cx} y2={tipY + 1.6} stroke="white" strokeWidth={0.7} strokeOpacity={0.9} />
      <polygon points={`${cx - 1.6},${tipY + 2.4} ${cx + 1.6},${tipY + 2.4} ${cx},${tipY}`} fill="white" fillOpacity={0.9} />
    </g>
  );
}

// "Construccion 4+1" -> 4 defensas + 1 jugador en la segunda línea de
// salida. "Linea de 3 con lateral" -> línea de 3 sin segunda línea
// definida.
function parseBuildUpShape(valor: string): { defensas: number; segundaLinea: number } | null {
  const plus = valor.match(/(\d+)\s*\+\s*(\d+)/);
  if (plus) return { defensas: Number(plus[1]), segundaLinea: Number(plus[2]) };
  const linea = valor.match(/l[ií]nea de (\d+)/i);
  if (linea) return { defensas: Number(linea[1]), segundaLinea: 0 };
  return null;
}

// Recorte de la salida en campo propio: el área propia abajo (el equipo
// construye desde ahí), la línea de medio campo apenas insinuada arriba
// para dar noción de hacia dónde progresa la jugada.
export function BuildUpShapeDiagram({ valor }: { valor: string }) {
  const shape = parseBuildUpShape(valor);
  if (!shape) return null;

  const viewW = 64;
  const viewH = 50;
  const boxWidth = 58;
  const boxHeight = 26;
  const boxX = (100 - boxWidth) / 2;
  const boxY = 100 - boxHeight;

  const backY = 78;
  const segundaY = 34;
  const halfwayY = 16;

  const back = evenlySpaced(shape.defensas, backY, 14);
  const segunda = evenlySpaced(shape.segundaLinea, segundaY, 34);

  return (
    <Pitch viewW={viewW} viewH={viewH}>
      <line
        x1={(2 / 100) * viewW}
        y1={(halfwayY / 100) * viewH}
        x2={(98 / 100) * viewW}
        y2={(halfwayY / 100) * viewH}
        stroke={LINE}
        strokeWidth={0.5}
      />
      <circle
        cx={(50 / 100) * viewW}
        cy={(halfwayY / 100) * viewH}
        r={(20 / 100) * viewH}
        fill="none"
        stroke={LINE}
        strokeWidth={0.5}
      />
      <BoxOutline x={boxX} y={boxY} width={boxWidth} height={boxHeight} viewW={viewW} viewH={viewH} />
      {back.map((t, i) => (
        <Token key={`b${i}`} x={t.x} y={t.y} viewW={viewW} viewH={viewH} />
      ))}
      {segunda.map((t, i) => (
        <Token key={`s${i}`} x={t.x} y={t.y} viewW={viewW} viewH={viewH} />
      ))}
      {segunda.length > 0 && (
        <text x={(50 / 100) * viewW} y={((segundaY - 16) / 100) * viewH} textAnchor="middle" fontSize={5}>
          ⚽
        </text>
      )}
    </Pitch>
  );
}

// "Presionan en 4-4-2" -> líneas de 4, 4 y 2 jugadores, de la más cercana
// al arco propio a la más cercana al arco rival.
function parseFormationLines(valor: string): number[] | null {
  const m = valor.match(/(\d(?:-\d){1,4})/);
  if (!m) return null;
  const nums = m[1].split('-').map(Number);
  if (nums.some((n) => Number.isNaN(n) || n <= 0)) return null;
  return nums;
}

// Cuánto separar la línea de más adelante: los delanteros van cerrados,
// como delanteros (no abiertos como extremos); el resto de las líneas usan
// el ancho de la cancha.
function frontLineMargin(count: number): number {
  if (count <= 1) return 15;
  if (count === 2) return 32;
  if (count === 3) return 20;
  return 14;
}

// Una línea intermedia de 2 (ej. el doble pivote de un 4-2-3-1) es un doble
// pivote, no una línea de fondo: debe quedar al ancho de los centrales, no
// estirada a los costados como si fueran laterales.
function middleLineMargin(count: number): number {
  return count === 2 ? 38 : 14;
}

export function FormationLinesDiagram({ valor }: { valor: string }) {
  const lines = parseFormationLines(valor);
  if (!lines) return null;
  const viewW = 68;
  const viewH = 74;
  const n = lines.length;

  return (
    <Pitch viewW={viewW} viewH={viewH}>
      <line
        x1={(2 / 100) * viewW}
        y1={(50 / 100) * viewH}
        x2={(98 / 100) * viewW}
        y2={(50 / 100) * viewH}
        stroke={LINE}
        strokeWidth={0.5}
      />
      <circle cx={(50 / 100) * viewW} cy={(50 / 100) * viewH} r={(16 / 100) * viewH} fill="none" stroke={LINE} strokeWidth={0.5} />
      {lines.map((count, li) => {
        const y = 88 - (li * (88 - 12)) / (n - 1 || 1);
        const isFront = li === n - 1;
        const margin = isFront ? frontLineMargin(count) : middleLineMargin(count);
        return evenlySpaced(count, y, margin).map((t, i) => (
          <Token key={`${li}-${i}`} x={t.x} y={t.y} viewW={viewW} viewH={viewH} />
        ));
      })}
    </Pitch>
  );
}

// "Presiona 9" -> el centrodelantero presiona solo. "Presiona 9-10" -> el
// centrodelantero y el mediapunta presionan juntos. "Presiona 7-9-11" -> los
// tres delanteros presionan juntos.
function parsePressingNumbers(tag: string): number[] | null {
  const m = tag.match(/^Presiona\s+([\d\-,\s]+)$/i);
  if (!m) return null;
  const nums = m[1]
    .split(/[-,\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n) && ROLE_ORDER.includes(n));
  return nums.length >= 1 ? nums : null;
}

// Recorte hacia el área rival: los jugadores que gatillan la presión, a la
// misma altura, unos metros fuera del área, con flechas que marcan que van
// a presionar hacia ahí.
export function PressingTriggerDiagram({ tag }: { tag: string }) {
  const numeros = parsePressingNumbers(tag);
  if (!numeros) return null;
  const ordenados = [...numeros].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));

  const viewW = 60;
  const viewH = 42;
  const boxWidth = 56;
  const boxHeight = 30;
  const boxX = (100 - boxWidth) / 2;
  const pressY = 46;
  const margin = ordenados.length <= 2 ? 28 : 16;
  const tokens = evenlySpaced(ordenados.length, pressY, margin);

  return (
    <Pitch viewW={viewW} viewH={viewH}>
      <BoxOutline x={boxX} y={0} width={boxWidth} height={boxHeight} viewW={viewW} viewH={viewH} />
      {tokens.map((t, i) => (
        <PressArrow key={`a${i}`} x={t.x} y={t.y} viewW={viewW} viewH={viewH} />
      ))}
      {tokens.map((t, i) => (
        <Token key={`t${i}`} x={t.x} y={t.y} viewW={viewW} viewH={viewH} label={String(ordenados[i])} />
      ))}
    </Pitch>
  );
}
