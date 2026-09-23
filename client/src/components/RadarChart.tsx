// Radar con escala independiente por eje (a diferencia de un radar chart
// "de librería" estándar, que asume una única escala compartida): cada
// métrica de la planilla LDP tiene un rango bien distinto (xG va de 0 a 2,
// Tiros de 0 a 20), así que un radar de escala única dejaría a la mitad de
// los ejes pegados al centro. Se dibuja a mano en SVG, igual que el resto
// de los diagramas de la app (ver TacticalDiagram.tsx), en vez de sumar una
// librería de gráficos que no soporta bien este caso.

export interface RadarSeriesInput {
  label: string;
  color: string;
  valores: number[]; // mismo orden que los ejes
}

// Redondea hacia arriba a un número "prolijo" × 10^n, para que los ticks no
// queden con decimales feos. Con pocos escalones (ej. el clásico 1/2/2.5/
// 5/10) un techo apenas arriba de una potencia de diez saltaba directo al
// doble (1.05 → 2): el equipo líder de la liga en esa métrica terminaba
// pintado a la mitad del eje en vez de cerca del borde, aunque el propio
// techo del eje SÍ fuera su valor real. Con más escalones, el peor caso
// pasa de +100% a +20%.
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const norm = max / base;
  const step = NICE_STEPS.find((s) => s >= norm - 1e-9) ?? 10;
  return step * base;
}

// Redondea hacia ABAJO a un número prolijo, para el otro extremo de un eje
// invertido (ver RadarChart): ahí el borde exterior no es 0 sino el mínimo
// real de la liga, y este valor tiene que quedar por debajo de ese mínimo
// (nunca por encima), o el mejor equipo real quedaría fuera del eje.
function niceMin(min: number): number {
  if (min <= 0) return 0;
  const exp = Math.floor(Math.log10(min));
  const base = Math.pow(10, exp);
  const norm = min / base;
  let step = NICE_STEPS[0];
  for (const s of NICE_STEPS) {
    if (s <= norm + 1e-9) step = s;
    else break;
  }
  return step * base;
}

function formatTick(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, '');
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const RINGS = 4;

