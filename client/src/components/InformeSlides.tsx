import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HorizontalPitch, Pitch, type PitchToken } from './Pitch';
import { FormationLinesDiagram } from './TacticalDiagram';
import { TIPO_CLASS, guardarClaves } from './ClavesRival';
import { templateLineup } from '../lib/formations';
import { positionAbbr } from '../lib/positions';
import { shortName } from '../lib/lookup';
import { datoDeEtiqueta } from '../lib/csvAnalysis';
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

const MOMENTOS = BLOQUES_VIDEO.filter((b): b is Exclude<BloqueVideo, 'General'> => b !== 'General');

// Una página por momento del video, con una captura que se elige o pega
// solo para exportar (queda en memoria del navegador, no se sube a la app)
// y las claves de ese bloque.
export function MomentosSlides({
  rival,
  matches,
  canEdit,
  onSaved,
}: {
  rival: Rival;
  matches: Match[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [imagenes, setImagenes] = useState<Partial<Record<BloqueVideo, string>>>({});

  // Liberar las URLs de las imágenes al salir del Informe.
  const imagenesRef = useRef(imagenes);
  imagenesRef.current = imagenes;
  useEffect(() => () => Object.values(imagenesRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);

  const setImagen = (bloque: BloqueVideo, file: File | null) => {
    setImagenes((prev) => {
      if (prev[bloque]) URL.revokeObjectURL(prev[bloque]!);
      return { ...prev, [bloque]: file ? URL.createObjectURL(file) : undefined };
    });
  };

  return (
    <>
      {MOMENTOS.map((bloque) => (
        <MomentoSlide
          key={bloque}
          bloque={bloque}
          rival={rival}
          matches={matches}
          canEdit={canEdit}
          onSaved={onSaved}
          imagen={imagenes[bloque]}
          onImagen={(f) => setImagen(bloque, f)}
        />
      ))}
    </>
  );
}

function MomentoSlide({
  bloque,
  rival,
  matches,
  canEdit,
  onSaved,
  imagen,
  onImagen,
}: {
  bloque: BloqueVideo;
  rival: Rival;
  matches: Match[];
  canEdit: boolean;
  onSaved: () => void;
  imagen?: string;
  onImagen: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const claves = (rival.claves ?? []).filter((c) => c.bloque === bloque);
  const fase = bloque === 'Salida' || bloque.startsWith('Circulación') ? 'Fase ofensiva' : 'Fase defensiva';
  const frecuencia = claves
    .map((c) => (c.etiqueta ? datoDeEtiqueta(matches, c.bloque, c.etiqueta) : null))
    .filter(Boolean)
    .join('\n');

  const guardarCampo = (clave: ClaveRival, campo: 'texto' | 'propuesta') => async (valor: string) => {
    if (campo === 'texto' && !valor) throw new Error('la lectura no puede quedar vacía');
    const todas = rival.claves ?? [];
    await guardarClaves(
      rival,
      todas.map((c) => (c.id === clave.id ? { ...c, [campo]: valor || undefined } : c))
    );
    onSaved();
  };

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
    <SlideFrame titulo={bloque} subtitulo={fase}>
      <div className="grid h-full gap-5" style={{ gridTemplateColumns: '60fr 40fr' }}>
        <div className="flex flex-col gap-3 min-h-0">
          <div
            tabIndex={0}
            onPaste={onPaste}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`relative flex-1 min-h-0 rounded-md overflow-hidden flex items-center justify-center outline-none focus:ring-2 focus:ring-emerald-600 ${
              imagen ? 'bg-slate-50' : 'border-2 border-dashed border-slate-200'
            }`}
          >
            {imagen ? (
              <img src={imagen} alt={`Captura ${bloque}`} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="no-print text-center text-sm text-slate-400 px-6">
                <p>Captura para el PDF: haz clic aquí y pégala (Cmd+V), arrástrala o</p>
                <button className="btn-secondary text-xs mt-2" onClick={() => inputRef.current?.click()}>
                  Elegir imagen
                </button>
                <p className="text-[11px] mt-2">No se guarda en la app: se pierde al recargar el Informe.</p>
              </div>
            )}
            {imagen && (
              <div className="no-print absolute top-2 right-2 flex gap-1.5">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoBox titulo="Partido / minuto">
              <PdfText value="" placeholder="vs Rival · 00:00" />
            </InfoBox>
            <InfoBox titulo="Frecuencia">
              <PdfText value={frecuencia} placeholder="N° de veces observado / N° de partidos" />
            </InfoBox>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-0">
          {claves.map((c) => (
            <div key={c.id} className="border border-slate-200 rounded-md p-3">
              <span className={`badge mb-1.5 ${TIPO_CLASS[c.tipo]}`}>{c.tipo}</span>
              <p className="text-sm text-slate-800 leading-snug">
                <PdfText value={c.texto} onSave={canEdit ? guardarCampo(c, 'texto') : undefined} />
              </p>
              {(c.propuesta || canEdit) && (
                <p className={`text-sm text-slate-600 leading-snug mt-1.5 ${c.propuesta ? '' : 'no-print'}`}>
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
    </SlideFrame>
  );
}
