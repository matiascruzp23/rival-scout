export type PieHabil = 'Derecho' | 'Izquierdo' | 'Ambidiestro';

// Una fila ya convertida desde una planilla importada (Wyscout u otra),
// antes de confirmarse: el analista puede corregir cualquier campo (sobre
// todo posicion, cuando posicionNecesitaRevision viene en true) antes de
// crear los jugadores de verdad.
export interface ImportedPlayerRow {
  nombre: string;
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
  // Mínimo de jugadores Sub-21 que deben estar en cancha. null/undefined = sin mínimo.
  minSub21?: number | null;
  // Cuánto reduce el mínimo de Sub-21 cada jugador del plantel convocado a
  // una selección nacional (ej. 1 = cada seleccionado resta 1 cupo exigido).
  // null/undefined = sin exención.
  exencionPorSeleccionado?: number | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface RivalListItem extends Rival {
  matchCount: number;
  playerCount: number;
}

export interface RivalDetail extends Rival {
  players: Player[];
  matches: Match[];
}
