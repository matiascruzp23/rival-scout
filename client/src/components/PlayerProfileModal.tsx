import { useMemo } from 'react';
import type { Player, RivalDetail } from '../types';
import { Modal } from './Modal';
import { RadarChart } from './RadarChart';
import { PlayerBadges } from './PlayerBadges';
import { computePlayerStats, computePlayerEventStats, formatPct, lastN } from '../lib/stats';
import { filaDeJugador, maxPorEjeJugadores, radarGroupForPosicion, valorDe } from '../lib/playerRadar';

const VENTANA = 10;
const COLOR_JUGADOR = '#1e3a8a';

export function PlayerProfileModal({
  player,
  rival,
  onClose,
}: {
  player: Player;
  rival: RivalDetail;
  onClose: () => void;
}) {
  const matches = useMemo(() => lastN(rival.matches, VENTANA), [rival.matches]);
  const stats = useMemo(() => computePlayerStats(player, matches), [player, matches]);
  const events = useMemo(() => computePlayerEventStats(player.id, matches), [player.id, matches]);

  const fila = rival.individualStats ? filaDeJugador(rival.individualStats, player) : null;
  const grupo = radarGroupForPosicion(player.posicion);
  const maxPorEje = useMemo(
    () => (grupo && rival.individualStats ? maxPorEjeJugadores(rival.individualStats, grupo.ejes) : []),
    [grupo, rival.individualStats]
  );

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
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Planilla individual (Wyscout)</h4>
          {!rival.individualStats ? (
            <p className="text-sm text-slate-400">
              Todavía no se importó una planilla individual para este rival (pestaña "Gráficos y estadísticas").
            </p>
          ) : !fila ? (
            <p className="text-sm text-slate-400">No se encontró a {player.nombre} en la planilla individual importada.</p>
          ) : !grupo ? (
            <p className="text-sm text-slate-400">
              Sin un set de métricas de radar definido para "{player.posicion || 'sin posición'}".
            </p>
          ) : (
            <div className="max-w-sm mx-auto">
              <RadarChart
                ejeLabels={grupo.ejes.map((e) => e.label)}
                series={[
                  {
                    label: player.nombre,
                    color: COLOR_JUGADOR,
                    valores: grupo.ejes.map((e) => valorDe(fila, e.columna)),
                  },
                ]}
                maxPorEje={maxPorEje}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
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
