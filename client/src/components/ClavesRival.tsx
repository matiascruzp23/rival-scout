import { useMemo, useState } from 'react';
import { api } from '../api';
import { datoDeEtiqueta, etiquetasDeBloque } from '../lib/csvAnalysis';
import { BLOQUES_VIDEO, type BloqueVideo, type ClaveRival, type Match, type Player, type Rival } from '../types';
import { Modal } from './Modal';

const TIPO_CLASS: Record<ClaveRival['tipo'], string> = {
  // Fortaleza del rival = amenaza para nosotros; debilidad = dónde se le
  // puede hacer daño.
  Fortaleza: 'bg-red-50 text-red-700 border border-red-200',
  Debilidad: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function guardarClaves(rival: Rival, claves: ClaveRival[]): Promise<void> {
  await api.rivals.update(rival.id, { claves });
}

// Alta/edición de una clave. `inicial` sin id = clave nueva (p. ej. creada
// desde una etiqueta de Análisis, con bloque y etiqueta ya elegidos).
export function ClaveModal({
  rival,
  matches,
  inicial,
  onClose,
  onSaved,
}: {
  rival: Rival;
  matches: Match[];
  inicial: Partial<ClaveRival>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bloque, setBloque] = useState<BloqueVideo>(inicial.bloque ?? 'General');
  const [tipo, setTipo] = useState<ClaveRival['tipo']>(inicial.tipo ?? 'Debilidad');
  const [etiqueta, setEtiqueta] = useState(inicial.etiqueta ?? '');
  const [texto, setTexto] = useState(inicial.texto ?? '');
  const [propuesta, setPropuesta] = useState(inicial.propuesta ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = useMemo(() => etiquetasDeBloque(matches, bloque), [matches, bloque]);
  const etiquetaValida = opciones.etiquetas.some((e) => e.tag === etiqueta) ? etiqueta : '';
  const dato = etiquetaValida ? datoDeEtiqueta(matches, bloque, etiquetaValida) : null;

  const guardar = async () => {
    if (!texto.trim()) return;
    setSaving(true);
    setError(null);
    const clave: ClaveRival = {
      id: inicial.id ?? newId(),
      bloque,
      tipo,
      texto: texto.trim(),
      propuesta: propuesta.trim() || undefined,
      etiqueta: etiquetaValida || undefined,
    };
    const actuales = rival.claves ?? [];
    const claves = inicial.id ? actuales.map((c) => (c.id === inicial.id ? clave : c)) : [...actuales, clave];
    try {
      await guardarClaves(rival, claves);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Modal title={inicial.id ? 'Editar clave del rival' : 'Nueva clave del rival'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Bloque del video</label>
            <select className="input" value={bloque} onChange={(e) => setBloque(e.target.value as BloqueVideo)}>
              {BLOQUES_VIDEO.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <div className="flex gap-1.5">
              {(['Debilidad', 'Fortaleza'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`flex-1 px-2 py-1.5 text-sm rounded-md ${
                    tipo === t ? TIPO_CLASS[t] : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {opciones.etiquetas.length > 0 && (
          <div>
            <label className="label">Dato de Sportscode (opcional)</label>
            <select className="input" value={etiquetaValida} onChange={(e) => setEtiqueta(e.target.value)}>
              <option value="">Sin dato asociado</option>
              {opciones.etiquetas.map((e) => (
                <option key={e.tag} value={e.tag}>
                  {e.tag} ({e.count} de {opciones.registros} · {e.partidos}/{opciones.partidosConCsv} partidos)
                </option>
              ))}
            </select>
            {dato && <p className="text-xs text-slate-500 mt-1">{dato}</p>}
          </div>
        )}

        <div>
          <label className="label">Lectura</label>
          <textarea
            className="input"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej.: en circulación baja buscan el juego directo al 9 cuando se les presiona la salida."
          />
        </div>
        <div>
          <label className="label">Qué haríamos (opcional)</label>
          <textarea
            className="input"
            rows={2}
            value={propuesta}
            onChange={(e) => setPropuesta(e.target.value)}
            placeholder="Ej.: presionar con dos puntas orientando hacia adentro y ganar la segunda pelota."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={saving || !texto.trim()} onClick={guardar}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Síntesis del Informe: las claves agrupadas en el orden del video, para
// leerlas en paralelo con él. El dato de Sportscode se recalcula siempre
// con los CSV actuales (no queda congelado al momento de escribir la clave).
export function ClavesSintesis({
  rival,
  matches,
  jugadores,
  canEdit,
  onSaved,
}: {
  rival: Rival;
  matches: Match[];
  // Jugadores del rival con conducta clave cargada en su ficha.
  jugadores: Player[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const claves = rival.claves ?? [];
  const jugadoresClave = jugadores.filter((p) => p.conductaClave?.trim());
  const vacio = claves.length === 0 && jugadoresClave.length === 0;
  const [editando, setEditando] = useState<Partial<ClaveRival> | null>(null);

  const porBloque = BLOQUES_VIDEO.map((bloque) => ({
    bloque,
    claves: claves.filter((c) => c.bloque === bloque),
  })).filter((g) => g.claves.length > 0);

  const eliminar = async (id: string) => {
    if (!window.confirm('¿Eliminar esta clave?')) return;
    await guardarClaves(
      rival,
      claves.filter((c) => c.id !== id)
    );
    onSaved();
  };

  if (vacio && !canEdit) return null;

  return (
    <section className={`informe-section card p-4 mb-6 ${vacio ? 'no-print' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800">Claves del rival</h3>
        {canEdit && (
          <button className="btn-secondary no-print text-xs py-1" onClick={() => setEditando({})}>
            + Agregar clave
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">Lectura del analista, en el orden del video.</p>

      {vacio ? (
        <p className="text-sm text-slate-400">
          Todavía no hay claves. Se pueden agregar acá, desde cada etiqueta en Análisis o como conducta clave en la ficha de un jugador.
        </p>
      ) : (
        <div className="space-y-3">
          {porBloque.map((g) => (
            <div key={g.bloque}>
              <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-1">{g.bloque}</p>
              <ul className="space-y-1.5">
                {g.claves.map((c) => {
                  const dato = c.etiqueta ? datoDeEtiqueta(matches, c.bloque, c.etiqueta) : null;
                  return (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      <span className={`badge shrink-0 mt-0.5 ${TIPO_CLASS[c.tipo]}`}>{c.tipo}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800">{c.texto}</p>
                        {dato && <p className="text-[11px] text-slate-400">Dato: {dato}</p>}
                        {c.propuesta && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            <span className="font-semibold text-emerald-700">Qué haríamos: </span>
                            {c.propuesta}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="no-print flex gap-2 shrink-0 text-xs">
                          <button className="text-emerald-700 hover:underline" onClick={() => setEditando(c)}>
                            Editar
                          </button>
                          <button className="text-red-600 hover:underline" onClick={() => eliminar(c.id)}>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {jugadoresClave.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-1">Jugadores clave</p>
              <ul className="space-y-1">
                {jugadoresClave.map((p) => (
                  <li key={p.id} className="text-sm text-slate-800">
                    <span className="font-medium">
                      {p.dorsal != null && `${p.dorsal}. `}
                      {p.nombre}
                    </span>
                    {p.posicion && <span className="text-slate-400"> ({p.posicion})</span>}: {p.conductaClave}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editando && (
        <ClaveModal
          rival={rival}
          matches={matches}
          inicial={editando}
          onClose={() => setEditando(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
