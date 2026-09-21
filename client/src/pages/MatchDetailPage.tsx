import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { Match, MatchBaja } from '../types';
import { LineupEditor } from '../components/LineupEditor';
import { SubstitutionsEditor } from '../components/SubstitutionsEditor';
import { MatchEventsEditor } from '../components/MatchEventsEditor';
import { MatchBajasEditor } from '../components/MatchBajasEditor';
import { BancaEditor } from '../components/BancaEditor';
import { MatchPitchTimeline } from '../components/MatchPitchTimeline';
import { SystemSelect } from '../components/SystemSelect';
import { CsvViewer } from '../components/CsvViewer';
import { sortMatchesDesc } from '../lib/stats';

function SavedTick({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-xs text-emerald-700">Guardado ✓</span>;
}

export default function MatchDetailPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const { matchId } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState('');
  const [savedFlag, setSavedFlag] = useState<string | null>(null);
  const [csvError, setCsvError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    if (!matchId) return;
    api.matches.get(matchId).then(setMatch).catch((e) => setError(e.message));
  };

  useEffect(load, [matchId]);

  const previousLineup = useMemo(() => {
    if (!match) return null;
    const prev = sortMatchesDesc(rival.matches).find((m) => m.id !== match.id && m.lineup.length > 0);
    return prev ? { fecha: prev.fecha, oponente: prev.oponente, lineup: prev.lineup } : null;
  }, [rival.matches, match]);

  // Jugadores citados a este partido (XI, banca o entraron de cambio): son
  // los únicos que tiene sentido poder marcar en un gol o tarjeta.
  const citados = useMemo(() => {
    if (!match) return [];
    const ids = new Set([
      ...match.lineup.map((l) => l.playerId),
      ...match.substitutions.map((s) => s.jugadorEntraId),
      ...match.banca,
    ]);
    return rival.players.filter((p) => ids.has(p.id));
  }, [match?.lineup, match?.banca, match?.substitutions, rival.players]);

  // Todo jugador activo que no esté en el XI, no haya entrado de cambio y no
  // esté en la banca se considera "no citado" automáticamente: entra a esa
  // lista sin que el analista tenga que agregarlo a mano, y sale de ahí solo
  // con completar el XI o la banca. Se preservan el tipo/motivo ya editados
  // para quienes sigan sin citar.
  useEffect(() => {
    if (!match) return;
    const citadoIds = new Set([
      ...match.lineup.map((l) => l.playerId),
      ...match.substitutions.map((s) => s.jugadorEntraId),
      ...match.banca,
    ]);
    const noCitadoIds = new Set(rival.players.filter((p) => !p.baja && !citadoIds.has(p.id)).map((p) => p.id));

    const currentIds = new Set(match.bajas.map((b) => b.jugadorId));
    const sinCambios = noCitadoIds.size === currentIds.size && [...noCitadoIds].every((id) => currentIds.has(id));
    if (sinCambios) return;

    const kept = match.bajas.filter((b) => noCitadoIds.has(b.jugadorId));
    const keptIds = new Set(kept.map((b) => b.jugadorId));
    const added: MatchBaja[] = [...noCitadoIds]
      .filter((id) => !keptIds.has(id))
      .map((id) => ({ id: Math.random().toString(36).slice(2, 10), jugadorId: id, tipo: 'desconocido', motivo: '' }));

    setMatch({ ...match, bajas: [...kept, ...added] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.lineup, match?.banca, match?.substitutions, rival.players]);

  const flash = (key: string) => {
    setSavedFlag(key);
    setTimeout(() => setSavedFlag((k) => (k === key ? null : k)), 1500);
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!match) return <p className="text-sm text-slate-400">Cargando…</p>;

  const saveGeneral = async () => {
    const updated = await api.matches.update(match.id, {
      fecha: match.fecha,
      oponente: match.oponente,
      condicion: match.condicion,
      golesFavor: match.golesFavor,
      golesContra: match.golesContra,
      sistema: match.sistema,
      sistemaOponente: match.sistemaOponente,
      duracionMinutos: match.duracionMinutos,
      competencia: match.competencia,
      jornada: match.jornada,
      notas: match.notas,
      notaTactica: match.notaTactica,
    });
    setMatch(updated);
    reload();
    flash('general');
  };

  const saveLineup = async () => {
    const updated = await api.matches.update(match.id, { lineup: match.lineup });
    setMatch(updated);
    reload();
    flash('lineup');
  };

  const saveSubs = async () => {
    const updated = await api.matches.update(match.id, { substitutions: match.substitutions });
    setMatch(updated);
    reload();
    flash('subs');
  };

  const saveEvents = async () => {
    const updated = await api.matches.update(match.id, { events: match.events });
    setMatch(updated);
    reload();
    flash('events');
  };

  const saveConvocatoria = async () => {
    const updated = await api.matches.update(match.id, { banca: match.banca, bajas: match.bajas });
    setMatch(updated);
    reload();
    flash('convocatoria');
  };

  const handleUpload = async (file: File) => {
    setCsvError('');
    setUploading(true);
    try {
      const csv = await api.matches.uploadCsv(match.id, file);
      setMatch({ ...match, csv });
    } catch (e) {
      setCsvError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => navigate(`/rivales/${rival.id}/partidos`)}>
          ← Volver a partidos
        </button>
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Datos generales</h2>
          <SavedTick show={savedFlag === 'general'} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <label className="label">Sistema / formación</label>
            <SystemSelect value={match.sistema} onChange={(v) => setMatch({ ...match, sistema: v })} />
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
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveGeneral}>
            Guardar datos generales
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">XI inicial</h2>
          <SavedTick show={savedFlag === 'lineup'} />
        </div>
        <LineupEditor
          players={rival.players}
          lineup={match.lineup}
          system={match.sistema}
          previousLineup={previousLineup}
          onChange={(lineup) => setMatch({ ...match, lineup })}
        />
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveLineup}>
            Guardar XI
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Convocatoria</h2>
          <SavedTick show={savedFlag === 'convocatoria'} />
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Banca</h3>
            <BancaEditor
              players={rival.players}
              lineup={match.lineup}
              substitutions={match.substitutions}
              banca={match.banca}
              onChange={(banca) => setMatch({ ...match, banca })}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">No citados</h3>
            <p className="text-xs text-slate-400 -mt-1 mb-2">
              Se completa solo con quien no esté en el XI ni en la banca; para sacar a alguien de esta lista, agrégalo
              arriba o al XI.
            </p>
            <MatchBajasEditor players={rival.players} bajas={match.bajas} onChange={(bajas) => setMatch({ ...match, bajas })} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveConvocatoria}>
            Guardar convocatoria
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Sustituciones</h2>
          <SavedTick show={savedFlag === 'subs'} />
        </div>
        <p className="text-xs text-slate-400 -mt-2 mb-3">
          Puedes agregar más de una sustitución en el mismo minuto: en el campograma quedarán agrupadas en un solo hito.
        </p>
        <SubstitutionsEditor
          players={rival.players}
          lineup={match.lineup}
          substitutions={match.substitutions}
          banca={match.banca}
          events={match.events}
          onChange={(substitutions) => setMatch({ ...match, substitutions })}
        />
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveSubs}>
            Guardar sustituciones
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Campograma del partido</h2>
        </div>
        <MatchPitchTimeline match={match} players={rival.players} />
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Goles y tarjetas</h2>
          <SavedTick show={savedFlag === 'events'} />
        </div>
        <MatchEventsEditor
          players={citados}
          events={match.events}
          onChange={(events) => setMatch({ ...match, events })}
        />
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={saveEvents}>
            Guardar goles y tarjetas
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">CSV de Sportscode</h2>
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
        </div>
        {csvError && <p className="text-sm text-red-600 mb-2">{csvError}</p>}
        {match.csv ? (
          <CsvViewer csv={match.csv} />
        ) : (
          <p className="text-sm text-slate-400">No se ha cargado un archivo CSV para este partido.</p>
        )}
      </section>
    </div>
  );
}
