import type { CornerBP, LadoCorner, ZonaCorner } from '../types';
import { distribucionZonas, nombreZona, pct } from '../lib/balonParado';

// Medio campo de ataque visto desde la cancha hacia el arco rival (arco
// arriba), en metros: ancho 68, línea de fondo en y = FONDO. Las zonas están
// definidas para un córner desde la IZQUIERDA (1er palo a la izquierda); para
// la derecha se espejan, así "1er palo" queda siempre del lado del balón.
const W = 68;
const FONDO = 3;
const ALTO = 31;

const AREA = { x: (W - 40.32) / 2, w: 40.32, h: 16.5 };
const CHICA = { x: (W - 18.32) / 2, w: 18.32, h: 5.5 };
const ARCO = { x: (W - 7.32) / 2, w: 7.32 };
const PENAL_Y = FONDO + 11;

const ZONAS_IZQ: Record<ZonaCorner, { x: number; y: number; w: number; h: number }> = {
  C: { x: 2.6, y: 5.4, w: 9.6, h: 9 },
  '1P': { x: 14.5, y: 3.6, w: 11.6, h: 7 },
  ACH: { x: 26.9, y: 3.6, w: 14.2, h: 7 },
  '2P': { x: 41.9, y: 3.6, w: 11.6, h: 7 },
  PP: { x: 22, y: 11.4, w: 24, h: 6.5 },
  R: { x: 20, y: 19, w: 28, h: 8.6 },
};

function rectZona(zona: ZonaCorner, lado: LadoCorner | '') {
  const r = ZONAS_IZQ[zona];
  return lado === 'Derecha' ? { ...r, x: W - r.x - r.w } : r;
}

