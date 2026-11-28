import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { RivalContext } from "./RivalLayout";
import type { BalonParadoData, LadoCorner, PerfilCorner } from "../types";
import { api } from "../api";
import { useIsViewer } from "../lib/authContext";
import { CornerZonesPitch } from "../components/CornerZonesPitch";
import {
  BalonParadoInforme,
  CornersPorPateadorTable,
  TendenciasCorners,
} from "../components/BalonParado";
import {
  cornersIncompletos,
  extraerCorners,
  filtrarCorners,
  minuto,
  nombreZona,
  pateadores as listaPateadores,
  piesPateadores,
  todosLosCorners,
} from "../lib/balonParado";

function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={`px-3 py-1.5 text-sm border-l first:border-l-0 border-slate-200 ${
            valor === o.valor
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function BalonParadoPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const isViewer = useIsViewer();
  const fileRef = useRef<HTMLInputElement>(null);

  // Estado local: si guardar falla (p. ej. falta la migración de la columna
  // balon_parado), lo cargado se sigue viendo, con el aviso.
  const [data, setData] = useState<BalonParadoData | null>(
    rival.balonParado ?? null,
  );
  useEffect(() => setData(rival.balonParado ?? null), [rival.balonParado]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lado, setLado] = useState<LadoCorner | "">("");
  const [perfil, setPerfil] = useState<PerfilCorner | "">("");
  const [pateador, setPateador] = useState("");

  const corners = useMemo(() => todosLosCorners(data), [data]);
  const incompletos = useMemo(() => cornersIncompletos(corners), [corners]);
  // Pie de cada pateador con todos sus córners (no solo los del filtro).
  const pies = useMemo(() => piesPateadores(corners, rival.players), [corners, rival.players]);
  const listaPat = useMemo(() => listaPateadores(corners), [corners]);
  const filtrados = useMemo(
    () => filtrarCorners(corners, { lado, perfil, pateador }),
    [corners, lado, perfil, pateador],
  );

  async function guardar(next: BalonParadoData) {
    setData(next);
    setSaving(true);
    setSaveError("");
    try {
      await api.rivals.update(rival.id, {
        balonParado: next.archivos.length ? next : null,
      });
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const nuevos = await Promise.all(
      [...files].map(async (f) => extraerCorners(await f.text(), f.name)),
    );
    // Un CSV del mismo partido (mismo Timeline) reemplaza al anterior.
    const porPartido = new Map(
      (data?.archivos ?? []).map((a) => [a.partido, a]),
    );
    for (const a of nuevos) porPartido.set(a.partido, a);
    const archivos = [...porPartido.values()].sort((a, b) =>
      a.partido.localeCompare(b.partido, "es", { numeric: true }),
    );
    if (fileRef.current) fileRef.current.value = "";
    await guardar({ archivos });
  }

  function quitar(partido: string) {
    if (!confirm(`¿Quitar los córners de "${partido}"?`)) return;
    guardar({
      archivos: (data?.archivos ?? []).filter((a) => a.partido !== partido),
    });
  }

  // PDF con solo el bloque de balón parado del Informe: se imprime el
  // contenido .print-only (el resto de la página es .no-print). El <title>
  // es el nombre sugerido del archivo al guardar como PDF.
  function descargarPdf() {
    const previo = document.title;
    document.title = `Balón parado ${rival.nombre}`;
    const restaurar = () => {
      document.title = previo;
      window.removeEventListener("afterprint", restaurar);
    };
    window.addEventListener("afterprint", restaurar);
    window.print();
  }

  const tituloVista =
    [
      pateador ? (pies.get(pateador)?.pie ? `${pateador} (${pies.get(pateador)!.pie!.toLowerCase()})` : pateador) : null,
      lado ? `desde la ${lado.toLowerCase()}` : null,
      perfil ? perfil.toLowerCase() : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Total";

  return (
    <>
      <div className="print-only">
        <BalonParadoInforme data={data} rivalNombre={rival.nombre} players={rival.players} />
      </div>
      <div className="space-y-6 no-print">
        {incompletos.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">
              {incompletos.length} córner{incompletos.length === 1 ? "" : "s"}{" "}
              con datos incompletos: agregar en Sportscode y volver a cargar el
              CSV.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {incompletos.map(({ corner, faltan }, i) => (
                <li key={i}>
                  {corner.partido} · {minuto(corner.inicio)}
                  {corner.pateador ? ` · ${corner.pateador}` : ""}: falta{" "}
                  {faltan.join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        {corners.length === 0 ? (
          <p className="text-sm text-slate-400">
            Todavía no hay córners cargados (se cargan al final de la página).
          </p>
        ) : (
          <>
            <section className="card p-4">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Segmentado
                  valor={lado}
                  onChange={setLado}
                  opciones={[
                    { valor: "", label: "Total" },
                    { valor: "Izquierda", label: "Izquierda" },
                    { valor: "Derecha", label: "Derecha" },
                  ]}
                />
                <Segmentado
                  valor={perfil}
                  onChange={setPerfil}
                  opciones={[
                    { valor: "", label: "Todo perfil" },
                    { valor: "Abierto", label: "Abierto" },
                    { valor: "Cerrado", label: "Cerrado" },
                  ]}
                />
                <select
                  className="input w-auto"
                  value={pateador}
                  onChange={(e) => setPateador(e.target.value)}
                >
                  <option value="">Todos los pateadores</option>
                  {listaPat.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary ml-auto order-last"
                  onClick={descargarPdf}
                >
                  Descargar PDF
                </button>
                {(lado || perfil || pateador) && (
                  <button
                    type="button"
                    className="text-sm text-emerald-700 hover:underline"
                    onClick={() => {
                      setLado("");
                      setPerfil("");
                      setPateador("");
                    }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
              <div className="max-w-4xl mx-auto mb-4">
                <TendenciasCorners
                  corners={filtrados}
                  ocultarPateadores={!!pateador}
                  pies={pies}
                />
              </div>
              <div className="max-w-4xl mx-auto">
                <CornerZonesPitch
                  corners={filtrados}
                  lado={lado}
                  titulo={tituloVista}
                  subtitulo={`${filtrados.length} de ${corners.length} córners`}
                />
              </div>
            </section>

            <section className="card p-4">
              <h3 className="font-semibold text-slate-800 mb-1">
                Por pateador
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Click en un pateador para ver su campograma.
              </p>
              <CornersPorPateadorTable
                corners={corners}
                seleccionado={pateador}
                onSelect={setPateador}
                pies={pies}
              />
            </section>

            <section className="card p-4">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                  Detalle de córners ({filtrados.length})
                </summary>
                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr>
                      <th className="text-left">Partido</th>
                      <th className="text-left">Min.</th>
                      <th className="text-left">Pateador</th>
                      <th className="text-left">Lado</th>
                      <th className="text-left">Perfil</th>
                      <th className="text-left">Zona</th>
                      <th className="text-left">Marcador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c, i) => (
                      <tr key={i}>
                        <td>{c.partido}</td>
                        <td>{minuto(c.inicio)}</td>
                        <td>{c.pateador || "–"}</td>
                        <td>{c.lado || "–"}</td>
                        <td>{c.perfil || "–"}</td>
                        <td>
                          {c.zona ? (
                            nombreZona(c.zona)
                          ) : (
                            <span className="text-amber-700">
                              {c.zonaOriginal || "Sin zona"}
                            </span>
                          )}
                        </td>
                        <td>{c.resultado || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          </>
        )}

        <section className="card p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-slate-800">CSV cargados</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                CSV de Sportscode con los córners etiquetados: pateador en{" "}
                <em>Ungrouped</em>, zona en <em>Notes</em> (C, 1P, ACH, 2P, PP,
                R) y lado/perfil en <em>Flags</em>.
              </p>
            </div>
            {!isViewer && (
              <div className="flex items-center gap-2">
                {saving && (
                  <span className="text-xs text-slate-400">Guardando…</span>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => onFiles(e.target.files)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => fileRef.current?.click()}
                >
                  Cargar CSV
                </button>
              </div>
            )}
          </div>

          {saveError && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              No se pudo guardar: {saveError}. Lo cargado se ve igual en esta
              sesión, pero se pierde al recargar.
            </p>
          )}

          {(data?.archivos.length ?? 0) > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {data!.archivos.map((a) => (
                <li
                  key={a.partido}
                  className="badge bg-slate-100 text-slate-700 flex items-center gap-2"
                  title={a.nombre}
                >
                  <span>
                    {a.partido} · {a.corners.length} córner
                    {a.corners.length === 1 ? "" : "s"}
                  </span>
                  {!isViewer && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => quitar(a.partido)}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
