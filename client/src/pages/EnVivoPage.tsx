import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { Match, MatchEventType, Player, Substitution } from '../types';
import {
  gameStateAtMinute,
  lastN,
  combosPrediccion,
  topSistemasResultantesByState,
  cambioTrasTarjeta,
  sustitutosHistoricosDe,
  type GameState,
  type ComboPrediccion,
  type Counted,
} from '../lib/stats';
import { onFieldBefore } from '../lib/pitchLayout';
import { analyzePhase, OFFENSIVE_CATEGORIES, DEFENSIVE_CATEGORIES, type EstadoResumen } from '../lib/csvAnalysis';
import { LineupEditor } from '../components/LineupEditor';
import { BancaEditor } from '../components/BancaEditor';
import { SubstitutionsEditor } from '../components/SubstitutionsEditor';
import { MatchEventsEditor } from '../components/MatchEventsEditor';
import { SystemSelect } from '../components/SystemSelect';
import { PositionSelect } from '../components/PositionSelect';
import { Pitch, type PitchToken } from '../components/Pitch';
import { playerName } from '../lib/lookup';
import { useIsViewer } from '../lib/authContext';

const ESTADO_STYLE: Record<GameState, string> = {
  Ganando: 'text-emerald-700',
  Empatando: 'text-amber-700',
  Perdiendo: 'text-red-700',
};

const N_PARTIDOS_HISTORIAL = 10;

export default function EnVivoPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const isViewer = useIsViewer();

  const liveMatch = rival.matches.find((m) => m.enVivo) || null;

  // Base histórica para las predicciones: todo MENOS el partido en vivo (no
  // tendría sentido predecir en base a sus propios datos, todavía
  // incompletos), ventaneado igual que el resto de la app.
  const historial = useMemo(
    () => lastN(rival.matches.filter((m) => !m.enVivo), N_PARTIDOS_HISTORIAL),
    [rival.matches]
  );

  if (!liveMatch) {
    return <SetupPartidoEnVivo rivalId={rival.id} isViewer={isViewer} onCreated={reload} />;
  }

  return (
    <PartidoEnVivo
      match={liveMatch}
      rivalId={rival.id}
      players={rival.players}
      historial={historial}
      reload={reload}
      isViewer={isViewer}
    />
  );
}