export function RadarChart({
  ejeLabels,
  series,
  maxPorEje,
  minPorEje,
  invertido,
  size = 440,
}: {
  ejeLabels: string[];
  series: RadarSeriesInput[];
  // Techo real de cada eje (ej. el máximo de toda la liga en esa métrica),
  // en las unidades originales — el componente lo redondea a un número
  // prolijo para los ticks, no lo usa tal cual.
  maxPorEje: number[];
  // Solo se usa en los ejes invertidos (ver abajo): el mínimo real de la
  // liga en esa métrica, que ahí hace de borde exterior en vez de 0 — 0
  // faltas no es una referencia útil si ningún equipo real se acerca. En
  // los ejes normales el mínimo siempre es 0, este valor se ignora.
  minPorEje?: number[];
  // Ejes donde "menos es mejor" (ej. Faltas, Goles recibidos): se dibujan al
  // revés (el mínimo de la liga en el borde exterior, el máximo en el
  // centro) para que en TODO el radar "más área = mejor rendimiento", en
  // vez de que un pico grande a veces sea bueno (más goles) y a veces malo
  // (más fueras de juego). Mismo orden que ejeLabels; si se omite, ningún
  // eje se invierte.
  invertido?: boolean[];
  size?: number;
}) {
  const n = ejeLabels.length;
  if (n < 3) return <p className="text-sm text-slate-400">Elige al menos 3 métricas para dibujar un radar.</p>;

  const center = size / 2;
  const radius = size * 0.28;
  const angleFor = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const esInvertido = (i: number) => !!invertido?.[i];

  const axisMax = ejeLabels.map((_, i) => niceMax((maxPorEje[i] || 0) * 1.05 || 1));
  // Mínimo del eje: 0 en los normales; en los invertidos, el mínimo real de
  // la liga (con el mismo margen que el techo, para que el mejor equipo real
  // no quede pegado exactamente al borde) — nunca por encima del propio
  // techo, por si un eje invertido no tiene datos reales para calcular un
  // mínimo por debajo del máximo.
  const axisMin = ejeLabels.map((_, i) => {
    if (!esInvertido(i)) return 0;
    const m = niceMin((minPorEje?.[i] || 0) * 0.95);
    return Math.min(m, axisMax[i] * 0.9);
  });

  const pointFor = (i: number, value: number) => {
    const lo = axisMin[i];
    const hi = axisMax[i];
    const range = hi - lo;
    let frac = range > 0 ? Math.max(0, Math.min(1, (value - lo) / range)) : 0;
    if (esInvertido(i)) frac = 1 - frac;
    const r = frac * radius;
    const ang = angleFor(i);
    return { x: center + r * Math.cos(ang), y: center + r * Math.sin(ang) };
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {/* anillos de la grilla */}
      {Array.from({ length: RINGS }, (_, ringIdx) => {
        const frac = (ringIdx + 1) / RINGS;
        const pts = ejeLabels
          .map((_, i) => {
            const ang = angleFor(i);
            const r = frac * radius;
            return `${center + r * Math.cos(ang)},${center + r * Math.sin(ang)}`;
          })
          .join(' ');
        return <polygon key={ringIdx} points={pts} fill="none" stroke="#e2e8f0" strokeWidth={1} />;
      })}

      {/* ejes: línea, etiqueta, y valores de los ticks */}
      {ejeLabels.map((label, i) => {
        const ang = angleFor(i);
        const x2 = center + radius * Math.cos(ang);
        const y2 = center + radius * Math.sin(ang);
        const labelR = radius + size * 0.1;
        const lx = center + labelR * Math.cos(ang);
        const ly = center + labelR * Math.sin(ang);
        // Ancla el texto hacia el lado de donde "crece" en vez de centrarlo
        // siempre en el punto: una etiqueta larga a la izquierda (ej.
        // "Pases progresivos") centrada en su punto se corta contra el
        // borde del SVG, porque la mitad del texto queda apuntando hacia
        // afuera del dibujo. Ejes casi verticales (arriba/abajo) sí quedan
        // centrados, para no verse pegados de costado.
        const cos = Math.cos(ang);
        const textAnchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
        const inv = esInvertido(i);
        return (
          <g key={label}>
            <line x1={center} y1={center} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize={size * 0.026}
              fill="#334155"
              style={{ fontWeight: 600 }}
            >
              {label}
              {inv && (
                <tspan fill="#b45309">
                  {' '}
                  ▼
                </tspan>
              )}
            </text>
            {Array.from({ length: RINGS }, (_, ringIdx) => {
              const frac = (ringIdx + 1) / RINGS;
              // Invertido: el valor baja a medida que el punto se aleja del
              // centro (el mínimo de la liga en el borde, el máximo en el
              // centro), al revés que un eje normal — y arranca del mínimo
              // real de la liga, no de 0.
              const tickVal = inv ? axisMax[i] - frac * (axisMax[i] - axisMin[i]) : axisMax[i] * frac;
              const tx = center + frac * radius * Math.cos(ang);
              const ty = center + frac * radius * Math.sin(ang);
              return (
                <text
                  // Sin rotar: girado según el ángulo del eje (como estaba
                  // antes) un número de 2+ dígitos como "1.5" quedaba
                  // vertical en los ejes casi horizontales (ej. xG) y se
                  // leía como dos números sueltos en vez de uno.
                  key={ringIdx}
                  x={tx}
                  y={ty}
                  dx={4}
                  dy={-3}
                  fontSize={size * 0.019}
                  fill={inv ? '#b45309' : '#94a3b8'}
                >
                  {formatTick(tickVal)}
                </text>
              );
            })}
          </g>
        );
      })}

      {/* una serie por equipo (rival / propio / promedio) */}
      {series.map((s) => {
        const pts = ejeLabels.map((_, i) => pointFor(i, s.valores[i] ?? 0));
        const points = pts.map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={s.label}>
            <polygon points={points} fill={s.color} fillOpacity={0.22} stroke={s.color} strokeWidth={2.5} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function RadarLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {series.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 text-sm text-slate-700">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </div>
      ))}
    </div>
  );
}
