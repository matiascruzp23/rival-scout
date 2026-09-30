import type { LeagueStatsImport, RivalDetail } from '../types';
import {
  analyzePhase,
  DEFENSIVE_CATEGORIES,
  matchesWithCsvCount,
  OFFENSIVE_CATEGORIES,
  type PhaseAnalysis,
} from './csvAnalysis';
import {
  allSubstitutions,
  balancePorSistema,
  cambiosTacticos,
  computeAllPlayerStats,
  computePlayerEventStats,
  estimateNextXI,
  findReglaTorneo,
  lastN,
  minutoPromedioSustituciones,
  positionRotation,
  sortMatchesDesc,
  type PlayerStats,
} from './stats';
import { findRow, metricColumns, rankingEnLiga } from './leagueStats';
import { INDIVIDUAL_STAT_GROUPS, peorJugador } from './individualStats';

// Motor de reglas fijas para la pestaña "Conclusiones": a diferencia de la
// versión anterior (que armaba un resumen de texto y se lo pasaba a un
// modelo de IA para que lo interpretara), acá cada viñeta sale de una
// condición explícita sobre los datos ya calculados en el resto de la app —
// determinístico, instantáneo y sin costo por request. Los umbrales y el
// orden de prioridad de cada viñeta se calibraron a mano con el usuario
// (analista) a partir de casos concretos, no son un criterio inventado.

const VENTANA = 10;
const UMBRAL_CLARO = 30;
const UMBRAL_MENCIONABLE = 20;
const MAX_VIÑETAS_POR_SECCION = 6;
const TITULAR_FIJO_MIN_PCT = 70;

// Umbral único para "¿esta tendencia es lo bastante fuerte como para
// nombrarla?", con 3 niveles: clara (≥30%), mencionable pero no dominante
// (20-29%), y por debajo de eso, "sin patrón identificable" (no se nombra
// el tag, aunque técnicamente sea el más repetido).
function fraseTendencia<T extends { pct: number }>(
  top: T | undefined,
  nombreFn: (t: T) => string
): { texto: string; identificable: boolean } {
  if (!top || top.pct < UMBRAL_MENCIONABLE) return { texto: 'sin patrón identificable', identificable: false };
  if (top.pct < UMBRAL_CLARO) {
    return { texto: `${nombreFn(top)} (${top.pct}%), sin ser un patrón dominante`, identificable: true };
  }
  return { texto: `${nombreFn(top)} (${top.pct}%)`, identificable: true };
}

function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// ---------- Cómo neutralizarlos ----------

// Patrón de construcción: cómo arman la salida (columna "Estructura") +
// cuál es su patrón de circulación más repetido (Circulación media/alta).
function reglaPatronOfensivo(ofensiva: PhaseAnalysis, conCsv: number): string | null {
  if (conCsv === 0) return null;
  const estructura = fraseTendencia(ofensiva.estructura[0], (e) => e.valor);
  const topTag = ofensiva.situaciones
    .filter((b) => !b.soporte)
    .flatMap((b) => b.tags)
    .sort((a, b) => b.pct - a.pct)[0];
  const circulacion = fraseTendencia(topTag, (t) => t.tag);

  if (!estructura.identificable && !circulacion.identificable) {
    return 'No se identifica un patrón de construcción/circulación claro y repetido en los partidos con CSV cargado.';
  }
  const partes: string[] = [];
  if (estructura.identificable) partes.push(`arman la salida principalmente con ${estructura.texto}`);
  if (circulacion.identificable) partes.push(`su patrón de circulación más repetido es ${circulacion.texto}`);
  return `Construcción de juego: ${partes.join('; ')}.`;
}

const ALTURA_LABEL: Record<string, string> = {
  'PRESION FIJA': 'presión fija (hombre a hombre en toda la cancha)',
  'PRESION ALTA': 'presión alta',
  'PRESION MEDIA': 'presión media',
  'PRESION BAJA': 'bloque bajo',
};
const ALTURA_CONSEJO: Record<string, string> = {
  'PRESION FIJA': 'buscar el desmarque de ruptura y los duelos individuales, ya que no hay coberturas zonales',
  'PRESION ALTA': 'la ventaja está en superar la primera línea con salida directa o asociaciones rápidas',
  'PRESION MEDIA': 'conviene la salida corta y buscar el pase entre líneas una vez superada la primera presión',
  'PRESION BAJA': 'tener paciencia en la circulación y buscar espacios dentro del bloque',
};