function SetupPartidoEnVivo({
  rivalId,
  isViewer,
  onCreated,
}: {
  rivalId: string;
  isViewer: boolean;
  onCreated: () => void;
}) {
  const [condicion, setCondicion] = useState<'Local' | 'Visitante'>('Local');
  const [creating, setCreating] = useState(false);

  const iniciar = async () => {
    setCreating(true);
    try {
      await api.matches.create(rivalId, {
        fecha: new Date().toISOString().slice(0, 10),
        condicion,
        duracionMinutos: 90,
        enVivo: true,
      });
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  if (isViewer) {
    return <p className="text-sm text-slate-400 py-10 text-center">No hay ningún partido en vivo en este momento.</p>;
  }

  return (
    <div className="card p-6 max-w-md mx-auto text-center space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Nuevo partido en vivo</h2>
      <p className="text-sm text-slate-500">
        Primero cargas el XI y la convocatoria; cuando arranca el partido, tocas "Iniciar" y el cronómetro corre solo.
      </p>
      <div className="text-left">
        <label className="label">Condición</label>
        <select className="input" value={condicion} onChange={(e) => setCondicion(e.target.value as 'Local' | 'Visitante')}>
          <option value="Local">Local</option>
          <option value="Visitante">Visitante</option>
        </select>
      </div>
      <button className="btn-primary w-full" disabled={creating} onClick={iniciar}>
        {creating ? 'Creando…' : 'Crear partido'}
      </button>
    </div>
  );
}

// Sondeo periódico para quien solo mira (no edita): así ve avanzar el
// cronómetro y aparecer goles/tarjetas/cambios que carga otra persona desde
// otro dispositivo, sin tener que recargar la página a mano. Quien edita no
// lo necesita — sus propias acciones ya actualizan localMatch al toque, y
// pisar localMatch con lo del servidor cada tanto podría perder algo que
// todavía no guardó (ver el comentario de más abajo sobre por qué localMatch
// no se resincroniza en cada reload()).
const POLL_MS = 10000;

function PartidoEnVivo({
  match,
  rivalId,
  players,
  historial,
  reload,
  isViewer,
}: {
  match: Match;
  rivalId: string;
  players: Player[];
  historial: Match[];
  reload: () => void;
  isViewer: boolean;
}) {
  const navigate = useNavigate();
  const [localMatch, setLocalMatch] = useState<Match>(match);
  // Solo se resincroniza si cambia DE partido (id), no en cada `reload()` del
  // rival: si no, guardar una sección pisaría ediciones sin guardar en otra,
  // porque `match` llega de `rival.matches` y cambia de referencia cada vez
  // que el contexto recarga.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLocalMatch(match), [match.id]);

  // El cronómetro vive en el servidor (localMatch.cronometroBaseMs /
  // cronometroRunningSince), no en localStorage: así cualquier dispositivo
  // que abra este partido —incluso un viewer de solo lectura— calcula el
  // mismo minuto actual. `now` solo se usa para que el minuto siga
  // avanzando en pantalla entre sondeos, con matemática local (no hace
  // falta pedirle la hora al servidor en cada tick).
  const [now, setNow] = useState(Date.now());
  const started = localMatch.cronometroBaseMs != null;
  const pausado = started && !localMatch.cronometroRunningSince;
  useEffect(() => {
    if (!started || pausado) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [started, pausado]);

  const elapsedMs = started
    ? (localMatch.cronometroBaseMs || 0) +
      (localMatch.cronometroRunningSince ? now - new Date(localMatch.cronometroRunningSince).getTime() : 0)
    : 0;
  const minutoActual = started ? Math.max(1, Math.floor(elapsedMs / 60000) + 1) : 1;

  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  const guardarRapido = async (patch: Partial<Match>) => {
    const updated = await api.matches.update(localMatch.id, patch);
    setLocalMatch(updated);
    reload();
  };

  // Sondeo periódico para quien solo mira (ver POLL_MS más arriba): pisa
  // localMatch entero porque un viewer nunca tiene ediciones propias sin
  // guardar que proteger, a diferencia de quien edita.
  useEffect(() => {
    if (!isViewer) return;
    const id = setInterval(() => {
      api.matches.get(localMatch.id).then(setLocalMatch).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isViewer, localMatch.id]);

  const pausarCronometro = () => {
    if (!started || pausado) return;
    guardarRapido({ cronometroBaseMs: elapsedMs, cronometroRunningSince: null });
  };
  const reanudarCronometro = () => {
    if (!started || !pausado) return;
    guardarRapido({ cronometroRunningSince: new Date().toISOString() });
  };
  const ajustarMinuto = (nuevoMinuto: number) =>
    guardarRapido({
      cronometroBaseMs: Math.max(0, nuevoMinuto - 1) * 60000,
      cronometroRunningSince: pausado ? null : new Date().toISOString(),
    });

  const iniciarPartido = async () => {
    setSavingSetup(true);
    try {
      const updated = await api.matches.update(localMatch.id, {
        sistema: localMatch.sistema,
        lineup: localMatch.lineup,
        banca: localMatch.banca,
        cronometroBaseMs: 0,
        cronometroRunningSince: new Date().toISOString(),
      });
      setLocalMatch(updated);
      reload();
    } finally {
      setSavingSetup(false);
    }
  };

  // Campograma actual (aplicando todos los cambios ya registrados): quién
  // está en cancha ahora mismo y en qué posición, para las listas rápidas de
  // "sale"/"entra" y la posición por defecto de cada uno.
  const currentLayout = useMemo(() => onFieldBefore(localMatch, Infinity), [localMatch]);
  const enCanchaIds = useMemo(() => new Set(currentLayout.map((l) => l.playerId)), [currentLayout]);
  const enCancha = useMemo(() => players.filter((p) => enCanchaIds.has(p.id)), [players, enCanchaIds]);
  const bancaDisponible = useMemo(
    () => players.filter((p) => localMatch.banca.includes(p.id) && !enCanchaIds.has(p.id)),
    [players, localMatch.banca, enCanchaIds]
  );
  const posicionActual = (playerId: string) => currentLayout.find((l) => l.playerId === playerId)?.posicion || '';

  // Campograma visual (de solo lectura acá — se edita desde "Editar en
  // detalle" o QuickActions, no arrastrando estos tokens): quién está en
  // cancha ahora mismo, para verlo de un vistazo tanto quien edita como
  // quien solo mira.
  const currentPitchTokens: PitchToken[] = useMemo(
    () =>
      currentLayout.map((l) => ({
        key: l.playerId,
        x: l.x ?? 50,
        y: l.y ?? 50,
        posicion: l.posicion,
        player: players.find((p) => p.id === l.playerId),
      })),
    [currentLayout, players]
  );

  // Jugadores marcados con problemas físicos durante el partido (solo en
  // pantalla, no se guarda en el partido): sirve para preguntar "¿quién
  // suele reemplazarlo?" antes de que el cambio táctico normal lo sugiera.
  // Se limpia solo a quien ya salió de la cancha (marca obsoleta).
  const [lesionados, setLesionados] = useState<Set<string>>(new Set());
  useEffect(() => {
    setLesionados((prev) => {
      const next = new Set([...prev].filter((id) => enCanchaIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [enCanchaIds]);
  const marcarLesionado = (playerId: string) => setLesionados((prev) => new Set(prev).add(playerId));
  const quitarLesionado = (playerId: string) =>
    setLesionados((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });

  // Citados a este partido (XI, banca, o entraron de cambio): son los únicos
  // que tiene sentido poder marcar en un gol o tarjeta.
  const citados = useMemo(() => {
    const ids = new Set([
      ...localMatch.lineup.map((l) => l.playerId),
      ...localMatch.substitutions.map((s) => s.jugadorEntraId),
      ...localMatch.banca,
    ]);
    return players.filter((p) => ids.has(p.id));
  }, [localMatch.lineup, localMatch.banca, localMatch.substitutions, players]);

  const golesFavor = localMatch.events.filter((e) => e.tipo === 'gol_favor').length;
  const golesContra = localMatch.events.filter((e) => e.tipo === 'gol_contra').length;
  const estadoActual = useMemo(() => gameStateAtMinute(localMatch, minutoActual), [localMatch, minutoActual]);

  const combosTodos = useMemo(() => combosPrediccion(historial, estadoActual), [historial, estadoActual]);
  const bancaDisponibleIds = useMemo(() => new Set(bancaDisponible.map((p) => p.id)), [bancaDisponible]);
  // Cualquiera que ya haya entrado o salido en un cambio de ESTE partido no
  // vuelve a participar de las predicciones (ni como el que sale ni como el
  // que entra): un cambio ya hecho no es un cambio "por venir".
  const yaParticipoEnCambio = useMemo(() => {
    const ids = new Set<string>();
    for (const s of localMatch.substitutions) {
      ids.add(s.jugadorSaleId);
      ids.add(s.jugadorEntraId);
    }
    return ids;
  }, [localMatch.substitutions]);
  // Solo combinaciones donde quien "sale" está efectivamente en cancha ahora
  // Y quien "entra" está disponible en la banca de hoy (no sirve sugerir a
  // alguien ni siquiera convocado), sin nadie que ya haya participado de un
  // cambio, y que se hayan repetido más de una vez: mejor mostrar menos
  // combinaciones que rellenar con casos de una sola vez.
  const combosRelevantes = useMemo(
    () =>
      combosTodos
        .filter(
          (c) =>
            enCanchaIds.has(c.jugadorSaleId) &&
            bancaDisponibleIds.has(c.jugadorEntraId) &&
            !yaParticipoEnCambio.has(c.jugadorSaleId) &&
            !yaParticipoEnCambio.has(c.jugadorEntraId) &&
            c.count > 1
        )
        .slice(0, 3),
    [combosTodos, enCanchaIds, bancaDisponibleIds, yaParticipoEnCambio]
  );

  // Para cada jugador marcado con problemas físicos, quién lo ha
  // reemplazado antes (sin filtrar por estado del partido: una lesión no
  // depende de si el rival va ganando o perdiendo), solo entre quienes
  // están disponibles en la banca de hoy.
  const sugerenciasLesion = useMemo(
    () =>
      [...lesionados].map((jugadorId) => ({
        jugadorId,
        sugerencias: sustitutosHistoricosDe(historial, jugadorId)
          .filter((c) => bancaDisponibleIds.has(c.item))
          .slice(0, 3),
      })),
    [lesionados, historial, bancaDisponibleIds]
  );
  // Un "cambio" de sistema no puede sugerir el mismo sistema con el que ya
  // están jugando ahora mismo.
  const sistemasProbables = useMemo(
    () =>
      topSistemasResultantesByState(historial, estadoActual)
        .filter((s) => s.item !== localMatch.sistema)
        .slice(0, 3),
    [historial, estadoActual, localMatch.sistema]
  );
  const tarjetaStat = useMemo(() => cambioTrasTarjeta(historial), [historial]);
  const ultimaAmarillaSinSalir = useMemo(() => {
    const salieron = new Set(localMatch.substitutions.map((s) => s.jugadorSaleId));
    return [...localMatch.events]
      .filter((e) => e.tipo === 'amarilla' && e.jugadorId && !salieron.has(e.jugadorId))
      .sort((a, b) => b.minuto - a.minuto)[0];
  }, [localMatch.events, localMatch.substitutions]);

  const situOfensivas = useMemo(
    () =>
      analyzePhase(historial, OFFENSIVE_CATEGORIES, [{ titulo: 'Circulación', columnas: ['Situaciones de circulacion'] }])
        .porEstado.find((r) => r.estado === estadoActual) || null,
    [historial, estadoActual]
  );
  const situDefensivas = useMemo(
    () =>
      analyzePhase(historial, DEFENSIVE_CATEGORIES, [{ titulo: 'Presión', columnas: ['Situaciones de presion'] }])
        .porEstado.find((r) => r.estado === estadoActual) || null,
    [historial, estadoActual]
  );

  const finalizar = async () => {
    setFinalizando(true);
    try {
      await api.matches.update(localMatch.id, {
        enVivo: false,
        golesFavor,
        golesContra,
        cronometroBaseMs: null,
        cronometroRunningSince: null,
      });
      reload();
      navigate(`/rivales/${rivalId}/partidos/${localMatch.id}`);
    } finally {
      setFinalizando(false);
    }
  };

  if (!started) {
    return (
      <div className="space-y-6 pb-16">
        <section className="card p-4">
          <h2 className="font-semibold text-slate-900 mb-3">XI inicial y convocatoria</h2>
          <div className="mb-4 max-w-xs">
            <label className="label">Sistema / formación</label>
            <SystemSelect value={localMatch.sistema} onChange={(v) => setLocalMatch({ ...localMatch, sistema: v })} />
          </div>
          <div className="space-y-4">
            <LineupEditor
              players={players}
              lineup={localMatch.lineup}
              system={localMatch.sistema}
              onChange={(lineup) => setLocalMatch({ ...localMatch, lineup })}
              readOnly={isViewer}
            />
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Banca</h3>
              <BancaEditor
                players={players}
                lineup={localMatch.lineup}
                substitutions={localMatch.substitutions}
                banca={localMatch.banca}
                onChange={(banca) => setLocalMatch({ ...localMatch, banca })}
                readOnly={isViewer}
              />
            </div>
          </div>
          {!isViewer && (
            <div className="flex justify-end mt-4">
              <button className="btn-primary" disabled={savingSetup} onClick={iniciarPartido}>
                {savingSetup ? 'Guardando…' : '▶ Iniciar partido'}
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <section className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">En vivo · {localMatch.condicion}</p>
          <p className="text-2xl font-bold text-slate-900 leading-none">
            {golesFavor} - {golesContra}
            <span className={`ml-2 text-sm font-semibold ${ESTADO_STYLE[estadoActual]}`}>{estadoActual}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="input w-16 text-center"
            value={minutoActual}
            onChange={(e) => ajustarMinuto(Number(e.target.value))}
            title="Ajustar minuto (ej. después del entretiempo)"
          />
          <span className="text-xs text-slate-400">{pausado ? 'min. (pausado)' : 'min. (corre solo)'}</span>
          {!isViewer &&
            (pausado ? (
              <button className="btn-secondary" onClick={reanudarCronometro}>
                ▶ Reanudar
              </button>
            ) : (
              <button className="btn-secondary" onClick={pausarCronometro}>
                ⏸ Entretiempo
              </button>
            ))}
        </div>
        {!isViewer && (
          <button className="btn-primary" disabled={finalizando} onClick={finalizar}>
            {finalizando ? 'Finalizando…' : 'Finalizar partido'}
          </button>
        )}
      </section>

      <section className="card p-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Campograma actual</h3>
        <Pitch tokens={currentPitchTokens} height={360} />
      </section>

      <PrediccionesPanel
        estado={estadoActual}
        combos={combosRelevantes}
        sistemas={sistemasProbables}
        tarjetaStat={tarjetaStat}
        alertaTarjeta={ultimaAmarillaSinSalir}
        situOfensivas={situOfensivas}
        situDefensivas={situDefensivas}
        players={players}
      />

      {sugerenciasLesion.length > 0 && (
        <LesionadosPanel sugerencias={sugerenciasLesion} players={players} onQuitar={quitarLesionado} isViewer={isViewer} />
      )}

      {!isViewer && (
        <QuickActions
          minutoActual={minutoActual}
          localMatch={localMatch}
          enCancha={enCancha}
          bancaDisponible={bancaDisponible}
          posicionActual={posicionActual}
          guardarRapido={guardarRapido}
          players={players}
          lesionados={lesionados}
          marcarLesionado={marcarLesionado}
        />
      )}

      <RegistroCompacto localMatch={localMatch} players={players} />

      <section className="card p-3">
        <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setDetalleAbierto((v) => !v)}>
          {detalleAbierto ? '▾' : '▸'} Editar en detalle (XI, campograma de cambios, correcciones)
        </button>
        {detalleAbierto && (
          <div className="space-y-6 mt-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">XI y convocatoria</h3>
              <div className="mb-3 max-w-xs">
                <label className="label">Sistema / formación</label>
                <SystemSelect value={localMatch.sistema} onChange={(v) => setLocalMatch({ ...localMatch, sistema: v })} />
              </div>
              <LineupEditor
                players={players}
                lineup={localMatch.lineup}
                system={localMatch.sistema}
                onChange={(lineup) => setLocalMatch({ ...localMatch, lineup })}
                readOnly={isViewer}
              />
              <BancaEditor
                players={players}
                lineup={localMatch.lineup}
                substitutions={localMatch.substitutions}
                banca={localMatch.banca}
                onChange={(banca) => setLocalMatch({ ...localMatch, banca })}
                readOnly={isViewer}
              />
              {!isViewer && (
                <div className="flex justify-end mt-2">
                  <button
                    className="btn-primary"
                    onClick={() => guardarRapido({ sistema: localMatch.sistema, lineup: localMatch.lineup, banca: localMatch.banca })}
                  >
                    Guardar XI y convocatoria
                  </button>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Goles y tarjetas</h3>
              <MatchEventsEditor
                players={citados}
                events={localMatch.events}
                onChange={(events) => setLocalMatch({ ...localMatch, events })}
                readOnly={isViewer}
              />
              {!isViewer && (
                <div className="flex justify-end mt-2">
                  <button className="btn-primary" onClick={() => guardarRapido({ events: localMatch.events })}>
                    Guardar goles y tarjetas
                  </button>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Sustituciones</h3>
              <p className="text-xs text-slate-400 -mt-1 mb-2">
                Acá podés ajustar el campograma resultante de cada cambio (ej. quién más se mueve de posición): esa
                info queda guardada y alimenta las predicciones de futuros partidos en vivo.
              </p>
              <SubstitutionsEditor
                players={players}
                lineup={localMatch.lineup}
                substitutions={localMatch.substitutions}
                banca={localMatch.banca}
                events={localMatch.events}
                onChange={(substitutions) => setLocalMatch({ ...localMatch, substitutions })}
                readOnly={isViewer}
              />
              {!isViewer && (
                <div className="flex justify-end mt-2">
                  <button className="btn-primary" onClick={() => guardarRapido({ substitutions: localMatch.substitutions })}>
                    Guardar sustituciones
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type QuickAction = 'gol_favor' | 'gol_contra' | 'amarilla' | 'roja' | 'cambio' | 'lesion' | null;

function QuickActions({
  minutoActual,
  localMatch,
  enCancha,
  bancaDisponible,
  posicionActual,
  guardarRapido,
  players,
  lesionados,
  marcarLesionado,
}: {
  minutoActual: number;
  localMatch: Match;
  enCancha: Player[];
  bancaDisponible: Player[];
  posicionActual: (playerId: string) => string;
  guardarRapido: (patch: Partial<Match>) => Promise<void>;
  players: Player[];
  lesionados: Set<string>;
  marcarLesionado: (playerId: string) => void;
}) {
  const [accion, setAccion] = useState<QuickAction>(null);
  const [jugadorId, setJugadorId] = useState('');
  const [jugadorEntraId, setJugadorEntraId] = useState('');
  const [posicionEntra, setPosicionEntra] = useState('');
  const [saving, setSaving] = useState(false);

  const abrir = (a: QuickAction) => {
    setAccion(a);
    setJugadorId('');
    setJugadorEntraId('');
    setPosicionEntra('');
  };
  const cancelar = () => setAccion(null);

  const confirmarEvento = async (tipo: MatchEventType) => {
    setSaving(true);
    try {
      const events = [
        ...localMatch.events,
        { id: Math.random().toString(36).slice(2, 10), minuto: minutoActual, tipo, jugadorId: jugadorId || undefined },
      ];
      await guardarRapido({ events });
      setAccion(null);
    } finally {
      setSaving(false);
    }
  };

  const confirmarCambio = async () => {
    if (!jugadorId || !jugadorEntraId) return;
    setSaving(true);
    try {
      const sub: Substitution = {
        id: Math.random().toString(36).slice(2, 10),
        minuto: minutoActual,
        jugadorSaleId: jugadorId,
        jugadorEntraId,
        posicionSale: posicionActual(jugadorId),
        posicionEntra: posicionEntra || posicionActual(jugadorId),
      };
      await guardarRapido({ substitutions: [...localMatch.substitutions, sub] });
      setAccion(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => abrir('gol_favor')}>
          ⚽ Gol rival
        </button>
        <button className="btn-secondary" onClick={() => abrir('gol_contra')}>
          ⚽ Gol oponente
        </button>
        <button className="btn-secondary" onClick={() => abrir('amarilla')}>
          🟨 Amarilla
        </button>
        <button className="btn-secondary" onClick={() => abrir('roja')}>
          🟥 Roja
        </button>
        <button className="btn-secondary" onClick={() => abrir('cambio')}>
          🔄 Cambio
        </button>
        <button className="btn-secondary" onClick={() => abrir('lesion')}>
          🩹 Problema físico
        </button>
      </div>

      {accion && (
        <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
          {accion === 'gol_contra' ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">Gol en contra al minuto {minutoActual}'.</p>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={cancelar}>
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving} onClick={() => confirmarEvento('gol_contra')}>
                  Confirmar
                </button>
              </div>
            </div>
          ) : accion === 'cambio' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">Sale</label>
                  <select className="input" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {enCancha.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.dorsal ? `#${p.dorsal} ` : ''}
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Entra</label>
                  <select className="input" value={jugadorEntraId} onChange={(e) => setJugadorEntraId(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {bancaDisponible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.dorsal ? `#${p.dorsal} ` : ''}
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Posición de quien entra</label>
                  <PositionSelect
                    value={posicionEntra || posicionActual(jugadorId)}
                    onChange={setPosicionEntra}
                    allowEmpty={false}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={cancelar}>
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving || !jugadorId || !jugadorEntraId} onClick={confirmarCambio}>
                  Confirmar cambio
                </button>
              </div>
            </div>
          ) : accion === 'lesion' ? (
            <div className="space-y-2">
              <label className="label">¿Quién tiene problemas físicos?</label>
              <select className="input" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)}>
                <option value="">Seleccionar…</option>
                {enCancha
                  .filter((p) => !lesionados.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.dorsal ? `#${p.dorsal} ` : ''}
                      {p.nombre}
                    </option>
                  ))}
              </select>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={cancelar}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  disabled={!jugadorId}
                  onClick={() => {
                    marcarLesionado(jugadorId);
                    setAccion(null);
                  }}
                >
                  Marcar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="label">Jugador</label>
              <select className="input" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)}>
                <option value="">Seleccionar…</option>
                {enCancha.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dorsal ? `#${p.dorsal} ` : ''}
                    {p.nombre}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={cancelar}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  disabled={saving || !jugadorId}
                  onClick={() => confirmarEvento(accion as MatchEventType)}
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {players.length === 0 && null}
    </section>
  );
}

function RegistroCompacto({ localMatch, players }: { localMatch: Match; players: Player[] }) {
  const items = [
    ...localMatch.events.map((e) => ({
      minuto: e.minuto,
      texto: `${e.tipo === 'gol_favor' ? '⚽' : e.tipo === 'gol_contra' ? '⚽ (oponente)' : e.tipo === 'amarilla' ? '🟨' : '🟥'} ${
        e.jugadorId ? playerName(players, e.jugadorId) : ''
      }`,
    })),
    ...localMatch.substitutions.map((s) => ({
      minuto: s.minuto,
      texto: `🔄 ${playerName(players, s.jugadorSaleId)} → ${playerName(players, s.jugadorEntraId)}`,
    })),
  ].sort((a, b) => b.minuto - a.minuto);

  if (items.length === 0) return null;

  return (
    <section className="card p-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Registro del partido</h3>
      <ul className="text-sm text-slate-700 space-y-0.5 max-h-40 overflow-y-auto">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-400 w-8 shrink-0">{it.minuto}'</span>
            <span>{it.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LesionadosPanel({
  sugerencias,
  players,
  onQuitar,
  isViewer,
}: {
  sugerencias: { jugadorId: string; sugerencias: Counted<string>[] }[];
  players: Player[];
  onQuitar: (playerId: string) => void;
  isViewer: boolean;
}) {
  return (
    <section className="card p-3 bg-amber-50/60 border-amber-200">
      <h3 className="text-xs font-semibold text-amber-700 uppercase mb-2">🩹 Con problemas físicos</h3>
      <ul className="space-y-2">
        {sugerencias.map(({ jugadorId, sugerencias: subs }) => (
          <li key={jugadorId} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{playerName(players, jugadorId)}</span>
              {!isViewer && (
                <button className="text-xs text-slate-500 hover:underline" onClick={() => onQuitar(jugadorId)}>
                  Quitar
                </button>
              )}
            </div>
            {subs.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos históricos de quién lo reemplaza.</p>
            ) : (
              <p className="text-xs text-slate-600">
                Posible entra: {subs.map((s) => `${playerName(players, s.item)} (${s.count})`).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrediccionesPanel({
  estado,
  combos,
  sistemas,
  tarjetaStat,
  alertaTarjeta,
  situOfensivas,
  situDefensivas,
  players,
}: {
  estado: GameState;
  combos: ComboPrediccion[];
  sistemas: ReturnType<typeof topSistemasResultantesByState>;
  tarjetaStat: ReturnType<typeof cambioTrasTarjeta>;
  alertaTarjeta: Match['events'][number] | undefined;
  situOfensivas: EstadoResumen | null;
  situDefensivas: EstadoResumen | null;
  players: Player[];
}) {
  const sinDatos = combos.length === 0 && sistemas.length === 0 && !situOfensivas && !situDefensivas;

  return (
    <section className="card p-3 bg-emerald-50/40 border-emerald-200">
      <h2 className="font-semibold text-slate-900 mb-1">Predicciones — estado actual: {estado}</h2>
      <p className="text-xs text-slate-500 mb-3">
        Basadas en los últimos {N_PARTIDOS_HISTORIAL} partidos analizados de este rival, filtrando por lo que suele
        pasar cuando va {estado.toLowerCase()}.
      </p>

      {alertaTarjeta && alertaTarjeta.jugadorId && tarjetaStat.totalTarjetas > 0 && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>{playerName(players, alertaTarjeta.jugadorId)}</strong> está amonestado (min. {alertaTarjeta.minuto}
          '). Históricamente sale de cambio el {tarjetaStat.pct}% de las veces
          {tarjetaStat.minutoPromedioCambio !== null && `, en promedio ${Math.round(tarjetaStat.minutoPromedioCambio)}' después`}.
        </div>
      )}

      {sinDatos ? (
        <p className="text-sm text-slate-400">Sin suficientes datos históricos para este estado todavía.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Próximo cambio probable</h3>
            {combos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cambios que se repitan con los jugadores citados hoy.</p>
            ) : (
              <ul className="text-sm text-slate-700 space-y-1.5">
                {combos.map((c) => (
                  <li key={`${c.jugadorSaleId}-${c.jugadorEntraId}`}>
                    <div>
                      {playerName(players, c.jugadorSaleId)} → {playerName(players, c.jugadorEntraId)} ({c.count}, min. ~
                      {Math.round(c.minutoPromedio)}')
                    </div>
                    {c.cambioAsociado && (
                      <div className="text-xs text-slate-500">
                        {playerName(players, c.cambioAsociado.playerId)} pasa a {c.cambioAsociado.posicionDespues}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Cambio de sistema probable</h3>
            {sistemas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <ul className="text-sm text-slate-700 space-y-1">
                {sistemas.map((s) => (
                  <li key={s.item}>
                    {s.item} ({s.count})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Situaciones a vigilar</h3>
            {!situOfensivas && !situDefensivas ? (
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <ul className="text-sm text-slate-700 space-y-1">
                {situOfensivas?.situacionesTop.map((s) => (
                  <li key={`of-${s.tag}`}>
                    {s.tag} ({s.pct}%)
                  </li>
                ))}
                {situDefensivas?.situacionesTop.map((s) => (
                  <li key={`def-${s.tag}`}>
                    {s.tag} ({s.pct}%)
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
