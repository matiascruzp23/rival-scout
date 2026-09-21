import type { ReactNode } from 'react';
import { BoxOutline, MoveArrow, Token, Zone, type Spot } from './TacticalDiagram';
import { formationSlots } from '../lib/formations';
import { positionDef } from '../lib/positions';

// Un diagrama por cada "situación" de circulación o de presión que registra
// el analista en Sportscode (ver csvGlossary.ts para las glosas en texto).
// Cancha horizontal, arco propio a la derecha (se ataca hacia la
// izquierda) — igual que los ejemplos de referencia del analista. Cada
// escena se dibuja SIEMPRE sobre el equipo propio completo (11 fichas con
// numeración genérica de camiseta), para que la acción puntual (una
// flecha, un rival libre) se lea comparada con el resto del equipo, en vez
// de quedar suelta en una cancha vacía y ser ambigua.
//
// Ficha azul = jugador del rival analizado (dueño del informe). Ficha roja
// = jugador del equipo contrario en esa jugada puntual. Flecha punteada =
// desplazamiento sin balón (desmarque); sólida = acción con balón o
// carrera de presión activa.

const VIEW_W = 140;
const VIEW_H = 90;
const LINE = 'rgba(255,255,255,0.55)';

// Numeración genérica de camiseta (no son dorsales reales, ver
// csvGlossary.ts ROLE_NAMES), en formación 4-4-2. Posiciones calcadas del
// ejemplo del analista: 1 arquero, 2/7 lado derecho (arriba), 4/11 lado
// izquierdo (abajo), 3/5 centrales, 6/8 volantes, 9/10 delanteros.
const POS: Record<string, Spot> = {
  '1': { x: 94, y: 48 },
  '2': { x: 68, y: 10 },
  '3': { x: 69, y: 36 },
  '5': { x: 69, y: 64 },
  '4': { x: 68, y: 93 },
  '7': { x: 44, y: 10 },
  '6': { x: 46, y: 37 },
  '8': { x: 46, y: 60 },
  '11': { x: 42, y: 93 },
  '9': { x: 20, y: 64 },
  '10': { x: 20, y: 32 },
};

function shift(num: string, dx: number, dy: number): Spot {
  const p = POS[num];
  return { x: p.x + dx, y: p.y + dy };
}

// Cada escena guarda sus "move"/"link" apuntando directo a los objetos
// POS[n] (no a una copia), así que un mismo objeto Spot identifica siempre
// al mismo número: sirve para, al dibujar, redirigir esas mismas flechas a
// dónde quedó ese número si el fondo se recalculó para otro sistema (ver
// formationOverridesFor). Los que arrancan de shift(...) generan un objeto
// nuevo cada vez y no calzan acá, así que se quedan en su posición relativa
// al 4-4-2 genérico — una imprecisión menor y aceptable.
const POS_TO_NUM = new Map<Spot, string>(Object.entries(POS).map(([num, spot]) => [spot, num]));

function resolveSpot(spot: Spot, overrides: Record<string, Spot>): Spot {
  const num = POS_TO_NUM.get(spot);
  return num && overrides[num] ? overrides[num] : spot;
}

// Las 4 posiciones de la línea de fondo (arquero aparte) son las mismas
// para cualquier sistema con línea de 4, así que se dejan fijas en vez de
// recalcularlas: solo el mediocampo/ataque (números 6 a 11) cambia según el
// sistema.
const BACK_FOUR_LABELS = ['Lateral derecho', 'Central derecho', 'Central izquierdo', 'Lateral izquierdo'];

// Convierte una coordenada de lib/positions.ts (cancha vertical, y chico =
// arco rival) a esta cancha horizontal (x chico = arco rival, arco propio a
// la derecha): x pasa a ser la profundidad (antes y) y la banda pasa a ser
// y (antes x, invertido porque acá y chico es el lado derecho).
function toLandscapeSpot(def: { x: number; y: number }): Spot {
  return { x: def.y, y: 100 - def.x };
}