// A qué altura presionan dominantemente (% de registros de presión que caen
// en cada una de las 4 categorías), cruzado con qué roles la ejecutan
// (bloque "Presión de salida") — para saber en qué zona está la ventaja al
// momento de armar la salida propia.
function reglaPresion(matches: RivalDetail['matches'], presionSalida: PhaseAnalysis, conCsv: number): string | null {
  if (conCsv === 0) return null;
  const distribucion = DEFENSIVE_CATEGORIES.map((cat) => ({
    cat,
    registros: analyzePhase(matches, [cat], []).totalRegistros,
  }));
  const total = distribucion.reduce((s, d) => s + d.registros, 0);
  if (total === 0) return null;
  const top = distribucion
    .map((d) => ({ ...d, pct: Math.round((d.registros / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)[0];

  const altura = fraseTendencia(top, (t) => ALTURA_LABEL[t.cat]);
  if (!altura.identificable) return 'No hay una altura de presión claramente dominante en los partidos con CSV cargado.';

  const rolTop = presionSalida.situaciones[0]?.tags[0];
  let texto = `Presionan mayormente con ${altura.texto}`;
  if (rolTop && rolTop.pct >= UMBRAL_MENCIONABLE) {
    texto += `, ejecutada sobre todo con "${rolTop.tag}" (${rolTop.pct}%)`;
  }
  return `${texto} — ${ALTURA_CONSEJO[top.cat]}.`;
}

// El máximo goleador merece viñeta propia solo si saca una diferencia clara
// (2x o más) sobre el segundo; si el reparto es parejo, se nombra a los dos
// en vez de destacar a uno solo.
function reglaGoleador(eventStats: { player: RivalDetail['players'][number]; events: { goles: number } }[]): string | null {
  const goleadores = eventStats.filter((s) => s.events.goles > 0).sort((a, b) => b.events.goles - a.events.goles);
  if (goleadores.length === 0) return null;
  const [top, segundo] = goleadores;
  if (!segundo || top.events.goles >= 2 * segundo.events.goles) {
    return `Su máxima amenaza de gol es ${top.player.nombre} (${top.events.goles} goles en la ventana) — anularlo reduce gran parte de su potencial ofensivo.`;
  }
  return `El peligro de gol está repartido entre ${top.player.nombre} (${top.events.goles}) y ${segundo.player.nombre} (${segundo.events.goles}) — no alcanza con marcar a uno solo.`;
}

// El sistema alternativo solo se menciona si tiene una muestra mínima (2+
// partidos) y además rinde mejor que el principal — una muestra de 1 solo
// partido no alcanza para decir nada, por buen resultado que haya dado.
function reglaSistemaAlternativo(
  rival: RivalDetail,
  sistemas: ReturnType<typeof balancePorSistema>
): string | null {
  if (!rival.sistemaAlternativo) return null;
  const alt = sistemas.find((s) => s.item === rival.sistemaAlternativo);
  if (!alt || alt.count < 2) return null;
  const principal = sistemas.find((s) => s.item === rival.sistemaPrincipal) ?? sistemas[0];
  if (principal && principal.item === alt.item) return null;
  if ((alt.rendimiento ?? 0) <= (principal?.rendimiento ?? 0)) return null;
  return `Cuando cambian a ${alt.item} (usado en ${alt.count} de los últimos partidos) su rendimiento sube a ${alt.rendimiento}% (vs. ${principal?.rendimiento ?? '—'}% con ${principal?.item ?? 'su sistema habitual'}) — puede aparecer como variante a vigilar.`;
}

function reglaSustituciones(matches: RivalDetail['matches']): string | null {
  const subs = allSubstitutions(matches);
  if (subs.length === 0) return null;
  const minutoProm = minutoPromedioSustituciones(matches);
  const tacticos = cambiosTacticos(matches);
  let texto = `Suelen hacer su primer cambio recién cerca del minuto ${Math.round(minutoProm)}'`;
  if (tacticos.length > 0) {
    texto += `, y en ${tacticos.length} de ${subs.length} sustituciones de la ventana varía el sistema resultante — anticipar que pueden ajustar la forma en el complemento`;
  }
  return `${texto}.`;
}

// Una fortaleza rival exige menos evidencia que una debilidad para
// mencionarse (ver reglaDebilidadLiga): alcanza con aparecer top-3 de la
// liga, sin necesidad de que un dato propio la confirme.
function reglaFortalezaLiga(rival: RivalDetail, leagueStats: LeagueStatsImport | null): string | null {
  if (!leagueStats || !rival.codigoLdp) return null;
  const fila = findRow(leagueStats, rival.codigoLdp);
  if (!fila) return null;
  const top = metricColumns(leagueStats)
    .map((col) => ({ col, r: rankingEnLiga(leagueStats, rival.codigoLdp!, col) }))
    .filter((x): x is { col: string; r: NonNullable<typeof x.r> } => !!x.r && x.r.top3Positivo)
    .sort((a, b) => a.r.posicion - b.r.posicion)[0];
  if (!top) return null;
  return `Es de los mejores de la liga en "${top.col}" (${top.r.posicion}°/${top.r.total}) — tenerlo presente al planificar ese aspecto del partido.`;
}

// ---------- Cómo hacerles daño ----------

// Bajas/dudas solo se mencionan si el jugador es un titular relevante (top-5
// por minutos en la ventana) — la ausencia de un suplente ocasional no es
// una oportunidad real. Se reporta el hecho llano (bajó + minutos del
// reemplazo), sin opinar si el reemplazo es bueno o malo.
function reglasBajasDudas(
  rival: RivalDetail,
  statsPorJugador: PlayerStats[],
  xi: ReturnType<typeof estimateNextXI>
): string[] {
  const porMinutos = [...statsPorJugador].sort((a, b) => b.minutosJugados - a.minutosJugados);
  const topMinutosIds = new Set(porMinutos.slice(0, 5).map((s) => s.player.id));
  const statOf = (playerId: string) => porMinutos.find((s) => s.player.id === playerId);

  const out: string[] = [];
  const bajasClave = rival.players.filter((p) => p.baja && topMinutosIds.has(p.id));
  for (const p of bajasClave) {
    const stat = statOf(p.id);
    const reemplazo = xi.picks.find((pick) => pick.posicion === p.posicion);
    let texto = `No podrá jugar ${p.nombre} (titular con ${Math.round(stat?.minutosJugados ?? 0)}' en la ventana)`;
    if (reemplazo) {
      const statReemplazo = statOf(reemplazo.player.id);
      texto += `; su reemplazo más probable, ${reemplazo.player.nombre}, suma ${Math.round(statReemplazo?.minutosJugados ?? 0)}' en la misma ventana`;
    }
    out.push(`${texto}.`);
  }

  const dudasClave = rival.players.filter((p) => p.duda && topMinutosIds.has(p.id));
  for (const p of dudasClave) {
    out.push(`${p.nombre} está en duda y es uno de los titulares con más minutos de la ventana — su ausencia sería una baja sensible.`);
  }
  return out.slice(0, 2);
}

// Vulnerabilidad de presión: se toma la más fuerte entre las 3 alturas
// (alta/media/baja), no una por cada una, para no ocupar de más el espacio
// disponible de la sección.
function reglaVulnerabilidadPresion(vulnerabilidades: PhaseAnalysis, conCsv: number): string | null {
  if (conCsv === 0) return null;
  const candidato = vulnerabilidades.situaciones
    .filter((b) => b.tags.length > 0)
    .map((b) => ({ bloque: b.titulo, tag: b.tags[0] }))
    .sort((a, b) => b.tag.pct - a.tag.pct)[0];
  if (!candidato || candidato.tag.pct < UMBRAL_MENCIONABLE) {
    return 'No se identifica una vulnerabilidad de presión clara y repetida en los partidos con CSV cargado.';
  }
  const dominante = candidato.tag.pct >= UMBRAL_CLARO;
  const calificador = dominante ? '' : ', sin ser un patrón dominante';
  const desc = candidato.tag.descripcion ? ` (${candidato.tag.descripcion})` : '';
  return `En ${candidato.bloque.toLowerCase()}, su vulnerabilidad más repetida es "${candidato.tag.tag}" (${candidato.tag.pct}%)${calificador}${desc} — ahí está la vía más clara para generarles daño.`;
}

// Posición sin dueño claro: 4+ titulares distintos en la ventana, ninguno
// con más del 30% de las titularidades ahí — se trata como oportunidad
// ("hacerles daño"), no como incertidumbre a neutralizar.
function reglaPosicionInestable(matches: RivalDetail['matches']): string | null {
  const candidato = positionRotation(matches).find(
    (r) => r.jugadoresDistintos >= 4 && r.titularidadesTotales > 0 && (r.jugadores[0]?.count ?? 0) / r.titularidadesTotales < 0.3
  );
  if (!candidato) return null;
  return `La posición de ${candidato.posicion.toLowerCase()} no tiene dueño claro (${candidato.jugadoresDistintos} titulares distintos en la ventana, ninguno con más del 30% de titularidad ahí) — es un punto flojo para insistir.`;
}

// Relación temática entre una métrica de la planilla de liga y los tags
// propios de vulnerabilidad (ver csvGlossary.ts) — una debilidad de liga
// sola no alcanza, necesita un dato propio que la confirme. Deliberadamente
// acotado a un solo tema bien calibrado (duelos aéreos) en vez de un mapeo
// genérico: cruces más amplios (ej. "pases" con cualquier tag que mencione
// "lateral" o "circulación") probaron dar falsos positivos sin relación
// táctica real entre sí.
const TEMAS_LIGA_VULNERABILIDAD: { metrica: string[]; tag: string[] }[] = [
  { metrica: ['aereo', 'cabezazo'], tag: ['area', 'centro', 'segundo palo'] },
];

function temaRelacionado(metrica: string, tagsPropios: string[]): boolean {
  const m = normaliza(metrica);
  const tags = tagsPropios.map(normaliza);
  return TEMAS_LIGA_VULNERABILIDAD.some(
    (t) => t.metrica.some((k) => m.includes(k)) && tags.some((tag) => t.tag.some((k) => tag.includes(k)))
  );
}

function reglaDebilidadLiga(
  rival: RivalDetail,
  leagueStats: LeagueStatsImport | null,
  vulnerabilidades: PhaseAnalysis
): string | null {
  if (!leagueStats || !rival.codigoLdp) return null;
  const fila = findRow(leagueStats, rival.codigoLdp);
  if (!fila) return null;
  const tagsPropios = vulnerabilidades.situaciones.flatMap((b) => b.tags.map((t) => t.tag));
  if (tagsPropios.length === 0) return null;

  const peor = metricColumns(leagueStats)
    .map((col) => ({ col, r: rankingEnLiga(leagueStats, rival.codigoLdp!, col) }))
    .filter((x): x is { col: string; r: NonNullable<typeof x.r> } => !!x.r && x.r.top3Negativo)
    .filter((x) => temaRelacionado(x.col, tagsPropios))
    .sort((a, b) => b.r.posicion - a.r.posicion)[0];
  if (!peor) return null;
  return `Es de los peores de la liga en "${peor.col}" (${peor.r.posicion}°/${peor.r.total}), algo que coincide con patrones que ya se ven en el video propio — vía confirmada para hacerles daño.`;
}

// Indisciplina: titular habitual (≥50% de minutos posibles) con 3+
// amarillas en la ventana — se anota como algo a tener presente, sin
// instrucción de ir a buscar la tarjeta.
function reglaIndisciplina(
  eventStats: { player: RivalDetail['players'][number]; events: { amarillas: number } }[],
  statsPorJugador: PlayerStats[]
): string | null {
  const candidato = eventStats
    .filter((s) => s.events.amarillas >= 3)
    .map((s) => ({ ...s, stat: statsPorJugador.find((st) => st.player.id === s.player.id) }))
    .filter((s) => (s.stat?.porcentajeMinutos ?? 0) >= 50)
    .sort((a, b) => b.events.amarillas - a.events.amarillas)[0];
  if (!candidato) return null;
  return `${candidato.player.nombre} acumula ${candidato.events.amarillas} amarillas en la ventana siendo titular habitual — ojo con la disciplina, puede quedar cerca de la sanción.`;
}

// Bajo rendimiento individual (planilla individual, grupo "Defensivo"): solo
// se menciona si el peor de la categoría es además titular fijo (≥70% de
// minutos posibles) — el peor de un suplente ocasional no es una debilidad
// explotable.
function reglaBajoRendimientoIndividual(rival: RivalDetail, statsPorJugador: PlayerStats[]): string | null {
  if (!rival.individualStats) return null;
  const porNombre = new Map(statsPorJugador.map((s) => [normaliza(s.player.nombre), s]));
  const grupoDefensivo = INDIVIDUAL_STAT_GROUPS.find((g) => g.titulo === 'Defensivo');
  if (!grupoDefensivo) return null;

  for (const cat of grupoDefensivo.categorias) {
    const peor = peorJugador(rival.individualStats, cat.columna, { excluirPorteros: cat.excluirPorteros });
    if (!peor) continue;
    const stat = porNombre.get(normaliza(peor.nombre));
    if (!stat || stat.porcentajeMinutos < TITULAR_FIJO_MIN_PCT) continue;
    return `${peor.nombre} es titular fijo (${Math.round(stat.porcentajeMinutos)}% de minutos posibles) y tiene el peor registro del plantel en "${cat.etiqueta}" (${cat.formato(peor.valor)}) — apuntarle en ese aspecto.`;
  }
  return null;
}

function seccion(titulo: string, viñetas: string[]): string {
  if (viñetas.length === 0) return `## ${titulo}\n- Sin datos suficientes para esta sección.`;
  return `## ${titulo}\n${viñetas
    .slice(0, MAX_VIÑETAS_POR_SECCION)
    .map((v) => `- ${v}`)
    .join('\n')}`;
}

export function construirConclusiones(rival: RivalDetail, leagueStats: LeagueStatsImport | null): string {
  const allMatches = sortMatchesDesc(rival.matches);
  const matches = lastN(rival.matches, VENTANA);
  const conCsv = matchesWithCsvCount(matches);
  const statsPorJugador = computeAllPlayerStats(rival.players, matches);
  const eventStats = rival.players.map((p) => ({ player: p, events: computePlayerEventStats(p.id, matches) }));

  const reglaAplicable = findReglaTorneo(rival.reglasTorneo, rival.proximoPartido?.competicion);
  const xi = estimateNextXI(rival.players, allMatches, reglaAplicable, rival.proximoPartido?.competicion);
  const sistemas = balancePorSistema(matches);

  const ofensiva = analyzePhase(matches, OFFENSIVE_CATEGORIES, [
    { titulo: 'Circulación media', columnas: ['Situaciones de circulacion'], categorias: ['CIRCULACION MEDIA'], soloRepetidos: true },
    { titulo: 'Circulación alta', columnas: ['Situaciones de circulacion'], categorias: ['CIRCULACION ALTA'], soloRepetidos: true },
  ]);
  const presionSalida = analyzePhase(matches, DEFENSIVE_CATEGORIES, [
    { titulo: 'Presión de salida', columnas: ['Tipos de presion en salida'] },
  ]);
  const vulnerabilidades = analyzePhase(matches, DEFENSIVE_CATEGORIES, [
    { titulo: 'Presión alta', columnas: ['Situaciones de presion'], categorias: ['PRESION ALTA'], soloRepetidos: true },
    { titulo: 'Presión media', columnas: ['Situaciones de presion'], categorias: ['PRESION MEDIA'], soloRepetidos: true },
    { titulo: 'Presión baja', columnas: ['Situaciones de presion'], categorias: ['PRESION BAJA'], soloRepetidos: true },
  ]);

  const neutralizar = [
    reglaPatronOfensivo(ofensiva, conCsv),
    reglaPresion(matches, presionSalida, conCsv),
    reglaGoleador(eventStats),
    reglaSistemaAlternativo(rival, sistemas),
    reglaSustituciones(matches),
    reglaFortalezaLiga(rival, leagueStats),
  ].filter((v): v is string => !!v);

  const hacerDano = [
    ...reglasBajasDudas(rival, statsPorJugador, xi),
    reglaVulnerabilidadPresion(vulnerabilidades, conCsv),
    reglaPosicionInestable(matches),
    reglaDebilidadLiga(rival, leagueStats, vulnerabilidades),
    reglaIndisciplina(eventStats, statsPorJugador),
    reglaBajoRendimientoIndividual(rival, statsPorJugador),
  ].filter((v): v is string => !!v);

  return [seccion('Cómo neutralizarlos', neutralizar), seccion('Cómo hacerles daño', hacerDano)].join('\n\n');
}
