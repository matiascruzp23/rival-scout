import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HorizontalPitch, Pitch, type PitchToken } from './Pitch';
import { BuildUpShapeDiagram, FormationLinesDiagram, PressingTriggerDiagram } from './TacticalDiagram';
import { situationDiagramFor } from './SituationDiagrams';
import { TIPO_CLASS, guardarClaves } from './ClavesRival';
import { templateLineup } from '../lib/formations';
import { positionAbbr } from '../lib/positions';
import { shortName } from '../lib/lookup';
import {
  datoDeEtiqueta,
  esPuntual,
  fraseCambios,
  type PhaseAnalysis,
  type SituacionBloque,
  type TagCount,
} from '../lib/csvAnalysis';
import { BLOQUES_VIDEO, type BloqueVideo, type ClaveRival, type Match, type Player, type Rival } from '../types';

// Texto que se puede corregir en pantalla justo antes de exportar el PDF.
// Sin `onSave`, la corrección vale solo para este Informe abierto (se pierde
// al recargar); con `onSave` se guarda en la app (p. ej. el texto de una
// clave). Vacío = se usa el texto calculado.
export function PdfText({
  value,
  onSave,
  placeholder,
  className = '',
}: {
  value: string;
  onSave?: (texto: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}) {
  const [override, setOverride] = useState<string | null>(null);
  const shown = override ?? value;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== shown) ref.current.innerText = shown;
  }, [shown]);

  const commit = async () => {
    const el = ref.current;
    if (!el) return;
    const texto = el.innerText.trim();
    if (texto === shown) return;
    if (onSave) {
      try {
        await onSave(texto);
      } catch (e) {
        window.alert(`No se pudo guardar: ${(e as Error).message}`);
        el.innerText = shown;
      }
      return;
    }
    setOverride(texto === '' || texto === value ? null : texto);
    if (texto === '') el.innerText = value;
  };

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      data-placeholder={placeholder}
      title={onSave ? 'Clic para editar (se guarda en la app)' : 'Clic para editar (solo para este PDF)'}
      className={`pdf-editable whitespace-pre-line ${className}`}
    />
  );
}