// Recalcula dónde va cada número del 6 al 11 (arco y línea de 4 se quedan
// fijos) según el sistema que más juega el rival, para que la base sobre la
// que se dibuja la situación puntual se parezca a su formación real y no
// siempre a un 4-4-2 genérico. Se apoya en las mismas coordenadas que usa el
// campograma (lib/positions.ts) para que el orden de profundidad y de banda
// sea consistente con el resto de la app. Si el sistema no tiene línea de 4
// clásica (3 o 5 en el fondo) no hay un mapeo razonable a 1-11, así que no
// se toca nada y queda el 4-4-2 genérico de siempre.
function formationOverridesFor(sistema: string | null | undefined): Record<string, Spot> {
  const overrides: Record<string, Spot> = {};
  if (!sistema) return overrides;
  const template = formationSlots(sistema);
  if (!template) return overrides;
  if (template.filter((l) => BACK_FOUR_LABELS.includes(l)).length !== 4) return overrides;

  const resto = template.filter((label) => label !== 'Arquero' && !BACK_FOUR_LABELS.includes(label));
  const conCoords = resto
    .map((label) => positionDef(label))
    .filter((def): def is NonNullable<ReturnType<typeof positionDef>> => !!def);
  if (conCoords.length !== 6) return overrides;

  const spots = conCoords.map(toLandscapeSpot);
  const bySide = [...spots].sort((a, b) => a.y - b.y); // y chico = lado derecho
  const wideRight = bySide[0];
  const wideLeft = bySide[bySide.length - 1];
  const restantes = bySide.slice(1, -1);

  const byDepth = [...restantes].sort((a, b) => a.x - b.x); // x chico = más adelantado
  const delanteros = byDepth.slice(0, 2).sort((a, b) => a.y - b.y);
  const retrasados = byDepth.slice(2).sort((a, b) => a.y - b.y);

  overrides['7'] = wideRight;
  overrides['11'] = wideLeft;
  if (delanteros[0]) overrides['9'] = delanteros[0];
  if (delanteros[1]) overrides['10'] = delanteros[1];
  if (retrasados[0]) overrides['6'] = retrasados[0];
  if (retrasados[1]) overrides['8'] = retrasados[1];

  return overrides;
}

function LandscapePitch({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{
        display: 'block',
        width: '100%',
        aspectRatio: `${VIEW_W} / ${VIEW_H}`,
        background: 'linear-gradient(100deg, #1a6b35, #1f7a3d)',
        borderRadius: 8,
      }}
    >
      <g stroke={LINE} strokeWidth={0.4} fill="none">
        <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} />
        <line x1={VIEW_W / 2} y1={1} x2={VIEW_W / 2} y2={VIEW_H - 1} />
        <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={11} />
        <rect x={VIEW_W - 22} y={VIEW_H * 0.22} width={22} height={VIEW_H * 0.56} />
        <rect x={VIEW_W - 7} y={VIEW_H * 0.36} width={7} height={VIEW_H * 0.28} />
        <rect x={1} y={VIEW_H * 0.22} width={22} height={VIEW_H * 0.56} />
        <rect x={1} y={VIEW_H * 0.36} width={7} height={VIEW_H * 0.28} />
      </g>
      {children}
    </svg>
  );
}

// Igual que Pitch (TacticalDiagram.tsx) pero sin su maxWidth de 230px: ese
// tope está pensado para los diagramas cuadrados/chicos (ej. el recorte de
// presión), pero acá se quiere que ocupe todo el ancho disponible de la
// tarjeta, como el resto de los diagramas de esta pantalla.
function WideCloseUpPitch({ viewW, viewH, children }: { viewW: number; viewH: number; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      style={{
        display: 'block',
        width: '100%',
        aspectRatio: `${viewW} / ${viewH}`,
        background: 'linear-gradient(#1f7a3d, #1a6b35)',
        borderRadius: 8,
      }}
    >
      {children}
    </svg>
  );
}

function OwnTeamBackdrop({ overrides }: { overrides?: Record<string, Spot> }) {
  return (
    <>
      {Object.entries(POS).map(([num, p]) => {
        const pos = overrides?.[num] ?? p;
        return <Token key={num} x={pos.x} y={pos.y} viewW={VIEW_W} viewH={VIEW_H} label={num} gk={num === '1'} />;
      })}
    </>
  );
}

