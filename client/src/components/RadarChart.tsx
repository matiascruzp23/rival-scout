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

// Redondea hacia arriba a un número "prolijo" (1/2/2.5/5/10 × 10^n), igual
// criterio que usan las librerías de gráficos para elegir los ticks de un
// eje.
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const norm = max / base;
  let niceNorm: number;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 2.5) niceNorm = 2.5;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * base;
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
  size = 440,
}: {
  ejeLabels: string[];
  series: RadarSeriesInput[];
  // Techo real de cada eje (ej. el máximo de toda la liga en esa métrica),
  // en las unidades originales — el componente lo redondea a un número
  // prolijo para los ticks, no lo usa tal cual.
  maxPorEje: number[];
  size?: number;
}) {
  const n = ejeLabels.length;
  if (n < 3) return <p className="text-sm text-slate-400">Elegí al menos 3 métricas para dibujar un radar.</p>;

  const center = size / 2;
  const radius = size * 0.28;
  const angleFor = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  const axisMax = ejeLabels.map((_, i) => niceMax((maxPorEje[i] || 0) * 1.05 || 1));

  const pointFor = (i: number, value: number) => {
    const frac = axisMax[i] > 0 ? Math.max(0, Math.min(1, value / axisMax[i])) : 0;
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
            </text>
            {Array.from({ length: RINGS }, (_, ringIdx) => {
              const frac = (ringIdx + 1) / RINGS;
              const tickVal = axisMax[i] * frac;
              const tx = center + frac * radius * Math.cos(ang);
              const ty = center + frac * radius * Math.sin(ang);
              return (
                <text
                  key={ringIdx}
                  x={tx}
                  y={ty}
                  dx={4}
                  dy={-3}
                  fontSize={size * 0.019}
                  fill="#94a3b8"
                  transform={`rotate(${(ang * 180) / Math.PI + 90}, ${tx}, ${ty})`}
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
