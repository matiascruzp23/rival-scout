import type { BalonParadoData, CornerBP, Player, ZonaCorner } from '../types';
import { CornerZonesPitch } from './CornerZonesPitch';
import {
  ZONAS_CORNER,
  filtrarCorners,
  nombreZona,
  pateadoresFrecuentes,
  pct,
  piesPateadores,
  resumenPorPateador,
  type PiePateador,
  tendenciasPerfilZona,
  type Tendencia,
} from '../lib/balonParado';
import { todosLosCorners } from '../lib/balonParado';

function ListaTendencias({ titulo, items }: { titulo: string; items: Tendencia[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{titulo}</div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos.</p>
      ) : (
        <ol className="space-y-0.5">
          {items.map((t, i) => (
            <li key={t.texto} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-800">
                <span className="text-emerald-700 font-semibold mr-1.5">{i + 1}.</span>
                {t.texto}
                {t.detalle && <span className="text-slate-500 text-xs ml-1.5">· {t.detalle}</span>}
              </span>
              <span className="text-slate-500 whitespace-nowrap">
                {t.n} <span className="text-[11px]">({t.p}%)</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Las 2 tendencias perfil + zona y los 2 pateadores más frecuentes de los
// córners recibidos. Con un pateador ya filtrado se omite esa lista.
export function TendenciasCorners({
  corners,
  ocultarPateadores,
  pies,
}: {
  corners: CornerBP[];
  ocultarPateadores?: boolean;
  pies?: Map<string, PiePateador>;
}) {
  return (
    <div className={`grid gap-3 ${ocultarPateadores ? 'grid-cols-1' : 'grid-cols-2'}`}>
      <ListaTendencias titulo="Tendencias más repetidas" items={tendenciasPerfilZona(corners)} />
      {!ocultarPateadores && <ListaTendencias titulo="Pateadores más frecuentes" items={pateadoresFrecuentes(corners, 2, pies)} />}
    </div>
  );
}

function CeldaPie({ pie }: { pie: PiePateador | undefined }) {
  if (!pie?.pie) return <span className="text-slate-300">–</span>;
  return (
    <span title={pie.discrepa}>
      <span className={pie.discrepa ? 'text-amber-700 font-medium' : ''}>
        {pie.pie}
        {pie.discrepa ? ' ⚠' : ''}
      </span>{' '}
      <span className="text-slate-400 text-[11px]">({pie.detalle})</span>
    </span>
  );
}

// Tabla por pateador: lado, perfil y reparto por zona de destino. Si se pasa
// onSelect, las filas son clickeables (filtran el campograma).
export function CornersPorPateadorTable({
  corners,
  seleccionado,
  onSelect,
  pies,
}: {
  corners: CornerBP[];
  pies?: Map<string, PiePateador>;
  seleccionado?: string;
  onSelect?: (pateador: string) => void;
}) {
  const filas = resumenPorPateador(corners);
  const total = resumenPorPateador(corners.map((c) => ({ ...c, pateador: 'Total' })))[0];
  if (!total) return null;

  const celdaZona = (n: number, base: number, destacada: boolean) =>
    n === 0 ? (
      <span className="text-slate-300">–</span>
    ) : (
      <span className={destacada ? 'font-semibold text-emerald-800' : ''}>
        {n} <span className="text-slate-400 text-[11px]">({pct(n, base)}%)</span>
      </span>
    );

  const fila = (f: typeof total, esTotal: boolean) => {
    const activa = !esTotal && seleccionado === f.pateador;
    const clickeable = !!onSelect && !esTotal && f.pateador !== 'Sin pateador';
    return (
      <tr
        key={f.pateador}
        onClick={clickeable ? () => onSelect!(activa ? '' : f.pateador) : undefined}
        className={`${clickeable ? 'cursor-pointer hover:bg-slate-50' : ''} ${activa ? 'bg-emerald-50' : ''} ${
          esTotal ? 'font-semibold border-t-2 border-slate-200' : ''
        }`}
      >
        <td className="whitespace-nowrap">{f.pateador}</td>
        {pies && (
          <td className="whitespace-nowrap">{esTotal ? '' : <CeldaPie pie={pies.get(f.pateador)} />}</td>
        )}
        <td className="text-center">{f.total}</td>
        <td className="text-center">{f.izquierda || <span className="text-slate-300">–</span>}</td>
        <td className="text-center">{f.derecha || <span className="text-slate-300">–</span>}</td>
        <td className="text-center">{f.abierto || <span className="text-slate-300">–</span>}</td>
        <td className="text-center">{f.cerrado || <span className="text-slate-300">–</span>}</td>
        {ZONAS_CORNER.map((z) => (
          <td key={z.codigo} className="text-center whitespace-nowrap">
            {celdaZona(f.zonas.conteo[z.codigo], f.zonas.total, f.zonaFrecuente === z.codigo)}
          </td>
        ))}
        <td className="whitespace-nowrap">
          {f.zonaFrecuente ? `${nombreZona(f.zonaFrecuente as ZonaCorner)} (${pct(f.zonas.conteo[f.zonaFrecuente], f.zonas.total)}%)` : '–'}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Pateador</th>
            {pies && <th className="text-left">Pie</th>}
            <th>Córners</th>
            <th>Izq.</th>
            <th>Der.</th>
            <th>Abierto</th>
            <th>Cerrado</th>
            {ZONAS_CORNER.map((z) => (
              <th key={z.codigo} title={z.nombre}>
                {z.nombre}
              </th>
            ))}
            <th className="text-left">Más frecuente</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => fila(f, false))}
          {filas.length > 1 && fila(total, true)}
        </tbody>
      </table>
    </div>
  );
}

// Bloque del Informe: total, por lado, por pateador y la tabla.
export function BalonParadoInforme({
  data,
  rivalNombre,
  players,
}: {
  data: BalonParadoData | null | undefined;
  rivalNombre?: string;
  players: Player[];
}) {
  const corners = todosLosCorners(data);
  if (corners.length === 0) return null;
  const pies = piesPateadores(corners, players);
  const partidos = (data?.archivos ?? []).map((a) => a.partido);
  const izq = filtrarCorners(corners, { lado: 'Izquierda' });
  const der = filtrarCorners(corners, { lado: 'Derecha' });
  const pateadores = resumenPorPateador(corners).filter((f) => f.pateador !== 'Sin pateador');

  return (
    <>
      <section className="informe-section informe-page card p-4 mb-6">
        <h3 className="font-semibold text-slate-800 mb-1">
          Balón parado · Córners a favor{rivalNombre ? ` · ${rivalNombre}` : ''}
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          {corners.length} córners en {partidos.length} partido{partidos.length === 1 ? '' : 's'}: {partidos.join(' · ')}
        </p>
        <div className="mb-4">
          <TendenciasCorners corners={corners} pies={pies} />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <CornerZonesPitch corners={corners} lado="" titulo="Total" subtitulo={`${corners.length} córners`} />
          <CornerZonesPitch corners={izq} lado="Izquierda" titulo="Desde la izquierda" subtitulo={`${izq.length} córners`} />
          <CornerZonesPitch corners={der} lado="Derecha" titulo="Desde la derecha" subtitulo={`${der.length} córners`} />
        </div>
        <CornersPorPateadorTable corners={corners} pies={pies} />
      </section>
      {pateadores.length > 0 && (
        <section className="informe-section informe-page card p-4 mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">
            Balón parado · Córners por pateador{rivalNombre ? ` · ${rivalNombre}` : ''}
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {pateadores.map((f) => {
              const delPateador = filtrarCorners(corners, { pateador: f.pateador });
              return (
                <div key={f.pateador} className="informe-section">
                  <div className="flex items-baseline justify-between border-b border-slate-200 pb-1 mb-2">
                    <span className="font-semibold text-slate-800">
                      {f.pateador}
                      {pies.get(f.pateador)?.pie && (
                        <span className="font-normal text-slate-500 text-sm ml-1.5">
                          · {pies.get(f.pateador)!.pie}{' '}
                          <span className="text-[11px] text-slate-400">({pies.get(f.pateador)!.detalle})</span>
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {f.total} córners · {f.abierto} ab. / {f.cerrado} ce.
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(['Izquierda', 'Derecha'] as const).map((lado) => {
                      const cs = filtrarCorners(delPateador, { lado });
                      return (
                        <CornerZonesPitch
                          key={lado}
                          corners={cs}
                          lado={lado}
                          titulo={lado}
                          subtitulo={`${cs.length} córner${cs.length === 1 ? '' : 's'}`}
                          sinPie
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