// Marca a cada jugador propio (menos el arquero) con un rival justo
// delante, para representar un esquema de marca hombre a hombre en toda la
// cancha (no un duelo aislado en un sector).
function manMarkAll(): SceneElement[] {
  return Object.entries(POS)
    .filter(([num]) => num !== '1')
    .map(([, p]) => ({ kind: 'rival', x: p.x - 8, y: p.y }));
}

// Radios (en unidades del viewBox) de la ficha de jugador (ver Token en
// TacticalDiagram.tsx) y del ícono de balón, para que las flechas arranquen
// tocando el borde de lo que efectivamente se mueve, no desde su centro.
const PLAYER_RADIUS = 4.4;
const BALL_RADIUS = 2.8;

type SceneElement =
  | { kind: 'line'; x: number }
  | { kind: 'zone'; x: number; y: number; w: number; h: number }
  | { kind: 'rival'; x: number; y: number; label?: string }
  // "fromBall": la flecha representa el viaje del balón (un pase/centro) y
  // "from" coincide con un elemento 'ball' de la misma escena, así que
  // arranca tocando el balón en vez de la ficha del jugador que lo tenía.
  | { kind: 'move'; from: Spot; to: Spot; dashed?: boolean; curve?: number; fromBall?: boolean }
  | { kind: 'link'; a: Spot; b: Spot }
  | { kind: 'ball'; x: number; y: number }
  | { kind: 'override'; num: string; x: number; y: number };

function renderElement(el: SceneElement, key: number, overrides: Record<string, Spot>): ReactNode {
  switch (el.kind) {
    case 'line':
      return (
        <line
          key={key}
          x1={(el.x / 100) * VIEW_W}
          y1={(4 / 100) * VIEW_H}
          x2={(el.x / 100) * VIEW_W}
          y2={(96 / 100) * VIEW_H}
          stroke={LINE}
          strokeWidth={0.45}
          strokeDasharray="1.6 1.4"
        />
      );
    case 'zone':
      return <Zone key={key} x={el.x} y={el.y} width={el.w} height={el.h} viewW={VIEW_W} viewH={VIEW_H} />;
    case 'rival':
      return <Token key={key} x={el.x} y={el.y} viewW={VIEW_W} viewH={VIEW_H} label={el.label} rival />;
    case 'move': {
      const from = resolveSpot(el.from, overrides);
      const to = resolveSpot(el.to, overrides);
      return (
        <MoveArrow
          key={key}
          from={from}
          to={to}
          viewW={VIEW_W}
          viewH={VIEW_H}
          dashed={el.dashed}
          curve={el.curve}
          fromRadius={el.fromBall ? BALL_RADIUS : PLAYER_RADIUS}
          toRadius={PLAYER_RADIUS}
        />
      );
    }
    case 'link': {
      const a = resolveSpot(el.a, overrides);
      const b = resolveSpot(el.b, overrides);
      return (
        <line
          key={key}
          x1={(a.x / 100) * VIEW_W}
          y1={(a.y / 100) * VIEW_H}
          x2={(b.x / 100) * VIEW_W}
          y2={(b.y / 100) * VIEW_H}
          stroke="white"
          strokeOpacity={0.7}
          strokeWidth={0.5}
        />
      );
    }
    case 'ball':
      return (
        <text key={key} x={(el.x / 100) * VIEW_W} y={(el.y / 100) * VIEW_H} textAnchor="middle" fontSize={5.2}>
          ⚽
        </text>
      );
    default:
      return null;
  }
}

// --- Escenas -------------------------------------------------------------
// Todas parten del 4-4-2 propio (POS). "move" usa POS[n] como origen, así
// el jugador que se mueve es siempre uno de los que ya se ve en la cancha,
// no una ficha suelta sin relación con el resto del equipo.