export function CornerZonesPitch({
  corners,
  lado,
  titulo,
  subtitulo,
  sinPie,
}: {
  corners: CornerBP[];
  // Vista por lado (dibuja el balón en ese córner). '' = total: izquierda y
  // derecha sumados, dibujados como si fueran desde la izquierda.
  lado: LadoCorner | '';
  titulo?: string;
  subtitulo?: string;
  // Oculta la línea de resumen bajo la cancha (vistas chicas del Informe).
  sinPie?: boolean;
}) {
  const { conteo, total } = distribucionZonas(corners);
  // Abiertos/cerrados por zona y en total (se muestran mientras haya los dos
  // perfiles en la vista; con el filtro de perfil activo sería redundante).
  const perfilZona = (z: ZonaCorner, p: 'Abierto' | 'Cerrado') => corners.filter((c) => c.zona === z && c.perfil === p).length;
  const abiertos = corners.filter((c) => c.perfil === 'Abierto').length;
  const cerrados = corners.filter((c) => c.perfil === 'Cerrado').length;
  const mostrarPerfil = abiertos > 0 && cerrados > 0;
  const max = Math.max(1, ...Object.values(conteo));
  const arcDx = Math.sqrt(9.15 ** 2 - (FONDO + AREA.h - PENAL_Y) ** 2);
  const balonX = lado === 'Derecha' ? W - 1.1 : 1.1;

  return (
    <figure className="m-0">
      {(titulo || subtitulo) && (
        <figcaption className="flex items-baseline justify-between gap-2 mb-1.5">
          {titulo && <span className="font-semibold text-slate-800 text-sm">{titulo}</span>}
          {subtitulo && <span className="text-xs text-slate-500 text-right">{subtitulo}</span>}
        </figcaption>
      )}
      <svg
        viewBox={`-1 0 ${W + 2} ${ALTO + 1}`}
        style={{ width: '100%', height: 'auto', display: 'block', background: 'linear-gradient(#1f7a3d, #1a6b35)', borderRadius: 8 }}
        role="img"
        aria-label={titulo ?? 'Zonas de destino de córners'}
      >
        <g stroke="#ffffff" strokeOpacity={0.55} fill="none" strokeWidth={0.3}>
          <rect x={0} y={FONDO} width={W} height={ALTO - FONDO} />
          <rect x={AREA.x} y={FONDO} width={AREA.w} height={AREA.h} />
          <rect x={CHICA.x} y={FONDO} width={CHICA.w} height={CHICA.h} />
          <path
            d={`M ${W / 2 - arcDx},${FONDO + AREA.h} A 9.15,9.15 0 0 0 ${W / 2 + arcDx},${FONDO + AREA.h}`}
          />
          <path d={`M 0,${FONDO + 1} A 1,1 0 0 0 1,${FONDO}`} />
          <path d={`M ${W - 1},${FONDO} A 1,1 0 0 0 ${W},${FONDO + 1}`} />
        </g>
        <rect x={ARCO.x} y={FONDO - 1.6} width={ARCO.w} height={1.6} fill="#ffffff" fillOpacity={0.85} />
        <circle cx={W / 2} cy={PENAL_Y} r={0.25} fill="#ffffff" fillOpacity={0.55} />

        {(Object.keys(ZONAS_IZQ) as ZonaCorner[]).map((z) => {
          const r = rectZona(z, lado);
          const n = conteo[z];
          const p = pct(n, total);
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          return (
            <g key={z}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={0.4}
                fill="#fcd34d"
                fillOpacity={n > 0 ? 0.15 + 0.6 * (n / max) : 0.04}
                stroke="#fef3c7"
                strokeOpacity={0.9}
                strokeWidth={0.22}
                strokeDasharray="0.8 0.5"
              />
              <text
                x={cx}
                y={cy - (mostrarPerfil ? 1.6 : 0.7)}
                textAnchor="middle"
                fontSize={1.45}
                fontWeight={700}
                fill="#ffffff"
                stroke="#14532d"
                strokeWidth={0.35}
                paintOrder="stroke"
                style={{ textTransform: 'uppercase', letterSpacing: 0.05 }}
              >
                {nombreZona(z)}
              </text>
              <text
                x={cx}
                y={cy + (mostrarPerfil ? 1.1 : 2)}
                textAnchor="middle"
                fontSize={2.3}
                fontWeight={700}
                fill="#ffffff"
                stroke="#14532d"
                strokeWidth={0.4}
                paintOrder="stroke"
              >
                {n} · {p}%
              </text>
              {mostrarPerfil && n > 0 && (
                <text
                  x={cx}
                  y={cy + 2.9}
                  textAnchor="middle"
                  fontSize={1.25}
                  fontWeight={600}
                  fill="#ffffff"
                  stroke="#14532d"
                  strokeWidth={0.3}
                  paintOrder="stroke"
                >
                  {perfilZona(z, 'Abierto')} ab. · {perfilZona(z, 'Cerrado')} ce.
                </text>
              )}
            </g>
          );
        })}

        {lado && (
          <g transform={`translate(${balonX} ${FONDO + 0.1})`}>
            <circle r={1.15} fill="#ffffff" stroke="#0f172a" strokeWidth={0.18} />
            <path
              d="M 0,-0.5 L 0.48,-0.15 L 0.3,0.4 L -0.3,0.4 L -0.48,-0.15 Z"
              fill="#0f172a"
            />
          </g>
        )}
      </svg>
      {!sinPie && <p className="text-[11px] text-slate-400 mt-1">
        {total} córner{total === 1 ? '' : 's'} con zona ·{' '}
        {lado ? `desde la ${lado.toLowerCase()}` : 'izquierda y derecha sumados (1er palo = palo cercano)'}
        {(abiertos > 0 || cerrados > 0) && (
          <>
            {' · '}
            <span className="text-slate-600 font-medium">
              {abiertos} abierto{abiertos === 1 ? '' : 's'} / {cerrados} cerrado{cerrados === 1 ? '' : 's'}
            </span>
          </>
        )}
      </p>}
    </figure>
  );
}
