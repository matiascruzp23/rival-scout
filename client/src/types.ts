export type PieHabil = 'Derecho' | 'Izquierdo' | 'Ambidiestro';

// Una fila ya convertida desde una planilla importada (Wyscout u otra),
// antes de confirmarse: el analista puede corregir cualquier campo (sobre
// todo posicion, cuando posicionNecesitaRevision viene en true) antes de
// crear los jugadores de verdad.
export interface ImportedPlayerRow {
  nombre: string;
  dorsal: number | null;
  posicion: string;
  posicionOriginal: string;
  posicionNecesitaRevision: boolean;
  edad: number | null;
  estatura: number | null;
  pie: PieHabil | null;
  sub21: boolean;
  sub18: boolean;
  extranjero: boolean | null;
}

export interface ImportPreviewResult {
  rows: ImportedPlayerRow[];
  columnasReconocidas: string[];
  columnasNoReconocidas: string[];
}

export interface Player {
  id: string;
  rivalId: string;
  nombre: string;
  dorsal: number | null;
  posicion: string;
  // Posición que ocupa cuando el equipo juega con el sistema alternativo del
  // rival (lib/formations.ts); si no está definida, se usa `posicion`.
  posicionAlternativa?: string;
  estatura: number | null;
  pie: PieHabil | null;
  sub21: boolean;
  sub18: boolean;
  extranjero: boolean;
  baja: boolean;
  // Disponibilidad incierta para el próximo partido (ej. duda física), a
  // diferencia de `baja` que es una ausencia confirmada.
  duda: boolean;
  // Convocado actualmente a una selección nacional: algunos torneos reducen
  // el mínimo de Sub-21 exigido por cada jugador en esta condición (ver
  // TorneoRegla.exencionPorSeleccionado).
  enSeleccion: boolean;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineupEntry {
  playerId: string;
  posicion: string;
  x?: number;
  y?: number;
}

export interface Substitution {
  id: string;
  minuto: number;
  jugadorSaleId: string;
  jugadorEntraId: string;
  posicionSale: string;
  posicionEntra: string;
  descripcion?: string;
  // Sistema resultante tras el cambio (de la lista de sistemas). Si está
  // vacío, se asume que la sustitución no implicó un cambio de sistema.
  sistemaResultante?: string;
  // Distribución completa de los 11 en cancha inmediatamente después de esta
  // sustitución. Si no se define, se deriva automáticamente reemplazando al
  // jugador que sale por el que entra en la misma coordenada.
  layoutResultante?: LineupEntry[];
}

// Por qué un jugador no fue citado a un partido puntual. "suspension" se
// trata distinto de las demás al proyectar el próximo XI: una suspensión ya
// cumplida no debería seguir excluyendo al jugador, a diferencia de una
// lesión o un motivo desconocido.
export type MotivoBaja = 'lesion' | 'suspension' | 'desconocido' | 'otro';

// Jugador que no fue citado a un partido puntual. Distinto del "baja" del
// perfil del jugador, que refleja su disponibilidad actual.
export interface MatchBaja {
  id: string;
  jugadorId: string;
  tipo: MotivoBaja;
  motivo?: string;
}

export type MatchEventType = 'gol_favor' | 'gol_contra' | 'amarilla' | 'roja';

export interface MatchEvent {
  id: string;
  minuto: number;
  tipo: MatchEventType;
  jugadorId?: string;
  descripcion?: string;
}

export interface MatchCsv {
  fileName: string;
  columns: string[];
  rows: Record<string, string>[];
  importedAt: string;
  excludedCategories: string[];
}

export interface Match {
  id: string;
  rivalId: string;
  fecha: string;
  oponente: string;
  condicion: 'Local' | 'Visitante';
  golesFavor: number | null;
  golesContra: number | null;
  sistema: string;
  // Sistema/formación del oponente (Match.oponente) en este partido puntual,
  // no del rival analizado. Cargado a mano, igual que `sistema`.
  sistemaOponente?: string;
  duracionMinutos: number;
  competencia: string;
  jornada: string;
  lineup: LineupEntry[];
  substitutions: Substitution[];
  events: MatchEvent[];
  // Suplentes citados (banca) que no llegaron a jugar. Junto con lineup y
  // substitutions.jugadorEntraId define el resto del plantel: quien no está
  // en ninguno de los tres no fue citado a este partido.
  banca: string[];
  bajas: MatchBaja[];
  csv: MatchCsv | null;
  notas?: string;
  // Nota táctica libre sobre este partido puntual (ajustes, lectura del DT).
  notaTactica?: string;
  // Partido que se está cargando en vivo (ver pestaña "En Vivo"): mientras
  // es true, queda excluido de las estadísticas agregadas del rival y la app
  // redirige a la pantalla de carga en vivo en vez de a la ficha normal.
  enVivo: boolean;
  // Cronómetro persistido en el servidor (no en localStorage), para que
  // cualquier usuario en cualquier dispositivo —incluso de solo lectura—
  // vea el mismo tiempo corriendo. null = todavía no se inició.
  // cronometroBaseMs acumula lo corrido en segmentos ya cerrados (pausas
  // por entretiempo); cronometroRunningSince es el inicio del segmento
  // actual (null = pausado).
  cronometroBaseMs?: number | null;
  cronometroRunningSince?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Contexto del próximo partido contra este rival, solo para la portada del
// informe (no es un partido analizado, es información editable a mano).
export interface ProximoPartido {
  competicion: string;
  instancia: string;
  fecha: string;
  estadio: string;
  condicion: 'Local' | 'Visitante' | '';
}

// Reglas de cupos (extranjeros/formativos) de un torneo puntual, para
// contrastarlas contra el XI estimado del rival en ese torneo. Cada rival
// mantiene su propia lista porque puede competir en más de un torneo con
// reglas distintas (ej. Primera B vs. Copa Chile).
export interface TorneoRegla {
  id: string;
  torneo: string;
  // Máximo de jugadores extranjeros que pueden estar en cancha a la vez. null/undefined = sin tope.
  maxExtranjeros?: number | null;
  // Suma de MINUTOS Sub-21 exigida por partido (ej. Copa Chile: 130').
  // Como un solo jugador no puede sumar eso en un partido de 90', esto en
  // la práctica exige 2+ titulares Sub-21 — el XI estimado calcula ese
  // mínimo efectivo dividiendo por la duración del partido (ver
  // minSub21Efectivo en lib/stats.ts). null/undefined = sin mínimo.
  minMinutosSub21?: number | null;
  // Cuántos MINUTOS reduce el mínimo exigido cada jugador del plantel
  // convocado a una selección nacional (ej. 15 = cada seleccionado resta
  // 15' al total de minutos Sub-21 exigidos, antes de calcular el mínimo
  // efectivo de titulares). null/undefined = sin exención.
  exencionMinutosPorSeleccionado?: number | null;
}

export interface Rival {
  id: string;
  nombre: string;
  proximoPartido?: ProximoPartido | null;
  sistemaPrincipal?: string;
  sistemaAlternativo?: string;
  entrenador?: string;
  // Récord del entrenador con este equipo cargado a mano (más allá de los
  // partidos analizados en detalle en el informe).
  entrenadorGanados?: number | null;
  entrenadorEmpatados?: number | null;
  entrenadorPerdidos?: number | null;
  // Notas de contexto sobre el plantel/DT, cargadas a mano, mostradas como
  // viñetas (una por línea) en el informe.
  notasContexto?: string;
  // Nota táctica libre sobre el XI estimado (ej. posibles intercambios de
  // posición entre dos jugadores).
  notaXI?: string;
  reglasTorneo?: TorneoRegla[];
  escudoUrl?: string;
  // Código con el que este rival aparece en la planilla de estadísticas de
  // liga importada (ver LeagueStatsImport), para ubicar su fila ahí.
  codigoLdp?: string;
  // Columnas de la planilla LDP elegidas en el modo "Personalizado" de
  // Gráficos y estadísticas, guardadas para poder mostrar ese mismo radar
  // en el Informe.
  graficoPersonalizado?: string[];
  // Id (auth.users) de quien creó este rival — siempre puede verlo, incluso
  // si después se restringe con visibleUserIds.
  createdBy?: string;
  // undefined/null = visible para todos. Una lista (incluso vacía = solo el
  // creador) restringe qué otros usuarios además del creador pueden verlo.
  visibleUserIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

// Planilla de estadísticas de toda la liga (una fila por equipo + una fila
// "PROMEDIO"), compartida entre todos los rivales — no se guarda por rival.
export interface LeagueStatsImport {
  fileName: string;
  columns: string[];
  rows: Record<string, string | number>[];
  codigoPropio?: string;
  uploadedAt: string;
}

// Planilla de estadísticas INDIVIDUALES de los jugadores de un rival
// puntual (una fila por jugador), a diferencia de LeagueStatsImport que es
// de equipos y compartida entre todos los rivales.
export interface IndividualStatsImport {
  fileName: string;
  columns: string[];
  rows: Record<string, string | number>[];
  uploadedAt: string;
}

export interface AppUser {
  id: string;
  username: string;
}

export interface RivalListItem extends Rival {
  matchCount: number;
  playerCount: number;
}

export interface RivalDetail extends Rival {
  players: Player[];
  matches: Match[];
  individualStats: IndividualStatsImport | null;
}