const SITUATION_SCENES: Record<string, SceneElement[]> = {
  // --- Situaciones de circulación ---
  'Conduccion del central': [
    { kind: 'ball', x: shift('3', -4, -4).x, y: shift('3', -4, -4).y },
    { kind: 'move', from: POS['3'], to: { x: 45, y: 30 }, dashed: false },
  ],
  '3er hombre': [
    { kind: 'move', from: POS['3'], to: POS['6'], dashed: false },
    { kind: 'move', from: POS['6'], to: { x: 14, y: 28 }, dashed: false },
  ],
  'Laterales altos': [
    { kind: 'move', from: POS['2'], to: { x: 40, y: 10 }, dashed: true },
    { kind: 'move', from: POS['4'], to: { x: 40, y: 93 }, dashed: true },
  ],
  'Wing interno': [{ kind: 'move', from: POS['11'], to: { x: 30, y: 70 }, dashed: true }],
  'Cambios de frente': [
    { kind: 'ball', x: shift('2', -3, 2).x, y: shift('2', -3, 2).y },
    { kind: 'move', from: shift('2', -3, 2), to: POS['11'], dashed: false, curve: -20, fromBall: true },
  ],
  'Descenso de 9': [{ kind: 'move', from: POS['9'], to: { x: 35, y: 50 }, dashed: true }],
  'Descenso de wing': [{ kind: 'move', from: POS['7'], to: { x: 55, y: 25 }, dashed: true }],
  'Juego directo': [
    { kind: 'ball', x: shift('1', -5, 0).x, y: shift('1', -5, 0).y },
    { kind: 'move', from: shift('1', -5, 0), to: POS['9'], dashed: false, fromBall: true },
  ],
  Asociaciones: [
    { kind: 'ball', x: shift('6', -3, -2).x, y: shift('6', -3, -2).y },
    { kind: 'move', from: shift('6', -3, -2), to: POS['8'], dashed: false, fromBall: true },
  ],
  'Pase entre lineas': [
    { kind: 'ball', x: shift('6', -3, 0).x, y: shift('6', -3, 0).y },
    { kind: 'line', x: 34 },
    { kind: 'move', from: shift('6', -3, 0), to: shift('10', 0, -3), dashed: false, fromBall: true },
  ],
  'Delantero cae a banda': [{ kind: 'move', from: POS['9'], to: { x: 30, y: 85 }, dashed: true }],
  'Pasaje del lateral': [
    { kind: 'ball', x: shift('6', -3, -2).x, y: shift('6', -3, -2).y },
    { kind: 'move', from: POS['2'], to: { x: 45, y: 10 }, dashed: true },
  ],
  'Llegada de 2da linea': [{ kind: 'move', from: POS['6'], to: { x: 28, y: 58 }, dashed: true }],
  'Movimiento profundo': [
    { kind: 'line', x: 30 },
    { kind: 'move', from: POS['9'], to: { x: 8, y: 58 }, dashed: true },
  ],
  // Mediapunta (10) en un 4-2-3-1: sale del centro y va a la banda; el
  // lateral que arma por ese costado tiene el balón.
  'Movimiento de interno a externo': [
    { kind: 'override', num: '6', x: 58, y: 37 },
    { kind: 'override', num: '8', x: 58, y: 64 },
    { kind: 'override', num: '7', x: 42, y: 10 },
    { kind: 'override', num: '11', x: 37, y: 93 },
    { kind: 'override', num: '10', x: 50, y: 55 },
    { kind: 'override', num: '9', x: 28, y: 50 },
    { kind: 'ball', x: shift('4', 2, -6).x, y: shift('4', 2, -6).y },
    { kind: 'move', from: { x: 50, y: 55 }, to: { x: 50, y: 88 }, dashed: true },
  ],
  'Gana espalda': [
    { kind: 'line', x: 26 },
    { kind: 'move', from: POS['10'], to: { x: 6, y: 30 }, dashed: true },
  ],
  'Lateral por dentro': [{ kind: 'move', from: POS['2'], to: { x: 50, y: 45 }, dashed: true }],
  'Central se hace lateral': [{ kind: 'move', from: POS['3'], to: { x: 50, y: 14 }, dashed: true }],
  'Triangulo en banda': [
    { kind: 'link', a: POS['2'], b: POS['7'] },
    { kind: 'link', a: POS['7'], b: POS['6'] },
    { kind: 'link', a: POS['6'], b: POS['2'] },
  ],
  'Intercambio de posiciones': [
    { kind: 'move', from: POS['6'], to: shift('8', 0, -3), dashed: true, curve: 6 },
    { kind: 'move', from: POS['8'], to: shift('6', 0, 3), dashed: true, curve: -6 },
  ],
  'Sup. numerica en 2do palo': [
    { kind: 'rival', x: shift('1', -2, 0).x, y: shift('1', -2, 0).y },
    { kind: 'move', from: POS['9'], to: shift('1', -12, -6), dashed: true },
    { kind: 'move', from: POS['10'], to: shift('1', -12, 6), dashed: true },
  ],
  'Centro 3/4': [
    { kind: 'ball', x: shift('7', -3, 2).x, y: shift('7', -3, 2).y },
    { kind: 'move', from: shift('7', -3, 2), to: { x: 14, y: 40 }, dashed: false, curve: -10, fromBall: true },
  ],
  'Volante a banda': [{ kind: 'move', from: POS['6'], to: { x: 50, y: 15 }, dashed: true }],
  'Mediapunta en cuadrado': [
    { kind: 'zone', x: 38, y: 28, w: 20, h: 34 },
    { kind: 'move', from: POS['10'], to: { x: 46, y: 45 }, dashed: true },
  ],

  // --- Situaciones de presión (vulnerabilidades) ---
  'Libre cuadrado': [{ kind: 'rival', x: 50, y: 50 }],
  'Persiguen movimiento': [
    { kind: 'rival', x: 28, y: 78 },
    { kind: 'move', from: { x: 28, y: 78 }, to: { x: 40, y: 52 }, dashed: true },
    { kind: 'move', from: POS['6'], to: { x: 55, y: 48 }, dashed: true },
  ],
  'Salta 7': [
    { kind: 'rival', x: shift('7', -14, 4).x, y: shift('7', -14, 4).y },
    { kind: 'ball', x: shift('7', -18, 4).x, y: shift('7', -18, 4).y },
    { kind: 'move', from: POS['7'], to: shift('7', -14, 4), dashed: false },
  ],
  'Salta 11': [
    { kind: 'rival', x: shift('11', -14, -4).x, y: shift('11', -14, -4).y },
    { kind: 'ball', x: shift('11', -18, -4).x, y: shift('11', -18, -4).y },
    { kind: 'move', from: POS['11'], to: shift('11', -14, -4), dashed: false },
  ],
  'Salta 10': [
    { kind: 'rival', x: shift('10', -14, 0).x, y: shift('10', -14, 0).y },
    { kind: 'ball', x: shift('10', -18, 0).x, y: shift('10', -18, 0).y },
    { kind: 'move', from: POS['10'], to: shift('10', -14, 0), dashed: false },
  ],
  'Salta interno': [
    { kind: 'rival', x: shift('8', -16, -6).x, y: shift('8', -16, -6).y },
    { kind: 'ball', x: shift('8', -20, -6).x, y: shift('8', -20, -6).y },
    { kind: 'move', from: POS['8'], to: shift('8', -16, -6), dashed: false },
  ],
  'Orienta 9': [
    { kind: 'rival', x: shift('9', -6, -16).x, y: shift('9', -6, -16).y },
    { kind: 'move', from: POS['9'], to: shift('9', -2, -14), dashed: false, curve: 8 },
    { kind: 'line', x: 34 },
  ],
  'Presion al arquero': [
    { kind: 'rival', x: shift('9', -14, 0).x, y: shift('9', -14, 0).y },
    { kind: 'move', from: POS['9'], to: shift('9', -14, 0), dashed: false },
  ],
  'Presion a linea de 3': [
    { kind: 'rival', x: 8, y: 30 },
    { kind: 'rival', x: 8, y: 48 },
    { kind: 'rival', x: 8, y: 66 },
    { kind: 'move', from: POS['9'], to: { x: 12, y: 58 }, dashed: false },
    { kind: 'move', from: POS['10'], to: { x: 12, y: 38 }, dashed: false },
  ],
  'Central sigue descenso': [
    { kind: 'rival', x: shift('3', -22, 6).x, y: shift('3', -22, 6).y },
    { kind: 'move', from: shift('3', -22, 6), to: shift('3', -6, 6), dashed: true },
    { kind: 'move', from: POS['3'], to: shift('3', -6, 6), dashed: true },
    { kind: 'zone', x: shift('3', 2, -14).x, y: shift('3', 2, -14).y, w: 16, h: 12 },
  ],
  'Lateral sigue descenso': [
    { kind: 'rival', x: shift('2', -18, 8).x, y: shift('2', -18, 8).y },
    { kind: 'move', from: shift('2', -18, 8), to: shift('2', -6, 14), dashed: true },
    { kind: 'move', from: POS['2'], to: shift('2', -6, 14), dashed: true },
    { kind: 'zone', x: shift('2', 2, -12).x, y: shift('2', 2, -12).y, w: 14, h: 10 },
  ],
  // El bloque se carga hacia el lado del balón (6 y 8 se cierran junto al
  // 7), el 11 queda en su lugar del otro lado, aislado, con un rival libre.
  'Libre lado opuesto': [
    { kind: 'override', num: '6', x: 56, y: 19 },
    { kind: 'override', num: '8', x: 56, y: 38 },
    { kind: 'rival', x: 26, y: 10 },
    { kind: 'ball', x: 33, y: 10 },
    { kind: 'zone', x: 34, y: 48, w: 22, h: 30 },
    { kind: 'rival', x: 44, y: 62 },
  ],
  'Pierde espalda': [
    { kind: 'zone', x: shift('3', 2, -18).x, y: shift('3', 2, -18).y, w: 16, h: 14 },
    { kind: 'rival', x: shift('3', 2, -18).x + 8, y: shift('3', 2, -18).y + 7 },
  ],
  // El lateral (4) queda en duelo 1v1 con el rival que tiene enfrente,
  // mientras un segundo rival rompe en diagonal al espacio que deja a su
  // espalda (misma zona punteada que en "Pierde espalda", para el mismo
  // concepto de espacio libre).
  'Espalda de lateral': [
    { kind: 'rival', x: shift('4', -9, 0).x, y: shift('4', -9, 0).y },
    { kind: 'zone', x: shift('4', 4, -20).x, y: shift('4', 4, -20).y, w: 16, h: 20 },
    { kind: 'move', from: shift('4', -16, -22), to: shift('4', 10, -8), dashed: true },
    { kind: 'rival', x: shift('4', 10, -8).x, y: shift('4', 10, -8).y },
  ],
  'Cierran lineas de pase': [
    { kind: 'rival', x: shift('9', -8, 0).x, y: shift('9', -8, 0).y },
    { kind: 'ball', x: shift('9', -12, 0).x, y: shift('9', -12, 0).y },
    { kind: 'rival', x: shift('9', -20, -16).x, y: shift('9', -20, -16).y },
    { kind: 'rival', x: shift('9', -20, 16).x, y: shift('9', -20, 16).y },
    { kind: 'link', a: shift('9', -8, 0), b: shift('9', -20, -16) },
    { kind: 'link', a: shift('9', -8, 0), b: shift('9', -20, 16) },
  ],
  // Dos líneas de 4 (defensa y volantes) con el hueco entre ellas: un rival
  // con balón delante de los volantes y otro libre en el espacio,
  // conectados con una flecha que apunta hacia el arco propio.
  'Espacio entre lineas': [
    { kind: 'zone', x: 53, y: 22, w: 11, h: 62 },
    { kind: 'rival', x: 30, y: 50 },
    { kind: 'ball', x: 35, y: 50 },
    { kind: 'move', from: { x: 35, y: 50 }, to: { x: 58, y: 50 }, dashed: false, fromBall: true },
    { kind: 'rival', x: 58, y: 50 },
  ],
  'Wing forma linea de 5': [
    // El lateral queda apenas más cerrado (posición fija, sin flecha) para
    // que se note el espacio por fuera al que desciende el wing.
    { kind: 'override', num: '4', x: 62, y: 86 },
    { kind: 'move', from: POS['11'], to: shift('4', 0, -3), dashed: true },
  ],
  'Espalda de la defensa': [
    { kind: 'line', x: 56 },
    { kind: 'rival', x: 46, y: 48 },
  ],
  'Central a banda': [{ kind: 'move', from: POS['5'], to: { x: 50, y: 75 }, dashed: true }],
  'Mano a mano': manMarkAll(),
  'Lateral con lateral': [
    { kind: 'rival', x: shift('2', -16, 6).x, y: shift('2', -16, 6).y },
    { kind: 'move', from: POS['2'], to: shift('2', -16, 6), dashed: false },
  ],
  'Volante forma linea de 5': [{ kind: 'move', from: POS['8'], to: shift('3', 0, 4), dashed: true }],
  'Wing op cierra con vc': [
    { kind: 'move', from: POS['7'], to: shift('6', 4, -4), dashed: true },
    { kind: 'zone', x: 52, y: 2, w: 20, h: 16 },
    { kind: 'rival', x: 60, y: 8 },
  ],
};

