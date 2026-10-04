import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { Match, MatchBaja, Player } from '../types';
import { MatchSquadBoard } from '../components/MatchSquadBoard';
import { MatchTimelineEditor } from '../components/MatchTimelineEditor';
import { SystemSelect } from '../components/SystemSelect';
import { CsvViewer } from '../components/CsvViewer';
import { sortMatchesDesc } from '../lib/stats';
import { useIsViewer } from '../lib/authContext';

// Campos que se editan en esta pantalla y se guardan juntos con un solo
// botón (el CSV se sube y quita por separado, al instante).
const EDITABLE: (keyof Match)[] = [
  'fecha',
  'oponente',
  'condicion',
  'golesFavor',
  'golesContra',
  'sistema',
  'sistemaOponente',
  'duracionMinutos',
  'competencia',
  'jornada',
  'notas',
  'notaTactica',
  'lineup',
  'substitutions',
  'events',
  'banca',
  'bajas',
];

function editableSnapshot(m: Match): string {
  return JSON.stringify(EDITABLE.map((k) => m[k] ?? null));
}

// Todo jugador activo que no esté en el XI, no haya entrado de cambio y no
// esté en la banca se considera "no citado" automáticamente: entra a esa
// lista sin que el analista tenga que agregarlo a mano, y sale de ahí solo
// con completar el XI o la banca. Se preservan el tipo/motivo ya editados
// para quienes sigan sin citar.
function syncBajas(match: Match, players: Player[]): Match {
  const citadoIds = new Set([
    ...match.lineup.map((l) => l.playerId),
    ...match.substitutions.map((s) => s.jugadorEntraId),
    ...match.banca,
  ]);
  const noCitadoIds = new Set(players.filter((p) => !citadoIds.has(p.id)).map((p) => p.id));
  const currentIds = new Set(match.bajas.map((b) => b.jugadorId));
  const sinCambios = noCitadoIds.size === currentIds.size && [...noCitadoIds].every((id) => currentIds.has(id));
  if (sinCambios) return match;

  const kept = match.bajas.filter((b) => noCitadoIds.has(b.jugadorId));
  const keptIds = new Set(kept.map((b) => b.jugadorId));
  const added: MatchBaja[] = [...noCitadoIds]
    .filter((id) => !keptIds.has(id))
    .map((id) => ({ id: Math.random().toString(36).slice(2, 10), jugadorId: id, tipo: 'desconocido', motivo: '' }));
  return { ...match, bajas: [...kept, ...added] };
}

