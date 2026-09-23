export type PieHabil = 'Derecho' | 'Izquierdo' | 'Ambidiestro';

export interface Player {
  id: string;
  rivalId: string;
  nombre: string;
  dorsal: number | null;
  posicion: string;
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
  sistemaResultante?: string;
  layoutResultante?: LineupEntry[];
}

// Por qué un jugador no fue citado a un partido puntual. "suspension" se
// trata distinto de las demás al proyectar el próximo XI: una suspensión ya
// cumplida no debería seguir excluyendo al jugador, a diferencia de una
// lesión o un motivo desconocido.
export type MotivoBaja = 'lesion' | 'suspension' | 'desconocido' | 'otro';

export interface MatchBaja {
  id: string;
  jugadorId: string;
  tipo: MotivoBaja;
  // Detalle libre opcional (ej. "fractura de tobillo", "4ta amarilla").
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
  // Suplentes que fueron convocados (banca) pero no llegaron a jugar. Junto
  // con lineup y substitutions.jugadorEntraId define el resto del plantel:
  // quien no está en ninguno de los tres no fue citado a este partido.
  banca: string[];
  bajas: MatchBaja[];
  csv: MatchCsv | null;
  notas?: string;
  // Nota táctica libre sobre este partido puntual (ajustes, lectura del DT).
  notaTactica?: string;
  enVivo: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  maxExtranjeros?: number | null;
  minSub21?: number | null;
  exencionPorSeleccionado?: number | null;
}

export interface Rival {
  id: string;
  nombre: string;
  proximoPartido?: ProximoPartido | null;
  // Sistema/formación habitual del equipo, elegido al crear el rival (o
  // editado después): define qué 11 posiciones se muestran en el plantel.
  // El alternativo es opcional, para un plan B que también se pueda mostrar.
  sistemaPrincipal?: string;
  sistemaAlternativo?: string;
  entrenador?: string;
  // Récord del entrenador con este equipo cargado a mano (a diferencia del
  // G-E-P calculado del informe, que solo cuenta los últimos partidos
  // analizados con detalle): para reflejar toda su gestión en el club.
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
  // Ruta pública (bajo /uploads) del escudo subido, si hay uno.
  escudoUrl?: string;
  // Código con el que este rival aparece en la planilla de estadísticas de
  // liga importada (league_stats_import), para poder ubicar su fila ahí
  // (ver LeagueStatsImport). Se completa a mano porque las abreviaciones de
  // la planilla no se pueden inferir de forma confiable desde el nombre.
  codigoLdp?: string;
  // Columnas de la planilla LDP elegidas en el modo "Personalizado" de
  // Gráficos y estadísticas, guardadas para poder mostrar ese mismo radar
  // en el Informe.
  graficoPersonalizado?: string[];
  createdAt: string;
  updatedAt: string;
}

// Planilla de estadísticas de toda la liga (una fila por equipo + una fila
// "PROMEDIO"), importada desde un Excel externo. Es un dato compartido entre
// todos los rivales (no por rival), así que se guarda como un único
// registro que se reemplaza entero en cada import — mismo criterio de
// columnas dinámicas que MatchCsv, porque las métricas de la planilla no
// tienen un esquema fijo.
export interface LeagueStatsImport {
  fileName: string;
  columns: string[];
  rows: Record<string, string | number>[];
  // Código (misma columna que identifica al equipo en `rows`) que
  // corresponde al propio club, para poder graficarlo como una serie fija
  // igual que a cualquier rival.
  codigoPropio?: string;
  uploadedAt: string;
}

export interface Database {
  rivals: Rival[];
  players: Player[];
  matches: Match[];
}
