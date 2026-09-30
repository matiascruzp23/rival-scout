import { useMemo, useState } from 'react';
import type { Player, RivalDetail } from '../types';
import { Modal } from './Modal';
import { RadarChart, RadarLegend } from './RadarChart';
import { PlayerBadges } from './PlayerBadges';
import { PlayerPositionPitch } from './PlayerPositionPitch';
import { api } from '../api';
import { computePlayerStats, computePlayerEventStats, formatPct, lastN, playerPositionHistory } from '../lib/stats';
import { filaDeJugador, filasSinCruzar, maxPorEjeJugadores, radarGroupForPosicion, valorDe } from '../lib/playerRadar';

const VENTANA = 10;
const COLOR_JUGADOR = '#1e3a8a';
const COLOR_COMPARAR = '#f97316';

export function PlayerProfileModal({
  player,
  rival,
  onClose,
  onSaved,
}: {
  player: Player;
  rival: RivalDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [compararConId, setCompararConId] = useState('');

  const matches = useMemo(() => lastN(rival.matches, VENTANA), [rival.matches]);
  const stats = useMemo(() => computePlayerStats(player, matches), [player, matches]);
  const events = useMemo(() => computePlayerEventStats(player.id, matches), [player.id, matches]);
  const historialPosiciones = useMemo(() => playerPositionHistory(player.id, matches), [player.id, matches]);

  const fila = rival.individualStats ? filaDeJugador(rival.individualStats, player) : null;
  const grupo = radarGroupForPosicion(player.posicion);
  const maxPorEje = useMemo(
    () => (grupo && rival.individualStats ? maxPorEjeJugadores(rival.individualStats, grupo.ejes) : []),
    [grupo, rival.individualStats]
  );

  const companerosMismoGrupo = useMemo(
    () =>
      grupo
        ? rival.players.filter((p) => p.id !== player.id && radarGroupForPosicion(p.posicion)?.key === grupo.key)
        : [],
    [grupo, rival.players, player.id]
  );
  const compararCon = companerosMismoGrupo.find((p) => p.id === compararConId) || null;
  const filaComparar =
    compararCon && rival.individualStats ? filaDeJugador(rival.individualStats, compararCon) : null;

  const series =
    grupo && fila
      ? [
          { label: player.nombre, color: COLOR_JUGADOR, valores: grupo.ejes.map((e) => valorDe(fila, e.columna)) },
          ...(compararCon && filaComparar
            ? [
                {
                  label: compararCon.nombre,
                  color: COLOR_COMPARAR,
                  valores: grupo.ejes.map((e) => valorDe(filaComparar, e.columna)),
                },
              ]
            : []),
        ]
      : [];

  return (
    <Modal title={player.nombre} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">
            {player.posicion || 'Sin posición'}
            {player.dorsal != null ? ` · #${player.dorsal}` : ''}
          </span>
          <PlayerBadges player={player} size="md" />
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Últimos {matches.length} partidos (app)</h4>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            <Stat label="PJ" value={stats.partidosJugados} />
            <Stat label="Titular" value={stats.titularidades} />
            <Stat label="Minutos" value={`${Math.round(stats.minutosJugados)}'`} />
            <Stat label="% Min. posibles" value={formatPct(stats.porcentajeMinutos)} />
            <Stat label="Goles" value={events.goles} />
            <Stat label="TA/TR" value={`${events.amarillas}/${events.rojas}`} />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Posiciones jugadas de titular</h4>
          <div className="max-w-xs mx-auto">
            <PlayerPositionPitch historial={historialPosiciones} />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Planilla individual (Wyscout)</h4>
          {!rival.individualStats ? (
            <p className="text-sm text-slate-400">
              Todavía no se importó una planilla individual para este rival (pestaña "Gráficos y estadísticas").
            </p>
          ) : !grupo ? (
            <p className="text-sm text-slate-400">
              Sin un set de métricas de radar definido para "{player.posicion || 'sin posición'}".
            </p>
          ) : !fila ? (
            <SinCruzar rival={rival} player={player} onSaved={onSaved} />
          ) : (
            <div>
              {companerosMismoGrupo.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs text-slate-500">Comparar con:</label>
                  <select
                    className="input text-sm py-1"
                    style={{ width: 220 }}
                    value={compararConId}
                    onChange={(e) => setCompararConId(e.target.value)}
                  >
                    <option value="">Sin comparar</option>
                    {companerosMismoGrupo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {compararCon && !filaComparar && (
                <p className="text-xs text-amber-700 mb-2">
                  No se encontró a {compararCon.nombre} en la planilla individual, así que no se puede comparar.
                </p>
              )}
              <div className="max-w-sm mx-auto">
                {series.length > 1 && (
                  <div className="mb-2 flex justify-center">
                    <RadarLegend series={series} />
                  </div>
                )}
                <RadarChart ejeLabels={grupo.ejes.map((e) => e.label)} series={series} maxPorEje={maxPorEje} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// El cruce automático por nombre falló: deja elegir a mano cuál de las
// filas de la planilla que todavía no están cruzadas con nadie corresponde
// a este jugador (ver filasSinCruzar) — queda guardado en el jugador
// (wyscoutNombre) para no tener que repetirlo en cada visita.
function SinCruzar({
  rival,
  player,
  onSaved,
}: {
  rival: RivalDetail;
  player: Player;
  onSaved: () => void;
}) {
  const [elegido, setElegido] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const opciones = useMemo(
    () => (rival.individualStats ? filasSinCruzar(rival.individualStats, rival.players) : []),
    [rival.individualStats, rival.players]
  );

  const guardar = async () => {
    if (!elegido) return;
    setSaving(true);
    setError('');
    try {
      await api.players.update(player.id, { wyscoutNombre: elegido });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">No se encontró a {player.nombre} en la planilla individual importada.</p>
      {opciones.length === 0 ? (
        <p className="text-xs text-slate-400">No quedan filas de la planilla sin cruzar con otro jugador.</p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input text-sm py-1" style={{ width: 220 }} value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">¿Cuál es en la planilla?</option>
            {opciones.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
          <button className="btn-primary text-xs py-1" disabled={!elegido || saving} onClick={guardar}>
            {saving ? 'Guardando…' : 'Guardar cruce'}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-md py-2">
      <div className="text-sm font-semibold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400 uppercase">{label}</div>
    </div>
  );
}
