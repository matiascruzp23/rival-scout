import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { RivalContext } from './RivalLayout';
import {
  checkReglaTorneo,
  estimateNextXI,
  findReglaTorneo,
  lastN,
  mostCommonLineup,
  positionRotation,
  recentPlayers,
  sortMatchesDesc,
} from '../lib/stats';
import { playerMap } from '../lib/lookup';
import { PlayerBadges } from '../components/PlayerBadges';
import { Pitch, type PitchToken } from '../components/Pitch';
import { MatchPitchTimeline } from '../components/MatchPitchTimeline';
import { RotationCard } from '../components/RotationCard';
import { ReglaTorneoBanner } from '../components/ReglaTorneoBanner';
import { defaultCoordsFor, symmetrizeDoublePivote, symmetrizeForwardPair } from '../lib/positions';
import type { Match, Player } from '../types';

export default function LineupsPage() {
  const { rival } = useOutletContext<RivalContext>();
  const [window, setWindowSize] = useState<3 | 5 | 10>(10);
  const players = playerMap(rival.players);

  const matches = useMemo(() => lastN(rival.matches, window), [rival.matches, window]);
  const allMatches = useMemo(() => sortMatchesDesc(rival.matches), [rival.matches]);
  const common = useMemo(() => mostCommonLineup(matches), [matches]);
  const commonTokens: PitchToken[] = useMemo(() => {
    if (!common) return [];
    const tokens: PitchToken[] = [];
    for (const p of common.players) {
      const { x, y } = defaultCoordsFor(p.posicion, tokens);
      tokens.push({ key: p.playerId, x, y, posicion: p.posicion, player: players.get(p.playerId) });
    }
    symmetrizeForwardPair(tokens);
    symmetrizeDoublePivote(tokens);
    return tokens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [common]);
  const reglaAplicable = useMemo(
    () => findReglaTorneo(rival.reglasTorneo, rival.proximoPartido?.competicion),
    [rival.reglasTorneo, rival.proximoPartido]
  );
  const estimate = useMemo(
    () => estimateNextXI(rival.players, matches, reglaAplicable),
    [rival.players, matches, reglaAplicable]
  );
  const estimateTokens: PitchToken[] = useMemo(() => {
    const tokens: PitchToken[] = [];
    for (const pick of estimate.picks) {
      const { x, y } = defaultCoordsFor(pick.posicion, tokens);
      tokens.push({ key: pick.player.id, x, y, posicion: pick.posicion, player: pick.player });
    }
    symmetrizeForwardPair(tokens);
    symmetrizeDoublePivote(tokens);
    return tokens;
  }, [estimate]);
  const reglaCheck = useMemo(
    () => checkReglaTorneo(estimate.picks, reglaAplicable, rival.players),
    [estimate, reglaAplicable, rival.players]
  );
  const rotation = useMemo(() => positionRotation(matches), [matches]);
  const recent = useMemo(() => recentPlayers(rival.players, rival.matches, 3), [rival.players, rival.matches]);
  const bajas = rival.players.filter((p) => p.baja);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">XI y Rotaciones</h2>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-slate-500 mr-1">Ventana:</span>
          {[3, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => setWindowSize(n as 3 | 5 | 10)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                window === n ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              últimos {n}
            </button>
          ))}
        </div>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">XI más repetido</h3>
        {common && common.count > 1 ? (
          <>
            <p className="text-xs text-slate-500 mb-2">
              Se repitió en {common.count} de {matches.length} partidos analizados.
            </p>
            <Pitch tokens={commonTokens} height={320} />
          </>
        ) : estimate.picks.length > 0 ? (
          <>
            <p className="text-xs text-slate-500 mb-2">
              Ningún XI se repitió idéntico en esta ventana; esto es una estimación según quién más ha participado en
              cada una de las 11 posiciones.
            </p>
            <Pitch tokens={estimateTokens} height={320} />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
              {estimate.picks.map((p) => (
                <li key={p.player.id} className="flex justify-between border-b border-slate-100 py-1">
                  <span>
                    {p.player.nombre}
                    {p.reemplazadoPorRegla && (
                      <span className="text-slate-400 italic"> (en vez de {p.reemplazadoPorRegla.nombre})</span>
                    )}
                  </span>
                  <span className="text-slate-400">{p.posicion}</span>
                </li>
              ))}
            </ul>
            <ReglaTorneoBanner check={reglaCheck} />
          </>
        ) : (
          <p className="text-sm text-slate-400">Sin datos suficientes en esta ventana.</p>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-slate-800 mb-1">Posiciones con mayor rotación</h3>
        <p className="text-xs text-slate-500 mb-3">Dónde el rival rota más entre partidos, y quién se reparte cada puesto.</p>
        {rotation.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos de XI en esta ventana.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rotation.map((r) => (
              <RotationCard key={r.posicion} data={r} players={players} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Jugadores que han aparecido recientemente (últimos 3)</h3>
          <div className="flex flex-wrap gap-2">
            {recent.map((p) => (
              <span key={p.id} className="badge bg-slate-100 text-slate-700 text-xs px-2 py-1">
                {p.nombre} <PlayerBadges player={p} />
              </span>
            ))}
            {recent.length === 0 && <p className="text-sm text-slate-400">Sin datos.</p>}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Jugadores marcados como baja</h3>
          <div className="flex flex-wrap gap-2">
            {bajas.map((p) => (
              <span key={p.id} className="badge bg-red-100 text-red-700 text-xs px-2 py-1">
                {p.nombre} · {p.posicion}
              </span>
            ))}
            {bajas.length === 0 && <p className="text-sm text-slate-400">No hay jugadores marcados como baja.</p>}
          </div>
        </section>
      </div>

      <section className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">XI de cada partido</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allMatches.map((m) => (
            <MatchLineupCard key={m.id} match={m} players={rival.players} />
          ))}
          {allMatches.length === 0 && <p className="text-sm text-slate-400">No hay partidos registrados.</p>}
        </div>
      </section>
    </div>
  );
}

function MatchLineupCard({ match, players }: { match: Match; players: Player[] }) {
  return (
    <div className="border border-slate-100 rounded-md p-3">
      <div className="text-xs text-slate-500 mb-2 flex justify-between">
        <span>
          {match.fecha} · vs {match.oponente || '—'} ({match.condicion}) · {match.sistema || 'sin sistema'}
        </span>
        <span>
          {match.golesFavor ?? '-'} - {match.golesContra ?? '-'}
        </span>
      </div>
      <MatchPitchTimeline match={match} players={players} />
    </div>
  );
}