function formatFecha(fecha: string): string {
  if (!fecha) return 'Sin fecha';
  const d = new Date(`${fecha}T12:00:00`);
  return Number.isNaN(d.getTime()) ? fecha : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MatchDetailPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const { matchId } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const isViewer = useIsViewer();

  const [match, setMatchState] = useState<Match | null>(null);
  const [saved, setSaved] = useState<Match | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showGeneral, setShowGeneral] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [uploading, setUploading] = useState(false);

  const setMatch = useCallback((m: Match) => setMatchState(syncBajas(m, rival.players)), [rival.players]);

  useEffect(() => {
    if (!matchId) return;
    api.matches
      .get(matchId)
      .then((m) => {
        const synced = syncBajas(m, rival.players);
        setMatchState(synced);
        // La lista automática de no citados no cuenta como cambio pendiente.
        setSaved(synced);
        setShowGeneral(!m.oponente);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const previousLineup = useMemo(() => {
    if (!match) return null;
    const prev = sortMatchesDesc(rival.matches).find((m) => m.id !== match.id && m.lineup.length > 0);
    return prev ? { fecha: prev.fecha, oponente: prev.oponente, lineup: prev.lineup } : null;
  }, [rival.matches, match]);

  // Jugadores citados a este partido (XI, banca o entraron de cambio): son
  // los únicos que tiene sentido poder marcar en un gol o tarjeta.
  const citados = useMemo(() => {
    if (!match) return [];
    const ids = new Set([...match.lineup.map((l) => l.playerId), ...match.substitutions.map((s) => s.jugadorEntraId), ...match.banca]);
    return rival.players.filter((p) => ids.has(p.id));
  }, [match, rival.players]);

  const dirty = !!match && !!saved && editableSnapshot(match) !== editableSnapshot(saved);

  const save = useCallback(async () => {
    if (!match || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = Object.fromEntries(EDITABLE.map((k) => [k, match[k]])) as Partial<Match>;
      const updated = syncBajas(await api.matches.update(match.id, payload), rival.players);
      setMatchState(updated);
      setSaved(updated);
      reload();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [match, saving, rival.players, reload]);

  // Aviso al cerrar/recargar con cambios sin guardar, y Ctrl/Cmd+S para guardar.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (isViewer) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save, isViewer]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!match) return <p className="text-sm text-slate-400">Cargando…</p>;

  const goBack = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar en este partido. ¿Salir igual?')) return;
    navigate(`/rivales/${rival.id}/partidos`);
  };

  const handleUpload = async (file: File) => {
    setCsvError('');
    setUploading(true);
    try {
      const csv = await api.matches.uploadCsv(match.id, file);
      setMatchState({ ...match, csv });
      if (saved) setSaved({ ...saved, csv });
    } catch (e) {
      setCsvError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const marcador = (n: number | null) => (n === null || n === undefined ? '–' : n);
  const detalles = [
    formatFecha(match.fecha),
    match.condicion,
    [match.jornada, match.competencia].filter(Boolean).join(' · '),
    match.sistema ? `${match.sistema}${match.sistemaOponente ? ` vs ${match.sistemaOponente}` : ''}` : '',
  ].filter(Boolean);

  return (
    <div className="space-y-4 pb-6">
      <button className="text-xs text-slate-400 hover:text-slate-600" onClick={goBack}>
        ← Volver a partidos
      </button>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 text-lg font-semibold text-slate-900">
            <span>{rival.nombre}</span>
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 tabular-nums">
              {marcador(match.golesFavor)} – {marcador(match.golesContra)}
            </span>
            <span className={match.oponente ? '' : 'text-slate-400 font-normal'}>{match.oponente || 'Oponente sin definir'}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
            {detalles.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <button className="btn-secondary ml-auto py-1 text-xs" onClick={() => setShowGeneral((v) => !v)}>
            {showGeneral ? 'Ocultar datos' : isViewer ? 'Ver datos' : 'Editar datos'}
          </button>
        </div>
        {!showGeneral && (match.notaTactica || match.notas) && (
          <p className="mt-2 text-xs text-slate-500">{match.notaTactica || match.notas}</p>
        )}
        {showGeneral && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <fieldset disabled={isViewer} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Fecha</label>
                <input
                  type="date"
                  className="input"
                  value={match.fecha}
                  onChange={(e) => setMatch({ ...match, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Oponente en este partido</label>
                <input
                  className="input"
                  value={match.oponente}
                  onChange={(e) => setMatch({ ...match, oponente: e.target.value })}
                  placeholder="Equipo contra el que jugó el rival"
                />
              </div>
              <div>
                <label className="label">Condición</label>
                <select
                  className="input"
                  value={match.condicion}
                  onChange={(e) => setMatch({ ...match, condicion: e.target.value as Match['condicion'] })}
                >
                  <option value="Local">Local</option>
                  <option value="Visitante">Visitante</option>
                </select>
              </div>
              <div>
                <label className="label">Sistema del oponente</label>
                <SystemSelect
                  value={match.sistemaOponente || ''}
                  onChange={(v) => setMatch({ ...match, sistemaOponente: v })}
                />
              </div>
              <div>
                <label className="label">Competencia</label>
                <input
                  className="input"
                  value={match.competencia}
                  onChange={(e) => setMatch({ ...match, competencia: e.target.value })}
                  placeholder="Torneo Nacional, Copa Chile…"
                  list="competencias-sugeridas"
                />
                <datalist id="competencias-sugeridas">
                  <option value="Torneo Nacional" />
                  <option value="Copa Chile" />
                  <option value="Copa Sudamericana" />
                  <option value="Copa Libertadores" />
                  <option value="Amistoso" />
                </datalist>
              </div>
              <div>
                <label className="label">Jornada / instancia</label>
                <input
                  className="input"
                  value={match.jornada}
                  onChange={(e) => setMatch({ ...match, jornada: e.target.value })}
                  placeholder="Fecha 22, 8vos de final…"
                />
              </div>
              <div>
                <label className="label">Goles rival</label>
                <input
                  type="number"
                  className="input"
                  value={match.golesFavor ?? ''}
                  onChange={(e) => setMatch({ ...match, golesFavor: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Goles del oponente</label>
                <input
                  type="number"
                  className="input"
                  value={match.golesContra ?? ''}
                  onChange={(e) => setMatch({ ...match, golesContra: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Duración (min)</label>
                <input
                  type="number"
                  className="input"
                  value={match.duracionMinutos}
                  onChange={(e) => setMatch({ ...match, duracionMinutos: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className="label">Notas (opcional)</label>
                <input className="input" value={match.notas || ''} onChange={(e) => setMatch({ ...match, notas: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className="label">Nota táctica (opcional)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={match.notaTactica || ''}
                  onChange={(e) => setMatch({ ...match, notaTactica: e.target.value })}
                  placeholder="Ej. 4-3-3 que con el pasar de los minutos termina en 4-2-3-1 con el lateral de carrilero"
                />
              </div>
            </fieldset>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold text-slate-900">XI y convocatoria</h2>
        <MatchSquadBoard
          players={rival.players}
          match={match}
          previousLineup={previousLineup}
          onChange={(patch) => setMatch({ ...match, ...patch })}
          readOnly={isViewer}
        />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Cronología</h2>
        <MatchTimelineEditor
          players={rival.players}
          citados={citados}
          match={match}
          onChange={(patch) => setMatch({ ...match, ...patch })}
          readOnly={isViewer}
        />
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">CSV de Sportscode</h2>
          {!isViewer && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <button className="btn-secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? 'Cargando…' : match.csv ? 'Reemplazar CSV' : 'Cargar CSV'}
              </button>
              {match.csv && (
                <button
                  className="btn-danger"
                  onClick={async () => {
                    await api.matches.removeCsv(match.id);
                    setMatch({ ...match, csv: null });
                  }}
                >
                  Quitar CSV
                </button>
              )}
            </div>
          )}
        </div>
        {csvError && <p className="text-sm text-red-600 mb-2">{csvError}</p>}
        {match.csv ? (
          <CsvViewer csv={match.csv} />
        ) : (
          <p className="text-sm text-slate-400">No se ha cargado un archivo CSV para este partido.</p>
        )}
      </section>
      {!isViewer && (
        <div
          className={`sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 shadow-sm ${
            dirty ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-sm ${saveError ? 'text-red-600' : dirty ? 'text-amber-700' : 'text-emerald-700'}`}>
            {saveError ? `No se pudo guardar: ${saveError}` : dirty ? 'Cambios sin guardar' : justSaved ? 'Guardado ✓' : 'Todo guardado'}
          </span>
          <div className="flex items-center gap-2">
            {dirty && (
              <button className="btn-secondary" onClick={() => saved && setMatchState(saved)} disabled={saving}>
                Descartar
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Guardando…' : 'Guardar partido'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
