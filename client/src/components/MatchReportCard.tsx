import { useMemo } from 'react';
import type { Match, Player } from '../types';
import { Pitch, type PitchToken } from './Pitch';
import { buildLayoutTimeline } from '../lib/pitchLayout';
import { playerMap, playerName } from '../lib/lookup';

const RESULTADO_ROW_CLASS = {
  gano: 'bg-emerald-50 border-emerald-200',
  empato: 'bg-amber-50 border-amber-200',
  perdio: 'bg-red-50 border-red-200',
} as const;

export function matchOutcome(m: Match): 'gano' | 'empato' | 'perdio' | null {
  if (m.golesFavor === null || m.golesContra === null) return null;
  if (m.golesFavor > m.golesContra) return 'gano';
  if (m.golesFavor < m.golesContra) return 'perdio';
  return 'empato';
}

export function outcomeRowClass(m: Match): string {
  const outcome = matchOutcome(m);
  return outcome ? RESULTADO_ROW_CLASS[outcome] : '';
}

export function outcomeTextClass(m: Match): string {
  const outcome = matchOutcome(m);
  if (outcome === 'gano') return 'text-emerald-700 font-semibold';
  if (outcome === 'perdio') return 'text-red-700 font-semibold';
  if (outcome === 'empato') return 'text-amber-700 font-semibold';
  return '';
}

export function MatchReportCard({ match, players }: { match: Match; players: Player[] }) {
  const map = playerMap(players);
  const timeline = useMemo(() => buildLayoutTimeline(match), [match]);

  const subsOrdenadas = [...match.substitutions].sort((a, b) => a.minuto - b.minuto);
  const eventosOrdenados = [...match.events].sort((a, b) => a.minuto - b.minuto);
  const bajasPorLesionOSuspension = match.bajas.filter((b) => b.tipo === 'lesion' || b.tipo === 'suspension');

  return (
    <div className={`border rounded-md p-3 ${outcomeRowClass(match)}`}>
      <div className="mb-2">
        {(match.competencia || match.jornada) && (
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            {[match.competencia, match.jornada].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="text-xs text-slate-600 flex justify-between items-baseline">
          <span>
            {match.fecha} · vs {match.oponente || '—'} ({match.condicion}) · {match.sistema || 'sin sistema'}
            {match.sistemaOponente ? ` vs ${match.sistemaOponente}` : ''}
          </span>
          <span className={outcomeTextClass(match)}>
            {match.golesFavor ?? '-'} - {match.golesContra ?? '-'}
          </span>
        </div>
      </div>

      {bajasPorLesionOSuspension.length > 0 && (
        <p className="mb-2 text-xs text-slate-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          <span className="font-semibold text-red-700">No convocados por lesión/suspensión: </span>
          {bajasPorLesionOSuspension.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ' · '}
              {playerName(map, b.jugadorId)} ({b.tipo === 'lesion' ? 'Lesión' : 'Suspensión'}
              {b.motivo ? `: ${b.motivo}` : ''})
            </span>
          ))}
        </p>
      )}

      {match.lineup.length === 0 ? (
        <p className="text-sm text-slate-400">Sin XI registrado.</p>
      ) : (
        <div className="flex flex-wrap gap-2 justify-center">
          {timeline.map((cp) => {
            const tokens: PitchToken[] = cp.layout
              .filter((l) => l.playerId)
              .map((l) => ({
                key: l.playerId,
                x: l.x ?? 50,
                y: l.y ?? 50,
                posicion: l.posicion,
                player: players.find((p) => p.id === l.playerId),
              }));
            return (
              <div key={cp.minuto} style={{ width: 130 }}>
                <p className="text-[9px] font-semibold text-slate-500 text-center mb-0.5">
                  {cp.label} ({cp.marcador.favor}-{cp.marcador.contra})
                </p>
                <Pitch tokens={tokens} height={190} />
              </div>
            );
          })}
        </div>
      )}

      {match.notaTactica && (
        <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
          <span className="font-semibold text-slate-500">Ajuste táctico: </span>
          {match.notaTactica}
        </p>
      )}

      {subsOrdenadas.length > 0 && (
        <div className="mt-2">
          <h5 className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Sustituciones</h5>
          {/* Con muchos cambios, se reparten en 2 columnas (como un diario) en
              vez de seguir estirando la tarjeta hacia abajo hasta que se corte
              justo entre una página y la otra. */}
          <ul
            className="text-xs text-slate-600 space-y-0.5"
            style={subsOrdenadas.length > 5 ? { columns: 2, columnGap: '1rem' } : undefined}
          >
            {subsOrdenadas.map((s) => (
              <li key={s.id} style={{ breakInside: 'avoid-column' }}>
                {s.minuto}' {playerName(map, s.jugadorSaleId)} → {playerName(map, s.jugadorEntraId)}
                {s.sistemaResultante ? ` · cambia a ${s.sistemaResultante}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {eventosOrdenados.length > 0 && (
        <div className="mt-2">
          <h5 className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Goles y tarjetas</h5>
          <ul
            className="text-xs text-slate-600 space-y-0.5"
            style={eventosOrdenados.length > 5 ? { columns: 2, columnGap: '1rem' } : undefined}
          >
            {eventosOrdenados.map((e) => (
              <li key={e.id} style={{ breakInside: 'avoid-column' }}>
                {e.minuto}'{' '}
                {e.tipo === 'gol_favor' && `Gol de ${playerName(map, e.jugadorId || '')}`}
                {e.tipo === 'gol_contra' && 'Gol del oponente'}
                {e.tipo === 'amarilla' && `Amarilla a ${playerName(map, e.jugadorId || '')}`}
                {e.tipo === 'roja' && `Roja a ${playerName(map, e.jugadorId || '')}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
