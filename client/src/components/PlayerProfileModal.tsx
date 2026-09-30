import { useMemo, useState } from 'react';
import type { Player, RivalDetail } from '../types';
import { Modal } from './Modal';
import { RadarChart, RadarLegend } from './RadarChart';
import { PlayerBadges } from './PlayerBadges';
import { PlayerPositionPitch, type PlayerPositionSeries } from './PlayerPositionPitch';
import { api } from '../api';
import { computePlayerStats, computePlayerEventStats, formatPct, lastN, playerPositionHistory } from '../lib/stats';
import { filaDeJugador, filasSinCruzar, maxPorEjeJugadores, radarGroupForPosicion, valorDe } from '../lib/playerRadar';
import {
  analyzeIndividuales,
  DEFENSIVE_CATEGORIES,
  OFFENSIVE_CATEGORIES,
  type IndividualesBloque,
} from '../lib/csvAnalysis';
import { glossaryFor } from '../lib/csvGlossary';

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
  const statsComparar = useMemo(
    () => (compararCon ? computePlayerStats(compararCon, matches) : null),
    [compararCon, matches]
  );
  const eventsComparar = useMemo(
    () => (compararCon ? computePlayerEventStats(compararCon.id, matches) : null),
    [compararCon, matches]
  );
  const historialComparar = useMemo(
    () => (compararCon ? playerPositionHistory(compararCon.id, matches) : []),
    [compararCon, matches]
  );
  const filaComparar =
    compararCon && rival.individualStats ? filaDeJugador(rival.individualStats, compararCon) : null;

  const ofensivos = useMemo(
    () => analyzeIndividuales(matches, OFFENSIVE_CATEGORIES, ['Situaciones de circulacion'], 'Comportamientos ofensivos'),
    [matches]
  );
  const defensivos = useMemo(
    () => analyzeIndividuales(matches, DEFENSIVE_CATEGORIES, ['Situaciones de presion'], 'Comportamientos defensivos'),
    [matches]
  );
  const ofensivosJugador = useMemo(() => situacionesDeJugador(ofensivos, player), [ofensivos, player]);
  const defensivosJugador = useMemo(() => situacionesDeJugador(defensivos, player), [defensivos, player]);
  const ofensivosComparar = useMemo(
    () => (compararCon ? situacionesDeJugador(ofensivos, compararCon) : []),
    [ofensivos, compararCon]
  );
  const defensivosComparar = useMemo(
    () => (compararCon ? situacionesDeJugador(defensivos, compararCon) : []),
    [defensivos, compararCon]
  );

  const posicionSeries: PlayerPositionSeries[] = [
    { label: player.nombre, color: COLOR_JUGADOR, historial: historialPosiciones },
    ...(compararCon ? [{ label: compararCon.nombre, color: COLOR_COMPARAR, historial: historialComparar }] : []),
  ];

  const radarSeries =
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500">
              {player.posicion || 'Sin posición'}
              {player.dorsal != null ? ` · #${player.dorsal}` : ''}
            </span>
            <PlayerBadges player={player} size="md" />
          </div>
          {companerosMismoGrupo.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Comparar con:</label>
              <select
                className="input text-sm py-1"
                style={{ width: 200 }}
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
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Últimos {matches.length} partidos (app)</h4>
          <div className="space-y-2">
            <PlayerStatsRow
              label={compararCon ? player.nombre : undefined}
              color={COLOR_JUGADOR}
              stats={stats}
              events={events}
            />
            {compararCon && statsComparar && eventsComparar && (
              <PlayerStatsRow label={compararCon.nombre} color={COLOR_COMPARAR} stats={statsComparar} events={eventsComparar} />
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Posiciones jugadas de titular</h4>
          <div className="max-w-xs mx-auto">
            <PlayerPositionPitch series={posicionSeries} />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Comportamientos individuales</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComportamientosCard
              titulo="Ofensivos"
              situaciones={ofensivosJugador}
              label={compararCon ? player.nombre : undefined}
              color={COLOR_JUGADOR}
              situacionesComparar={compararCon ? ofensivosComparar : undefined}
              labelComparar={compararCon?.nombre}
            />
            <ComportamientosCard
              titulo="Defensivos"
              situaciones={defensivosJugador}
              label={compararCon ? player.nombre : undefined}
              color={COLOR_JUGADOR}
              situacionesComparar={compararCon ? defensivosComparar : undefined}
              labelComparar={compararCon?.nombre}
            />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Planilla individual</h4>
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
              {compararCon && !filaComparar && (
                <p className="text-xs text-amber-700 mb-2">
                  No se encontró a {compararCon.nombre} en la planilla individual, así que no se puede comparar.
                </p>
              )}
              <div className="max-w-sm mx-auto">
                {radarSeries.length > 1 && (
                  <div className="mb-2 flex justify-center">
                    <RadarLegend series={radarSeries} />
                  </div>
                )}
                <RadarChart ejeLabels={grupo.ejes.map((e) => e.label)} series={radarSeries} maxPorEje={maxPorEje} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PlayerStatsRow({
  label,
  color,
  stats,
  events,
}: {
  label?: string;
  color: string;
  stats: ReturnType<typeof computePlayerStats>;
  events: ReturnType<typeof computePlayerEventStats>;
}) {
  return (
    <div>
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
        <Stat label="PJ" value={stats.partidosJugados} />
        <Stat label="Titular" value={stats.titularidades} />
        <Stat label="Minutos" value={`${Math.round(stats.minutosJugados)}'`} />
        <Stat label="% Min. posibles" value={formatPct(stats.porcentajeMinutos)} />
        <Stat label="Goles" value={events.goles} />
        <Stat label="TA/TR" value={`${events.amarillas}/${events.rojas}`} />
      </div>
    </div>
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

// Sin acentos/mayúsculas ni separadores (puntos, espacios): la columna
// "Rivales" del CSV se anota a mano y de forma muy variable ("B.Hurtado",
// "Abuhadba", "Z. Abuhadba"...), así que la comparación no puede depender
// de puntuación ni espaciado exactos.
function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Formas habituales en que un analista anota a un jugador en esa columna:
// nombre completo, inicial+apellido ("B.Hurtado"), o solo el apellido
// ("Abuhadba") cuando no hay ambigüedad para él/ella.
function clavesJugador(jugador: Player): Set<string> {
  const partes = jugador.nombre.trim().split(/\s+/);
  const apellido = partes[partes.length - 1] || jugador.nombre;
  const inicial = partes[0]?.[0] || '';
  return new Set([normaliza(jugador.nombre), normaliza(`${inicial}${apellido}`), normaliza(apellido)]);
}

// Situaciones distintas (sin el conteo) que el Análisis CSV le atribuyó a
// este jugador puntual.
function situacionesDeJugador(bloque: IndividualesBloque, jugador: Player): string[] {
  const candidatos = clavesJugador(jugador);
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of bloque.combos) {
    if (!candidatos.has(normaliza(c.rival))) continue;
    if (vistos.has(c.situacion)) continue;
    vistos.add(c.situacion);
    out.push(c.situacion);
  }
  return out;
}

function ComportamientosCard({
  titulo,
  situaciones,
  label,
  color,
  situacionesComparar,
  labelComparar,
}: {
  titulo: string;
  situaciones: string[];
  label?: string;
  color: string;
  situacionesComparar?: string[];
  labelComparar?: string;
}) {
  const comparando = situacionesComparar !== undefined;
  return (
    <section className="card p-3">
      <h5 className="text-xs font-semibold text-slate-700 mb-2">{titulo}</h5>
      <SituacionesList label={label} color={color} situaciones={situaciones} />
      {comparando && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <SituacionesList label={labelComparar} color={COLOR_COMPARAR} situaciones={situacionesComparar!} />
        </div>
      )}
    </section>
  );
}

function SituacionesList({ label, color, situaciones }: { label?: string; color: string; situaciones: string[] }) {
  return (
    <div>
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </div>
      )}
      {situaciones.length === 0 ? (
        <p className="text-xs text-slate-400">Sin registros en el CSV.</p>
      ) : (
        <ul className="space-y-1">
          {situaciones.map((s) => (
            <li key={s} className="text-sm text-slate-700">
              {s}
              {glossaryFor(s) && <span className="text-slate-400 text-xs"> — {glossaryFor(s)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
