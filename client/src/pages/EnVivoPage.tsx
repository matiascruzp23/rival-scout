import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import { api } from '../api';
import type { Match, Player } from '../types';
import {
  gameStateAtMinute,
  lastN,
  minutoPromedioPorEstado,
  topCombosByState,
  topSistemasResultantesByState,
  cambioTrasTarjeta,
  type GameState,
  type Counted,
  type SaleEntraCombo,
} from '../lib/stats';
import { analyzePhase, OFFENSIVE_CATEGORIES, DEFENSIVE_CATEGORIES, type EstadoResumen } from '../lib/csvAnalysis';
import { LineupEditor } from '../components/LineupEditor';
import { BancaEditor } from '../components/BancaEditor';
import { SubstitutionsEditor } from '../components/SubstitutionsEditor';
import { MatchEventsEditor } from '../components/MatchEventsEditor';
import { SystemSelect } from '../components/SystemSelect';
import { playerMap, playerName } from '../lib/lookup';
import { useIsViewer } from '../lib/authContext';

const ESTADO_STYLE: Record<GameState, string> = {
  Ganando: 'text-emerald-700',
  Empatando: 'text-amber-700',
  Perdiendo: 'text-red-700',
};

export default function EnVivoPage() {
  const { rival, reload } = useOutletContext<RivalContext>();
  const isViewer = useIsViewer();

  const liveMatch = rival.matches.find((m) => m.enVivo) || null;

  // Base histórica para las predicciones: todo MENOS el partido en vivo (no
  // tendría sentido predecir en base a sus propios datos, todavía
  // incompletos), ventaneado igual que el resto de la app.
  const historial = useMemo(() => lastN(rival.matches.filter((m) => !m.enVivo), 10), [rival.matches]);

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
      <h2 className="text-lg font-semibold text-slate-900">Iniciar partido en vivo</h2>
      <p className="text-sm text-slate-500">
        Carga el XI y la convocatoria antes del arranque; a medida que registras goles, tarjetas y cambios vas viendo
        predicciones basadas en cómo suele reaccionar el rival, según el historial ya analizado.
      </p>
      <div className="text-left">
        <label className="label">Condición</label>
        <select className="input" value={condicion} onChange={(e) => setCondicion(e.target.value as 'Local' | 'Visitante')}>
          <option value="Local">Local</option>
          <option value="Visitante">Visitante</option>
        </select>
      </div>
      <button className="btn-primary w-full" disabled={creating} onClick={iniciar}>
        {creating ? 'Creando…' : 'Iniciar partido en vivo'}
      </button>
    </div>
  );
}

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
  // rival: si no, guardar una sección (ej. XI) pisaría ediciones sin guardar
  // en otra (ej. un evento recién agregado), porque `match` llega de
  // `rival.matches` y cambia de referencia cada vez que el contexto recarga.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLocalMatch(match), [match.id]);
  const [minutoActual, setMinutoActual] = useState(1);
  const [savedFlag, setSavedFlag] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);

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

  const combosProbables = useMemo(() => topCombosByState(historial, estadoActual).slice(0, 3), [historial, estadoActual]);
  const minutoPromedioCambio = useMemo(() => minutoPromedioPorEstado(historial, estadoActual), [historial, estadoActual]);
  const sistemasProbables = useMemo(
    () => topSistemasResultantesByState(historial, estadoActual).slice(0, 3),
    [historial, estadoActual]
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

  const flash = (key: string) => {
    setSavedFlag(key);
    setTimeout(() => setSavedFlag((k) => (k === key ? null : k)), 1500);
  };

  const save = async (patch: Partial<Match>, key: string) => {
    const updated = await api.matches.update(localMatch.id, patch);
    setLocalMatch(updated);
    reload();
    flash(key);
  };

  const finalizar = async () => {
    setFinalizando(true);
    try {
      await api.matches.update(localMatch.id, { enVivo: false, golesFavor, golesContra });
      reload();
      navigate(`/rivales/${rivalId}/partidos/${localMatch.id}`);
    } finally {
      setFinalizando(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <section className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">En vivo · {localMatch.condicion}</p>
          <p className="text-3xl font-bold text-slate-900">
            {golesFavor} - {golesContra}
          </p>
          <p className={`text-sm font-semibold ${ESTADO_STYLE[estadoActual]}`}>{estadoActual}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Minuto actual</label>
            <input
              type="number"
              className="input w-24"
              value={minutoActual}
              onChange={(e) => setMinutoActual(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <button className="btn-secondary" onClick={() => setMinutoActual((m) => m + 1)}>
            +1'
          </button>
        </div>
        {!isViewer && (
          <button className="btn-primary" disabled={finalizando} onClick={finalizar}>
            {finalizando ? 'Finalizando…' : 'Finalizar partido'}
          </button>
        )}
      </section>

      <PrediccionesPanel
        estado={estadoActual}
        combos={combosProbables}
        minutoPromedioCambio={minutoPromedioCambio}
        sistemas={sistemasProbables}
        tarjetaStat={tarjetaStat}
        alertaTarjeta={ultimaAmarillaSinSalir}
        situOfensivas={situOfensivas}
        situDefensivas={situDefensivas}
        players={players}
      />

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">XI inicial y convocatoria</h2>
          {savedFlag === 'setup' && <span className="text-xs text-emerald-700">Guardado ✓</span>}
        </div>
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
          <div className="flex justify-end mt-3">
            <button
              className="btn-primary"
              onClick={() => save({ sistema: localMatch.sistema, lineup: localMatch.lineup, banca: localMatch.banca }, 'setup')}
            >
              Guardar XI y convocatoria
            </button>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Goles y tarjetas</h2>
          {savedFlag === 'events' && <span className="text-xs text-emerald-700">Guardado ✓</span>}
        </div>
        <MatchEventsEditor
          players={citados}
          events={localMatch.events}
          onChange={(events) => setLocalMatch({ ...localMatch, events })}
          readOnly={isViewer}
        />
        {!isViewer && (
          <div className="flex justify-end mt-3">
            <button className="btn-primary" onClick={() => save({ events: localMatch.events }, 'events')}>
              Guardar goles y tarjetas
            </button>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Sustituciones</h2>
          {savedFlag === 'subs' && <span className="text-xs text-emerald-700">Guardado ✓</span>}
        </div>
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
          <div className="flex justify-end mt-3">
            <button className="btn-primary" onClick={() => save({ substitutions: localMatch.substitutions }, 'subs')}>
              Guardar sustituciones
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function PrediccionesPanel({
  estado,
  combos,
  minutoPromedioCambio,
  sistemas,
  tarjetaStat,
  alertaTarjeta,
  situOfensivas,
  situDefensivas,
  players,
}: {
  estado: GameState;
  combos: Counted<SaleEntraCombo>[];
  minutoPromedioCambio: number;
  sistemas: Counted<string>[];
  tarjetaStat: ReturnType<typeof cambioTrasTarjeta>;
  alertaTarjeta: Match['events'][number] | undefined;
  situOfensivas: EstadoResumen | null;
  situDefensivas: EstadoResumen | null;
  players: Player[];
}) {
  const sinDatos = combos.length === 0 && sistemas.length === 0 && !situOfensivas && !situDefensivas;

  return (
    <section className="card p-4 bg-emerald-50/40 border-emerald-200">
      <h2 className="font-semibold text-slate-900 mb-1">Predicciones — estado actual: {estado}</h2>
      <p className="text-xs text-slate-500 mb-3">
        Basadas en los últimos {10} partidos analizados de este rival, filtrando por lo que suele pasar cuando va{' '}
        {estado.toLowerCase()}.
      </p>

      {alertaTarjeta && alertaTarjeta.jugadorId && tarjetaStat.totalTarjetas > 0 && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>{playerName(players, alertaTarjeta.jugadorId)}</strong> está amonestado (min. {alertaTarjeta.minuto}
          '). Históricamente, un jugador amonestado sale de cambio el {tarjetaStat.pct}% de las veces
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
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <ul className="text-sm text-slate-700 space-y-1">
                {combos.map((c) => (
                  <li key={`${c.item.jugadorSaleId}-${c.item.jugadorEntraId}`}>
                    {playerName(players, c.item.jugadorSaleId)} → {playerName(players, c.item.jugadorEntraId)} ({c.count})
                  </li>
                ))}
                <li className="text-xs text-slate-400">Minuto promedio: {Math.round(minutoPromedioCambio)}'</li>
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