// "No emparejan en area": a diferencia del resto (que se dibujan sobre la
// cancha completa), este es un recorte cercano del área propia, en vertical
// (arco abajo) para aprovechar mejor el ancho de la tarjeta ya que solo
// muestra un tercio de cancha. El lateral izquierdo queda afuera del área en
// un 1v1 con el que centra; los otros 3 defensores marcan a 2 de los 3
// rivales dentro del área, y el tercero queda libre, remarcado con el mismo
// cuadro punteado que se usa en el resto de los diagramas para señalar un
// espacio.
function NoEmparejanEnAreaDiagram(): ReactNode {
  const viewW = 100;
  const viewH = 78;
  const boxWidth = 56;
  const boxHeight = 34;
  const boxX = (100 - boxWidth) / 2;
  const boxY = 100 - boxHeight;

  return (
    <WideCloseUpPitch viewW={viewW} viewH={viewH}>
      <BoxOutline x={boxX} y={boxY} width={boxWidth} height={boxHeight} viewW={viewW} viewH={viewH} />

      {/* Lateral izquierdo, 1v1 por fuera con el jugador que va a centrar */}
      <Token x={10} y={50} viewW={viewW} viewH={viewH} label="4" />
      <Token x={16} y={42} viewW={viewW} viewH={viewH} rival />

      {/* Los otros 3 defensores dentro del área */}
      <Token x={32} y={82} viewW={viewW} viewH={viewH} label="3" />
      <Token x={48} y={88} viewW={viewW} viewH={viewH} label="5" />
      <Token x={62} y={80} viewW={viewW} viewH={viewH} label="2" />

      {/* 2 rivales marcados de cerca por esos defensores */}
      <Token x={28} y={76} viewW={viewW} viewH={viewH} rival />
      <Token x={46} y={80} viewW={viewW} viewH={viewH} rival />

      {/* El 3ro queda libre: nadie lo sigue */}
      <Zone x={58} y={56} width={20} height={20} viewW={viewW} viewH={viewH} />
      <Token x={68} y={66} viewW={viewW} viewH={viewH} rival />
    </WideCloseUpPitch>
  );
}

export function situationDiagramFor(tag: string, sistema?: string | null): ReactNode | null {
  const trimmed = tag.trim();
  if (trimmed === 'No emparejan en area') return <NoEmparejanEnAreaDiagram />;
  const scene = SITUATION_SCENES[trimmed];
  if (!scene) return null;
  // La forma del sistema real es la base; los overrides propios de la
  // escena (pensados para ilustrar ESE concepto puntual) van encima y
  // ganan si tocan el mismo número.
  const overrides: Record<string, Spot> = { ...formationOverridesFor(sistema) };
  for (const el of scene) {
    if (el.kind === 'override') overrides[el.num] = { x: el.x, y: el.y };
  }
  return (
    <LandscapePitch>
      <OwnTeamBackdrop overrides={overrides} />
      {scene.filter((el) => el.kind !== 'override').map((el, i) => renderElement(el, i, overrides))}
    </LandscapePitch>
  );
}