function SlideFrame({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="informe-section informe-page informe-slide card p-5 mb-6">
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">{titulo}</h3>
        {subtitulo && <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{subtitulo}</span>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

function InfoBox({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-md p-3 flex-1 min-h-0">
      <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wide mb-1">{titulo}</p>
      <div className="text-sm text-slate-600 leading-snug">{children}</div>
    </div>
  );
}

const veces = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`;

// "Presionan en 4-1-4-1" / "Presionan en 4-3-1-2 (4-1-3-2)" -> "4-1-4-1".
function sistemaDeValor(valor: string): string | null {
  return valor.match(/\d(?:-\d)+/)?.[0] ?? null;
}

function sistemaTokens(sistema: string): PitchToken[] | null {
  const lineup = templateLineup(sistema);
  if (!lineup) return null;
  return lineup.map((e, i) => ({ key: `${e.posicion}-${i}`, x: e.x ?? 50, y: e.y ?? 50, posicion: e.posicion, label: '' }));
}

function SistemaPitch({ sistema, fallbackValor }: { sistema: string | null; fallbackValor?: string }) {
  const tokens = sistema ? sistemaTokens(sistema) : null;
  if (tokens) return <Pitch tokens={tokens} height={400} />;
  if (fallbackValor) return <FormationLinesDiagram valor={fallbackValor} />;
  return <div className="h-[400px] rounded-lg bg-slate-100" />;
}

// Diapositiva "Estructura táctica": sistema base y dibujo sin balón en dos
// canchas, con los datos que los sostienen al costado.
export function EstructuraTacticaSlide({
  sistemas,
  partidosConSistema,
  estructuraCirculacion,
  dibujoPresion,
  cambiosSistema,
}: {
  sistemas: { item: string; count: number; ganados: number; empatados: number; perdidos: number; rendimiento: number | null }[];
  partidosConSistema: number;
  estructuraCirculacion: { valor: string; pct: number }[];
  dibujoPresion: { valor: string; pct: number }[];
  cambiosSistema: { item: string; count: number }[];
}) {
  const base = sistemas[0];
  const presion = dibujoPresion[0];
  const presionSistema = presion ? sistemaDeValor(presion.valor) : null;
  const limpiar = (v: string) => v.replace(/^Presionan en /, '');

  return (
    <SlideFrame titulo="Estructura táctica">
      <div className="grid h-full gap-5" style={{ gridTemplateColumns: '58fr 42fr' }}>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-slate-700 uppercase">Sistema base</p>
            <div className="w-full">
              <SistemaPitch sistema={base?.item ?? null} />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {base ? `${base.item} (${base.count} de ${partidosConSistema})` : 'Sin datos'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-slate-700 uppercase">Sin balón (presión)</p>
            <div className="w-full">
              <SistemaPitch sistema={presionSistema} fallbackValor={presion?.valor} />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {presion ? `${limpiar(presion.valor)} (${presion.pct}%)` : 'Sin datos de Sportscode'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <InfoBox titulo="Sistema inicial">
            <PdfText
              value={
                base
                  ? `${base.item} en ${base.count} de ${partidosConSistema} partidos · ${base.ganados}G-${base.empatados}E-${base.perdidos}P${
                      base.rendimiento !== null ? ` · ${base.rendimiento}%` : ''
                    }.` +
                    (sistemas[1] ? ` Alternativa: ${sistemas[1].item} (${sistemas[1].count}).` : '')
                  : ''
              }
              placeholder="Sin datos"
            />
          </InfoBox>
          <InfoBox titulo="Estructura de circulación">
            <PdfText
              value={estructuraCirculacion.slice(0, 3).map((b) => `${b.valor} (${b.pct}%)`).join(' · ')}
              placeholder="Sin datos de Sportscode"
            />
          </InfoBox>
          <InfoBox titulo="Dibujo en presión">
            <PdfText
              value={dibujoPresion.slice(0, 3).map((b) => `${limpiar(b.valor)} (${b.pct}%)`).join(' · ')}
              placeholder="Sin datos de Sportscode"
            />
          </InfoBox>
          <InfoBox titulo="Cambios de sistema">
            <PdfText
              value={cambiosSistema.slice(0, 3).map((c) => `${c.item} (${veces(c.count)})`).join(' · ')}
              placeholder="Sin cambios de sistema registrados"
            />
          </InfoBox>
        </div>
      </div>
    </SlideFrame>
  );
}

// Diapositiva "Alineación probable": el XI (estimado o ajustado a mano) en
// cancha apaisada, con alternativas, funciones y revulsivo al costado.
export function AlineacionProbableSlide({
  tokens,
  picks,
  rotation,
  funciones,
  revulsivos,
  players,
  deBaja,
  enSeleccion,
  controles,
  notas,
}: {
  tokens: PitchToken[];
  picks: { posicion: string; player: Player }[];
  rotation: { posicion: string; jugadores: { playerId: string; count: number }[] }[];
  funciones: { rival: string; situacion: string; count: number }[];
  revulsivos: { item: string; count: number; minutoPromedio: number }[];
  players: Player[];
  deBaja: Player[];
  enSeleccion: Player[];
  // Controles del XI manual y avisos (regla de torneo, nota), van tal cual.
  controles?: ReactNode;
  notas?: ReactNode;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nombre = (id: string) => {
    const p = byId.get(id);
    return p ? shortName(p.nombre) : '?';
  };

  // Por cada puesto del XI, quién más lo jugó de titular (2+ veces).
  const alternativas = picks
    .map((pick) => {
      const r = rotation.find((x) => x.posicion === pick.posicion);
      const otros = (r?.jugadores ?? []).filter((j) => j.playerId !== pick.player.id && j.count >= 2).slice(0, 2);
      return otros.length ? `${positionAbbr(pick.posicion)}: ${otros.map((o) => `${nombre(o.playerId)} (${o.count})`).join(', ')}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  // Funciones observadas: situaciones más repetidas por jugador (Sportscode).
  const porJugador = new Map<string, { situacion: string; count: number }[]>();
  for (const f of funciones) {
    if (!porJugador.has(f.rival)) porJugador.set(f.rival, []);
    porJugador.get(f.rival)!.push(f);
  }
  const funcionesTexto = Array.from(porJugador.entries())
    .slice(0, 4)
    .map(([jugador, sits]) => `${jugador}: ${sits.slice(0, 2).map((s) => `${s.situacion.toLowerCase()} (${s.count})`).join(' y ')}`)
    .join(' · ');

  const revulsivoTexto = revulsivos
    .slice(0, 2)
    .map((r) => `${byId.get(r.item)?.nombre ?? '?'} (${r.count} ingresos, min ~${Math.round(r.minutoPromedio)}')`)
    .join(' · ');

  const ausencias = [...deBaja.map((p) => p.nombre), ...enSeleccion.map((p) => `${p.nombre} (selección)`)];

  return (
    <SlideFrame titulo="Alineación probable">
      <div className="grid h-full gap-5" style={{ gridTemplateColumns: '60fr 40fr' }}>
        <div className="flex flex-col gap-2 min-h-0">
          {controles}
          {tokens.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos suficientes.</p>
          ) : (
            <HorizontalPitch tokens={tokens} />
          )}
          <p className="text-sm">
            <span className="font-bold text-red-600 uppercase text-xs mr-2">De baja:</span>
            <PdfText value={ausencias.join(', ')} placeholder="Sin bajas" className="text-slate-700" />
          </p>
          {notas}
        </div>
        <div className="flex flex-col gap-3">
          <InfoBox titulo="Alternativas por posición">
            <PdfText value={alternativas} placeholder="Sin alternativas repetidas" />
          </InfoBox>
          <InfoBox titulo="Funciones observadas">
            <PdfText value={funcionesTexto} placeholder="Sin datos individuales de Sportscode" />
          </InfoBox>
          <InfoBox titulo="Revulsivo habitual">
            <PdfText value={revulsivoTexto} placeholder="Sin sustituciones registradas" />
          </InfoBox>
        </div>
      </div>
    </SlideFrame>
  );
}

// Guarda en la app la corrección de un texto de una clave hecha en el PDF.
function guardarCampoClave(rival: Rival, clave: ClaveRival, campo: 'texto' | 'propuesta', onSaved: () => void) {
  return async (valor: string) => {
    if (campo === 'texto' && !valor) throw new Error('la lectura no puede quedar vacía');
    const todas = rival.claves ?? [];
    await guardarClaves(
      rival,
      todas.map((c) => (c.id === clave.id ? { ...c, [campo]: valor || undefined } : c))
    );
    onSaved();
  };
}

const MOMENTOS = BLOQUES_VIDEO.filter((b): b is Exclude<BloqueVideo, 'General'> => b !== 'General');

// Capturas de cada momento del video: se eligen o pegan solo para exportar
// (quedan en memoria del navegador, no se suben a la app). Por defecto la
// imagen rellena todo su recuadro (puede recortar los bordes); "ver
// completa" la muestra entera aunque queden franjas a los costados.
export interface Capturas {
  imagenes: Partial<Record<BloqueVideo, string>>;
  completa: Partial<Record<BloqueVideo, boolean>>;
  setImagen: (bloque: BloqueVideo, file: File | null) => void;
  toggleCompleta: (bloque: BloqueVideo) => void;
}

export function useCapturas(): Capturas {
  const [imagenes, setImagenes] = useState<Partial<Record<BloqueVideo, string>>>({});
  const [completa, setCompleta] = useState<Partial<Record<BloqueVideo, boolean>>>({});

  // Liberar las URLs de las imágenes al salir del Informe.
  const imagenesRef = useRef(imagenes);
  imagenesRef.current = imagenes;
  useEffect(() => () => Object.values(imagenesRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);

  return {
    imagenes,
    completa,
    setImagen: (bloque, file) =>
      setImagenes((prev) => {
        if (prev[bloque]) URL.revokeObjectURL(prev[bloque]!);
        return { ...prev, [bloque]: file ? URL.createObjectURL(file) : undefined };
      }),
    toggleCompleta: (bloque) => setCompleta((prev) => ({ ...prev, [bloque]: !prev[bloque] })),
  };
}

interface MomentoProps {
  rival: Rival;
  matches: Match[];
  canEdit: boolean;
  onSaved: () => void;
  capturas: Capturas;
}

// Todas las páginas de captura seguidas (cuando no hay CSV de Sportscode y
// por lo tanto no hay páginas de diagramas entre las que intercalarlas).
export function MomentosSlides(props: MomentoProps) {
  return (
    <>
      {MOMENTOS.map((bloque) => (
        <MomentoSlide key={bloque} bloque={bloque} {...props} />
      ))}
    </>
  );
}

// Una página por momento del video con la distribución de la diapositiva de
// captura a pantalla completa: franja arriba con fase · momento y el dato de
// frecuencia, la captura ocupando todo el resto y un recuadro superpuesto
// abajo a la izquierda con las claves de ese bloque.
function MomentoSlide({ bloque, rival, matches, canEdit, onSaved, capturas }: MomentoProps & { bloque: BloqueVideo }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imagen = capturas.imagenes[bloque];
  const completa = !!capturas.completa[bloque];
  const onImagen = (file: File | null) => capturas.setImagen(bloque, file);
  const claves = (rival.claves ?? []).filter((c) => c.bloque === bloque);
  const fase = bloque === 'Salida' || bloque.startsWith('Circulación') ? 'Fase ofensiva' : 'Fase defensiva';
  const frecuencia = claves
    .map((c) => (c.etiqueta ? datoDeEtiqueta(matches, c.bloque, c.etiqueta) : null))
    .filter(Boolean)
    .join(' · ');

  const guardarCampo = (clave: ClaveRival, campo: 'texto' | 'propuesta') =>
    guardarCampoClave(rival, clave, campo, onSaved);

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      onImagen(file);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) onImagen(file);
  };

  return (
    <section className="informe-section informe-page informe-slide card overflow-hidden mb-6">
      <div className="flex-none bg-emerald-700 text-white text-center px-4 py-1.5">
        <p className="text-sm font-bold uppercase tracking-wide">
          {fase} · {bloque}
        </p>
        <p className="text-xs text-emerald-50">
          <PdfText value={frecuencia} placeholder="Estructura / detalle" />
        </p>
      </div>
      <div
        tabIndex={0}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`relative flex-1 min-h-0 flex items-center justify-center outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600 ${
          imagen ? 'bg-slate-800' : 'bg-slate-50'
        }`}
      >
        {imagen ? (
          <img
            src={imagen}
            alt={`Captura ${bloque}`}
            className={`absolute inset-0 w-full h-full ${completa ? 'object-contain' : 'object-cover'}`}
          />
        ) : (
          <div className="no-print text-center text-sm text-slate-400 px-6">
            <p>Captura a pantalla completa para el PDF: haz clic aquí y pégala (Cmd+V), arrástrala o</p>
            <button className="btn-secondary text-xs mt-2" onClick={() => inputRef.current?.click()}>
              Elegir imagen
            </button>
            <p className="text-[11px] mt-2">No se guarda en la app: se pierde al recargar el Informe.</p>
          </div>
        )}
        {imagen && (
          <div className="no-print absolute top-2 right-2 flex gap-1.5">
            <button className="btn-secondary text-xs py-1" onClick={() => capturas.toggleCompleta(bloque)}>
              {completa ? 'Rellenar página' : 'Ver completa'}
            </button>
            <button className="btn-secondary text-xs py-1" onClick={() => inputRef.current?.click()}>
              Cambiar
            </button>
            <button className="btn-secondary text-xs py-1" onClick={() => onImagen(null)}>
              Quitar
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onImagen(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />

        <div className="momento-desc absolute left-4 bottom-4 max-w-[46%] bg-white rounded-md shadow-lg px-3 py-2 space-y-2">
          {claves.length === 0 && (
            <p className="text-sm text-slate-800 font-semibold">
              <PdfText value="" placeholder="Descripción breve de la acción (qué, quién, dónde)" />
            </p>
          )}
          {claves.map((c) => (
            <div key={c.id}>
              <p className="text-sm text-slate-800 leading-snug">
                <span className={`badge mr-1.5 align-middle ${TIPO_CLASS[c.tipo]}`}>{c.tipo}</span>
                <PdfText value={c.texto} onSave={canEdit ? guardarCampo(c, 'texto') : undefined} />
              </p>
              {(c.propuesta || canEdit) && (
                <p className={`text-xs text-slate-600 leading-snug mt-1 ${c.propuesta ? '' : 'no-print'}`}>
                  <span className="font-semibold text-emerald-700">Qué haríamos: </span>
                  <PdfText
                    value={c.propuesta ?? ''}
                    onSave={canEdit ? guardarCampo(c, 'propuesta') : undefined}
                    placeholder="(opcional)"
                  />
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Páginas de Sportscode (reemplazan las tarjetas de "Datos analizados"):
// inicio y salida, circulación media y alta, organización y presión, y
// espacios y vulnerabilidades. Cada lista muestra la frecuencia con su total.

function Figura({ el, caption }: { el: ReactNode | null; caption?: string }) {
  if (!el) return null;
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="w-full">{el}</div>
      {caption && <figcaption className="text-xs font-semibold text-slate-600 text-center">{caption}</figcaption>}
    </figure>
  );
}

// Variante para diagramas verticales: el dibujo llena el alto que le queda
// a la figura dentro de la columna (el ancho sale de su proporción).
function FiguraAlta({ el, caption }: { el: ReactNode | null; caption?: string }) {
  if (!el) return <div className="flex-1" />;
  return (
    <figure className="flex-1 min-h-0 flex flex-col items-center gap-1">
      <div className="flex-1 min-h-0 w-full">{el}</div>
      {caption && <figcaption className="text-xs font-semibold text-slate-600 text-center">{caption}</figcaption>}
    </figure>
  );
}

// Primer diagrama disponible entre las etiquetas más repetidas, sin repetir
// uno ya dibujado en otra parte de la misma página.
function primerDiagrama(
  tags: TagCount[],
  dibujar: (tag: string) => ReactNode | null,
  usados: Set<string>
): { el: ReactNode; tag: string } | null {
  for (const t of tags) {
    if (usados.has(t.tag)) continue;
    const el = dibujar(t.tag);
    if (el) {
      usados.add(t.tag);
      return { el, tag: t.tag };
    }
  }
  return null;
}

function TagLista({ bloque, partidosConCsv, max = 5 }: { bloque: SituacionBloque | undefined; partidosConCsv: number; max?: number }) {
  if (!bloque || bloque.tags.length === 0) return <p className="text-sm text-slate-400">Sin registros.</p>;
  return (
    <ul className="space-y-1">
      {bloque.tags.slice(0, max).map((t) => {
        const puntual = esPuntual(t, partidosConCsv);
        return (
          <li key={t.tag} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-800">{t.tag}</span>
            <span className={`text-xs whitespace-nowrap ${puntual ? 'text-amber-700' : 'text-slate-400'}`}>
              {t.count}/{bloque.registros} · {puntual ? 'puntual' : `${t.partidos}/${partidosConCsv} p.`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ListaBox({
  titulo,
  bloque,
  partidosConCsv,
  children,
}: {
  titulo: string;
  bloque: SituacionBloque | undefined;
  partidosConCsv: number;
  children?: ReactNode;
}) {
  return (
    <InfoBox titulo={`${titulo} (${bloque?.registros ?? 0} reg.)`}>
      <TagLista bloque={bloque} partidosConCsv={partidosConCsv} />
      {children}
    </InfoBox>
  );
}

// Lectura del analista: las claves de esos bloques (editables, se guardan);
// sin claves, un texto libre solo para el PDF.
function Lectura({
  rival,
  bloques,
  canEdit,
  onSaved,
  className = '',
}: {
  rival: Rival;
  bloques: BloqueVideo[];
  canEdit: boolean;
  onSaved: () => void;
  className?: string;
}) {
  const claves = (rival.claves ?? []).filter((c) => bloques.includes(c.bloque));
  if (claves.length === 0) return <PdfText value="" placeholder="Por completar" className={className} />;
  return (
    <div className="space-y-1">
      {claves.map((c) => (
        <p key={c.id} className={className}>
          <PdfText value={c.texto} onSave={canEdit ? guardarCampoClave(rival, c, 'texto', onSaved) : undefined} />
        </p>
      ))}
    </div>
  );
}

function bloqueDe(data: PhaseAnalysis, titulo: string): SituacionBloque | undefined {
  return data.situaciones.find((b) => b.titulo === titulo);
}

// "Ganando, predomina X y usan menos Y." por cada resultado con muestra.
function segunMarcador(data: PhaseAnalysis): string {
  return data.porEstado
    .map((r) => {
      const frase = r.cambios ? fraseCambios(r.estado, r.cambios) : null;
      if (frase) return frase;
      const top = r.situacionesTop[0];
      return top ? `${r.estado}, lo más frecuente es ${top.tag} (${top.pct}%).` : null;
    })
    .filter(Boolean)
    .join('\n');
}

export function SportscodeSlides({
  ofensiva,
  presion,
  vulnerabilidades,
  sistemaDominante,
  rival,
  matches,
  canEdit,
  onSaved,
  capturas,
}: {
  ofensiva: PhaseAnalysis;
  presion: PhaseAnalysis;
  vulnerabilidades: PhaseAnalysis;
  sistemaDominante: string | null;
} & MomentoProps) {
  // Las páginas de captura van intercaladas: cada una justo después de la
  // página de diagramas de su momento.
  const capturasDe = (...bloques: BloqueVideo[]) =>
    bloques.map((b) => (
      <MomentoSlide key={b} bloque={b} rival={rival} matches={matches} canEdit={canEdit} onSaved={onSaved} capturas={capturas} />
    ));
  const n = ofensiva.partidosConCsv;
  const situacion = (tag: string) => situationDiagramFor(tag, sistemaDominante);
  // Circulación en cancha vertical: aprovecha mejor las columnas angostas.
  const situacionVertical = (tag: string) => situationDiagramFor(tag, sistemaDominante, { vertical: true });
  const lecturaProps = { rival, canEdit, onSaved };

  // --- Inicio y salida de balón
  const distancia = bloqueDe(ofensiva, 'Distancia de salida');
  const circBaja = bloqueDe(ofensiva, 'Circulación baja');
  const construccion = ofensiva.estructura[0];
  const usadosOf = new Set<string>();
  const diagBaja = primerDiagrama(circBaja?.tags ?? [], situacionVertical, usadosOf);
  const marcadorSalida = (distancia?.tags ?? [])
    .filter((t) => t.porEstado && t.porEstado.length > 0)
    .map((t) => `${t.tag}: ${t.porEstado!.map((e) => `${e.estado.toLowerCase()} ${e.count}`).join(' · ')}`)
    .join('\n');

  // --- Circulación media y alta
  const circMedia = bloqueDe(ofensiva, 'Circulación media');
  const circAlta = bloqueDe(ofensiva, 'Circulación alta');
  const diagMedia = primerDiagrama(circMedia?.tags ?? [], situacionVertical, usadosOf);
  const diagAlta = primerDiagrama(circAlta?.tags ?? [], situacionVertical, usadosOf);

  // --- Organización y presión
  const presionFija = bloqueDe(presion, 'Presión fija');
  const dibujo = presion.estructura[0];
  const dibujoSistema = dibujo ? sistemaDeValor(dibujo.valor) : null;
  const diagFija = primerDiagrama(presionFija?.tags ?? [], (tag) => <PressingTriggerDiagram tag={tag} />, new Set());
  const limpiar = (v: string) => v.replace(/^Presionan en /, '');

  // --- Espacios y vulnerabilidades
  const usadosVul = new Set<string>();
  const columnasVul = (['Presión alta', 'Presión media', 'Presión baja'] as const).map((titulo) => {
    const bloque = bloqueDe(vulnerabilidades, titulo);
    return { titulo, bloque, diag: primerDiagrama(bloque?.tags ?? [], situacion, usadosVul) };
  });

  return (
    <>
      <SlideFrame titulo="Inicio y salida de balón">
        <div className="grid h-full gap-4" style={{ gridTemplateColumns: '24fr 38fr 38fr' }}>
          <div className="flex flex-col gap-4 min-h-0">
            <Figura el={construccion ? <BuildUpShapeDiagram valor={construccion.valor} /> : null} caption={construccion?.valor} />
            <FiguraAlta el={diagBaja?.el ?? null} caption={diagBaja?.tag} />
          </div>
          <div className="flex flex-col gap-3">
            <InfoBox titulo="Distancia de salida">
              <TagLista bloque={distancia} partidosConCsv={n} max={3} />
            </InfoBox>
            <ListaBox titulo="Circulación baja" bloque={circBaja} partidosConCsv={n} />
          </div>
          <div className="flex flex-col gap-3">
            <InfoBox titulo="Según marcador">
              <PdfText value={marcadorSalida} placeholder="Sin desglose por resultado" />
            </InfoBox>
            <InfoBox titulo="Lectura del analista">
              <Lectura bloques={['Salida', 'Circulación baja']} {...lecturaProps} />
            </InfoBox>
            <InfoBox titulo="vs presión alta / media">
              <PdfText value="" placeholder="Por completar" />
            </InfoBox>
          </div>
        </div>
      </SlideFrame>
      {capturasDe('Salida', 'Circulación baja')}

      <SlideFrame titulo="Circulación media y alta">
        <div
          className="grid h-full gap-4"
          style={{ gridTemplateColumns: '20fr 40fr 40fr', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)' }}
        >
          <div className="flex flex-col min-h-0">
            <FiguraAlta el={diagMedia?.el ?? null} caption={diagMedia?.tag} />
          </div>
          <ListaBox titulo="Circulación media" bloque={circMedia} partidosConCsv={n} />
          <InfoBox titulo="Lectura · Circulación media">
            <Lectura bloques={['Circulación media']} {...lecturaProps} />
          </InfoBox>
          <div className="flex flex-col min-h-0">
            <FiguraAlta el={diagAlta?.el ?? null} caption={diagAlta?.tag} />
          </div>
          <ListaBox titulo="Circulación alta" bloque={circAlta} partidosConCsv={n} />
          <InfoBox titulo="Lectura · Circulación alta">
            <Lectura bloques={['Circulación alta']} {...lecturaProps} />
          </InfoBox>
        </div>
      </SlideFrame>
      {capturasDe('Circulación media', 'Circulación alta')}

      <SlideFrame titulo="Organización y presión">
        <div className="grid h-full gap-4" style={{ gridTemplateColumns: '30fr 28fr 42fr' }}>
          <Figura
            el={dibujo ? <SistemaPitch sistema={dibujoSistema} fallbackValor={dibujo.valor} /> : null}
            caption={dibujo ? `Presionan en ${limpiar(dibujo.valor)} (${dibujo.pct}%)` : undefined}
          />
          <div className="flex flex-col gap-3">
            <Figura el={diagFija?.el ?? null} caption={diagFija?.tag} />
            <ListaBox titulo="Presión fija" bloque={presionFija} partidosConCsv={n} />
          </div>
          <div className="flex flex-col gap-3">
            <InfoBox titulo="Dibujo táctico en presión">
              <PdfText
                value={presion.estructura.slice(0, 3).map((b) => `${limpiar(b.valor)} (${b.pct}%)`).join(' · ')}
                placeholder="Sin datos de Sportscode"
              />
            </InfoBox>
            <InfoBox titulo="Lectura · Presión fija">
              <Lectura bloques={['Presión fija']} {...lecturaProps} />
            </InfoBox>
            <InfoBox titulo="Según marcador">
              <PdfText value={segunMarcador(presion)} placeholder="Muestra chica para comparar por resultado" />
            </InfoBox>
            <InfoBox titulo="Altura del bloque / tipo de marca">
              <PdfText value="" placeholder="Por completar" />
            </InfoBox>
          </div>
        </div>
      </SlideFrame>
      {capturasDe('Presión fija')}

      <SlideFrame titulo="Espacios y vulnerabilidades">
        <div className="grid h-full gap-4 grid-cols-3">
          {columnasVul.map(({ titulo, bloque, diag }) => (
            <div key={titulo} className="flex flex-col gap-3">
              <Figura el={diag?.el ?? null} caption={diag?.tag} />
              <ListaBox titulo={titulo} bloque={bloque} partidosConCsv={n}>
                <div className="mt-2">
                  <Lectura bloques={[titulo]} {...lecturaProps} className="text-sm italic text-red-700" />
                </div>
              </ListaBox>
            </div>
          ))}
        </div>
      </SlideFrame>
      {capturasDe('Presión alta', 'Presión media', 'Presión baja')}
    </>
  );
}
