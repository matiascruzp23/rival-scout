// Crea (o recrea desde cero) un rival ficticio de demostración con todos los
// campos rellenos — plantel, partidos con XI/cambios/goles/tarjetas/bajas,
// CSV de Sportscode, planilla individual, reglas de torneo, próximo partido
// ida/vuelta y escudo — compartido SOLO con el usuario "demo" (ver
// create-user.ts --restringido). Los datos son inventados.
//
// Uso (desde server/):
//   npx tsx scripts/seed-demo-rival.ts
//
// Es idempotente: si ya existe un rival con DEMO_NOMBRE, lo borra (en
// cascada) y lo vuelve a crear.
import 'dotenv/config';
import { deflateSync } from 'node:zlib';
import { supabase, newId } from '../src/supabaseClient.js';
import { defaultCoordsFor } from '../../client/src/lib/positions.js';
import { formationSlots } from '../../client/src/lib/formations.js';

const DEMO_NOMBRE = 'Cordillera FC';
const DEMO_USERNAME = 'demo';
const ESCUDO_BUCKET = 'escudos';

// PRNG determinista, para que dos corridas generen los mismos datos.
let seed = 20260930;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

// ---------- Plantel ----------

interface PlayerSeed {
  key: string;
  nombre: string;
  dorsal: number;
  posicion: string;
  alt?: string;
  estatura: number;
  pie: 'Derecho' | 'Izquierdo' | 'Ambidiestro';
  sub21?: boolean;
  sub18?: boolean;
  extranjero?: boolean;
  baja?: boolean;
  duda?: boolean;
  enSeleccion?: boolean;
  notas?: string;
  wyscout?: string; // nombre distinto en la planilla, cruzado a mano
  wyPos: string; // código de "Posición específica" en la planilla
  pais?: string;
}

const PLANTEL: PlayerSeed[] = [
  { key: 'riquelme', nombre: 'Matías Riquelme', dorsal: 1, posicion: 'Arquero', estatura: 1.88, pie: 'Derecho', wyPos: 'GK', notas: 'Buen juego de pies, sale jugando corto con los centrales' },
  { key: 'arancibia', nombre: 'Tomás Arancibia', dorsal: 25, posicion: 'Arquero', estatura: 1.9, pie: 'Derecho', sub21: true, wyPos: 'GK' },
  { key: 'carrasco', nombre: 'Felipe Carrasco', dorsal: 2, posicion: 'Lateral derecho', alt: 'Carrilero derecho', estatura: 1.76, pie: 'Derecho', wyPos: 'RB', notas: 'Muy ofensivo, deja espacio a su espalda' },
  { key: 'bmunoz', nombre: 'Bastián Muñoz', dorsal: 22, posicion: 'Lateral derecho', estatura: 1.74, pie: 'Derecho', sub21: true, wyPos: 'RB' },
  { key: 'vergara', nombre: 'Nicolás Vergara', dorsal: 4, posicion: 'Central derecho', alt: 'Central', estatura: 1.86, pie: 'Derecho', wyPos: 'CB', notas: 'Capitán. Fuerte en el juego aéreo' },
  { key: 'paredes', nombre: 'Gonzalo Paredes', dorsal: 6, posicion: 'Central izquierdo', estatura: 1.89, pie: 'Izquierdo', extranjero: true, pais: 'Argentina', wyPos: 'CB', wyscout: 'G. Paredes Ruiz' },
  { key: 'salinas', nombre: 'Joaquín Salinas', dorsal: 3, posicion: 'Central', alt: 'Central derecho', estatura: 1.84, pie: 'Derecho', sub21: true, wyPos: 'CB' },
  { key: 'galvez', nombre: 'Rodrigo Gálvez', dorsal: 13, posicion: 'Central izquierdo', estatura: 1.85, pie: 'Izquierdo', wyPos: 'CB' },
  { key: 'fuentealba', nombre: 'Diego Fuentealba', dorsal: 15, posicion: 'Lateral izquierdo', alt: 'Carrilero izquierdo', estatura: 1.73, pie: 'Izquierdo', wyPos: 'LB' },
  { key: 'carcamo', nombre: 'Martín Cárcamo', dorsal: 17, posicion: 'Lateral izquierdo', estatura: 1.71, pie: 'Izquierdo', sub21: true, sub18: true, wyPos: 'LB', notas: 'Juvenil de proyección, suma minutos Sub-21' },
  { key: 'lagos', nombre: 'Sebastián Lagos', dorsal: 8, posicion: 'Medio centro derecho', alt: 'Volante central', estatura: 1.78, pie: 'Derecho', wyPos: 'RCMF' },
  { key: 'bravo', nombre: 'Ignacio Bravo', dorsal: 5, posicion: 'Medio centro izquierdo', alt: 'Volante central', estatura: 1.8, pie: 'Derecho', extranjero: true, pais: 'Uruguay', wyPos: 'LCMF', notas: 'Recuperador, acumula amarillas' },
  { key: 'henriquez', nombre: 'Cristóbal Henríquez', dorsal: 14, posicion: 'Volante central', estatura: 1.79, pie: 'Derecho', duda: true, wyPos: 'DMF', notas: 'Duda por sobrecarga en el aductor' },
  { key: 'olivares', nombre: 'Vicente Olivares', dorsal: 20, posicion: 'Medio centro derecho', estatura: 1.75, pie: 'Ambidiestro', sub21: true, enSeleccion: true, wyPos: 'RCMF', notas: 'Citado a la Selección Sub-20' },
  { key: 'ortuzar', nombre: 'Pablo Ortúzar', dorsal: 16, posicion: 'Volante central', estatura: 1.82, pie: 'Derecho', wyPos: 'DMF' },
  { key: 'ledesma', nombre: 'Franco Ledesma', dorsal: 10, posicion: 'Mediapunta', alt: 'Extremo derecho', estatura: 1.72, pie: 'Izquierdo', extranjero: true, pais: 'Argentina', wyPos: 'AMF', notas: 'Figura del equipo: patea los balones parados' },
  { key: 'toro', nombre: 'Benjamín Toro', dorsal: 18, posicion: 'Mediapunta', estatura: 1.77, pie: 'Derecho', wyPos: 'AMF' },
  { key: 'mansilla', nombre: 'Kevin Mansilla', dorsal: 7, posicion: 'Extremo derecho', alt: 'Extremo izquierdo', estatura: 1.7, pie: 'Izquierdo', wyPos: 'RW', notas: 'Perfil cambiado, busca el centro para rematar' },
  { key: 'poblete', nombre: 'Agustín Poblete', dorsal: 27, posicion: 'Extremo derecho', estatura: 1.69, pie: 'Derecho', sub21: true, sub18: true, wyPos: 'RW' },
  { key: 'espinoza', nombre: 'Renato Espinoza', dorsal: 11, posicion: 'Extremo izquierdo', estatura: 1.74, pie: 'Derecho', baja: true, wyPos: 'LW', notas: 'Desgarro en el isquiotibial, fuera 3 semanas' },
  { key: 'correa', nombre: 'Maximiliano Correa', dorsal: 19, posicion: 'Extremo izquierdo', estatura: 1.76, pie: 'Derecho', extranjero: true, pais: 'Colombia', wyPos: 'LW' },
  { key: 'sosa', nombre: 'Leandro Sosa', dorsal: 9, posicion: 'Delantero centro', estatura: 1.85, pie: 'Derecho', extranjero: true, pais: 'Argentina', wyPos: 'CF', notas: 'Goleador. Fuerte de espaldas y en el área' },
  { key: 'castillo', nombre: 'Álvaro Castillo', dorsal: 21, posicion: 'Delantero centro', alt: 'Segundo delantero', estatura: 1.81, pie: 'Derecho', wyPos: 'CF' },
  { key: 'erojas', nombre: 'Emiliano Rojas', dorsal: 29, posicion: 'Segundo delantero', estatura: 1.78, pie: 'Izquierdo', sub21: true, wyPos: 'SS' },
];

// ---------- Partidos ----------

type Pos = string;
interface MatchSeed {
  fecha: string;
  oponente: string;
  condicion: 'Local' | 'Visitante';
  gf: number | null;
  gc: number | null;
  sistema: string;
  sistemaOponente: string;
  competencia: string;
  jornada: string;
  notas?: string;
  notaTactica?: string;
  xi: Record<Pos, string>; // posición -> key del jugador (una posición repetida no aplica en estos sistemas)
  banca: string[];
  bajas: { key: string; tipo: 'lesion' | 'suspension' | 'desconocido' | 'otro'; motivo?: string }[];
  subs: { min: number; sale: string; entra: string; descripcion?: string; sistema?: string }[];
  events: { min: number; tipo: 'gol_favor' | 'gol_contra' | 'amarilla' | 'roja'; key?: string; descripcion?: string }[];
  csv?: boolean;
  enVivo?: { minutoPausado: number };
}

const XI_BASE: Record<Pos, string> = {
  Arquero: 'riquelme',
  'Lateral derecho': 'carrasco',
  'Central derecho': 'vergara',
  'Central izquierdo': 'paredes',
  'Lateral izquierdo': 'fuentealba',
  'Medio centro derecho': 'lagos',
  'Medio centro izquierdo': 'bravo',
  Mediapunta: 'ledesma',
  'Extremo derecho': 'mansilla',
  'Extremo izquierdo': 'espinoza',
  'Delantero centro': 'sosa',
};

const PARTIDOS: MatchSeed[] = [
  {
    fecha: '2026-08-23', oponente: 'Audax Italiano', condicion: 'Local', gf: 2, gc: 1,
    sistema: '4-2-3-1', sistemaOponente: '4-4-2', competencia: 'Liga de Primera', jornada: 'Fecha 20',
    notas: 'Partido controlado, bajó la intensidad en el segundo tiempo.',
    notaTactica: 'Salida con 4+2, Lagos baja entre centrales cuando presionan con dos puntas.',
    xi: XI_BASE,
    banca: ['arancibia', 'salinas', 'carcamo', 'ortuzar', 'poblete', 'castillo', 'erojas'],
    bajas: [{ key: 'henriquez', tipo: 'suspension', motivo: '5ª amarilla' }],
    subs: [
      { min: 64, sale: 'espinoza', entra: 'correa' },
      { min: 75, sale: 'ledesma', entra: 'toro' },
      { min: 84, sale: 'sosa', entra: 'castillo' },
    ],
    events: [
      { min: 18, tipo: 'gol_favor', key: 'sosa', descripcion: 'Cabezazo tras centro de Carrasco' },
      { min: 39, tipo: 'amarilla', key: 'bravo' },
      { min: 57, tipo: 'gol_contra', descripcion: 'Contraataque por la banda izquierda' },
      { min: 71, tipo: 'gol_favor', key: 'ledesma', descripcion: 'Tiro libre directo' },
      { min: 88, tipo: 'amarilla', key: 'vergara' },
    ],
  },
  {
    fecha: '2026-08-30', oponente: 'Huachipato', condicion: 'Visitante', gf: 0, gc: 0,
    sistema: '4-2-3-1', sistemaOponente: '4-3-3', competencia: 'Liga de Primera', jornada: 'Fecha 21',
    notas: 'Pocas llegadas de ambos lados, cancha sintética.',
    xi: { ...XI_BASE, 'Medio centro izquierdo': 'henriquez' },
    banca: ['arancibia', 'galvez', 'bmunoz', 'bravo', 'toro', 'correa', 'castillo'],
    bajas: [{ key: 'olivares', tipo: 'otro', motivo: 'Microciclo Selección Sub-20' }],
    subs: [
      { min: 60, sale: 'henriquez', entra: 'bravo' },
      { min: 70, sale: 'mansilla', entra: 'correa' },
      { min: 80, sale: 'ledesma', entra: 'castillo', descripcion: 'Pasa a doble punta', sistema: '4-4-2' },
    ],
    events: [
      { min: 44, tipo: 'amarilla', key: 'carrasco' },
      { min: 67, tipo: 'amarilla', key: 'bravo' },
    ],
  },
  {
    fecha: '2026-09-06', oponente: 'Cobresal', condicion: 'Local', gf: 3, gc: 1,
    sistema: '4-2-3-1', sistemaOponente: '5-3-2', competencia: 'Liga de Primera', jornada: 'Fecha 22',
    notas: 'Mejor partido del semestre. Presión alta efectiva los primeros 30 minutos.',
    notaTactica: 'Contra línea de 5 abren con los laterales muy altos y Ledesma flota entre líneas.',
    xi: { ...XI_BASE, 'Central izquierdo': 'galvez' },
    banca: ['arancibia', 'paredes', 'carcamo', 'henriquez', 'olivares', 'correa', 'castillo'],
    bajas: [{ key: 'ortuzar', tipo: 'lesion', motivo: 'Esguince de tobillo' }],
    subs: [
      { min: 58, sale: 'lagos', entra: 'olivares' },
      { min: 66, sale: 'espinoza', entra: 'correa', descripcion: 'Cambio de sistema para cerrar el partido', sistema: '4-4-2' },
      { min: 78, sale: 'ledesma', entra: 'castillo' },
      { min: 86, sale: 'fuentealba', entra: 'carcamo' },
    ],
    events: [
      { min: 11, tipo: 'gol_favor', key: 'mansilla', descripcion: 'Remate de media distancia' },
      { min: 27, tipo: 'gol_favor', key: 'sosa', descripcion: 'Penal' },
      { min: 52, tipo: 'gol_contra', descripcion: 'Tiro de esquina' },
      { min: 61, tipo: 'amarilla', key: 'galvez' },
      { min: 83, tipo: 'gol_favor', key: 'castillo', descripcion: 'Contraataque' },
    ],
    csv: true,
  },
  {
    fecha: '2026-09-13', oponente: "O'Higgins", condicion: 'Visitante', gf: 1, gc: 2,
    sistema: '4-4-2', sistemaOponente: '3-5-2', competencia: 'Liga de Primera', jornada: 'Fecha 23',
    notas: 'Expulsión de Bravo condicionó el segundo tiempo.',
    notaTactica: 'Probó 4-4-2 desde el inicio con Ledesma por derecha y Castillo acompañando a Sosa.',
    xi: {
      Arquero: 'riquelme', 'Lateral derecho': 'carrasco', 'Central derecho': 'vergara', 'Central izquierdo': 'paredes',
      'Lateral izquierdo': 'fuentealba', 'Extremo derecho': 'ledesma', 'Medio centro derecho': 'lagos',
      'Medio centro izquierdo': 'bravo', 'Extremo izquierdo': 'espinoza', 'Delantero centro': 'sosa', 'Segundo delantero': 'castillo',
    },
    banca: ['arancibia', 'salinas', 'bmunoz', 'henriquez', 'toro', 'correa', 'erojas'],
    bajas: [
      { key: 'olivares', tipo: 'otro', motivo: 'Selección Sub-20' },
      { key: 'ortuzar', tipo: 'lesion', motivo: 'Esguince de tobillo' },
      { key: 'mansilla', tipo: 'desconocido' },
    ],
    subs: [
      { min: 55, sale: 'castillo', entra: 'henriquez', descripcion: 'Tras la roja, se ordena 4-4-1', sistema: '4-4-1' },
      { min: 72, sale: 'espinoza', entra: 'correa' },
      { min: 80, sale: 'carrasco', entra: 'bmunoz' },
    ],
    events: [
      { min: 22, tipo: 'amarilla', key: 'bravo' },
      { min: 34, tipo: 'gol_favor', key: 'sosa', descripcion: 'Definición tras pase en profundidad de Ledesma' },
      { min: 51, tipo: 'roja', key: 'bravo', descripcion: 'Doble amarilla' },
      { min: 63, tipo: 'gol_contra', descripcion: 'Centro desde la derecha' },
      { min: 89, tipo: 'gol_contra', descripcion: 'Penal' },
      { min: 90, tipo: 'amarilla', key: 'paredes' },
    ],
    csv: true,
  },
  {
    fecha: '2026-09-20', oponente: 'Palestino', condicion: 'Local', gf: 2, gc: 2,
    sistema: '4-2-3-1', sistemaOponente: '4-2-3-1', competencia: 'Liga de Primera', jornada: 'Fecha 24',
    notas: 'Empate con gol en el descuento. Espinoza salió lesionado.',
    xi: { ...XI_BASE, 'Medio centro izquierdo': 'henriquez' },
    banca: ['arancibia', 'galvez', 'carcamo', 'ortuzar', 'toro', 'correa', 'poblete'],
    bajas: [
      { key: 'bravo', tipo: 'suspension', motivo: 'Expulsión vs O\'Higgins' },
      { key: 'olivares', tipo: 'otro', motivo: 'Selección Sub-20' },
    ],
    subs: [
      { min: 38, sale: 'espinoza', entra: 'correa', descripcion: 'Lesión' },
      { min: 68, sale: 'henriquez', entra: 'ortuzar' },
      { min: 77, sale: 'mansilla', entra: 'poblete' },
    ],
    events: [
      { min: 15, tipo: 'gol_contra', descripcion: 'Error en salida' },
      { min: 41, tipo: 'gol_favor', key: 'ledesma', descripcion: 'Remate dentro del área' },
      { min: 59, tipo: 'amarilla', key: 'henriquez' },
      { min: 74, tipo: 'gol_favor', key: 'sosa', descripcion: 'Cabezazo en tiro de esquina' },
      { min: 92, tipo: 'gol_contra', descripcion: 'Centro al segundo palo' },
    ],
    csv: true,
  },
  {
    fecha: '2026-09-24', oponente: 'Coquimbo Unido', condicion: 'Visitante', gf: 1, gc: 0,
    sistema: '4-3-3', sistemaOponente: '4-4-2', competencia: 'Copa Chile', jornada: 'Octavos de final (vuelta)',
    notas: 'Clasificó a cuartos con rotación: varios juveniles para cumplir los minutos Sub-21.',
    notaTactica: 'Con 4-3-3 Ortúzar de 5 y Lagos/Toro como internos.',
    xi: {
      Arquero: 'arancibia', 'Lateral derecho': 'bmunoz', 'Central derecho': 'salinas', 'Central izquierdo': 'galvez',
      'Lateral izquierdo': 'carcamo', 'Medio centro derecho': 'lagos', 'Volante central': 'ortuzar',
      'Medio centro izquierdo': 'toro', 'Extremo derecho': 'poblete', 'Extremo izquierdo': 'correa', 'Delantero centro': 'castillo',
    },
    banca: ['riquelme', 'vergara', 'fuentealba', 'henriquez', 'mansilla', 'ledesma', 'sosa'],
    bajas: [
      { key: 'espinoza', tipo: 'lesion', motivo: 'Desgarro isquiotibial' },
      { key: 'bravo', tipo: 'suspension' },
    ],
    subs: [
      { min: 61, sale: 'poblete', entra: 'mansilla' },
      { min: 70, sale: 'castillo', entra: 'sosa' },
      { min: 82, sale: 'toro', entra: 'erojas' },
    ],
    events: [
      { min: 49, tipo: 'gol_favor', key: 'correa', descripcion: 'Jugada individual por izquierda' },
      { min: 76, tipo: 'amarilla', key: 'salinas' },
    ],
  },
  {
    // Partido en curso (pestaña "En Vivo"), cronómetro pausado en el 67'.
    fecha: '2026-09-30', oponente: 'Deportes La Serena', condicion: 'Local', gf: null, gc: null,
    sistema: '4-2-3-1', sistemaOponente: '4-1-4-1', competencia: 'Liga de Primera', jornada: 'Fecha 25',
    xi: { ...XI_BASE, 'Medio centro izquierdo': 'bravo', 'Extremo izquierdo': 'correa' },
    banca: ['arancibia', 'galvez', 'carcamo', 'henriquez', 'toro', 'poblete', 'castillo'],
    bajas: [
      { key: 'espinoza', tipo: 'lesion', motivo: 'Desgarro isquiotibial' },
      { key: 'olivares', tipo: 'otro', motivo: 'Selección Sub-20' },
    ],
    subs: [{ min: 60, sale: 'lagos', entra: 'henriquez' }],
    events: [
      { min: 23, tipo: 'gol_favor', key: 'sosa' },
      { min: 48, tipo: 'amarilla', key: 'bravo' },
      { min: 55, tipo: 'gol_contra' },
    ],
    enVivo: { minutoPausado: 67 },
  },
];

// ---------- CSV de Sportscode ----------

const CSV_COLUMNS = [
  'Timeline', 'Start time', 'Duration', 'Row', 'Instance number', 'Acciones a balon parado', 'Distancia de salida',
  'Estructura de circulacion', 'Estructura de presion', 'RESULTADO', 'Rivales', 'Situaciones de circulacion',
  'Situaciones de presion', 'Tipos de presion en salida', 'Ungrouped', 'Notes', 'Flags',
];
const EXCLUDED = ['TRANSICION OFENSIVA', 'TRANSICION DEFENSIVA', 'DETENIDAS A FAVOR', 'DETENIDAS EN CONTRA'];

const V = {
  construccion: ['Construccion 4+1', 'Construccion 4+2', 'Construccion 4+2', 'Construccion 3+1', 'Linea de 3 con contencion', 'Linea de 3 externa con interno'],
  circBaja: ['Juego directo', 'Descenso de 9', 'Conduccion del central', 'Lateral por dentro', 'Pase entre lineas'],
  circMedia: ['Movimiento de interno a externo', 'Cambios de frente', 'Movimiento profundo', 'Wing interno', 'Pasaje del lateral', 'Descenso de 9', 'Laterales altos'],
  circAlta: ['Centro 3/4', 'Pasaje del lateral', 'Movimiento profundo', 'Movimiento de interno a externo', 'Llegada de 2da línea', 'Triangulo en banda'],
  estrPresion: ['Presionan en 4-2-3-1', 'Presionan en 4-4-2', 'Presionan en 4-4-2', 'Presionan en 4-1-3-2', 'Presionan en 4-3-3'],
  tipoPresion: ['Presiona 9-10', 'Presiona 9', 'Presiona doble 9', 'Presiona 9-7', 'No hay presión'],
  presAlta: ['Volante a banda', 'Espacio entre lineas', 'Salta 10', 'Lateral con lateral', 'Central sigue descenso', 'Libre cuadrado'],
  presMedia: ['Espacio entre lineas', 'Libre cuadrado', 'Libre lado opuesto', 'Pierde espalda', 'Espalda de la defensa'],
  presBaja: ['Pierde espalda', 'Libre lado opuesto', 'No emparejan en area', 'Espalda de la defensa', 'Espacio por fuera', 'Wing forma linea de 5'],
  fijaSit: ['Volante a banda', 'Salta 11', 'Mano a mano'],
};
// Apellidos (columna "Rivales") según fase: quién suele protagonizar las
// situaciones ofensivas y quién queda expuesto en las defensivas.
const RIVALES_OFENSIVOS = ['Ledesma', 'Ledesma', 'Mansilla', 'Mansilla', 'Carrasco', 'Sosa', 'Correa', 'Fuentealba', 'Lagos'];
const RIVALES_DEFENSIVOS = ['Vergara', 'Paredes', 'Bravo', 'Bravo', 'Carrasco', 'Fuentealba', 'Lagos', 'Henríquez'];

function tags(values: string[], max: number): string {
  const n = 1 + Math.floor(rand() * max);
  return [...new Set(Array.from({ length: n }, () => pick(values)))].join(', ');
}

function buildCsv(m: MatchSeed, siglaOponente: string): Record<string, string>[] {
  const golesMin = m.events.filter((e) => e.tipo === 'gol_favor' || e.tipo === 'gol_contra');
  const resultadoEn = (seg: number) => {
    const min = seg / 60;
    let f = 0, c = 0;
    for (const e of golesMin) if (e.min <= min) e.tipo === 'gol_favor' ? f++ : c++;
    return f > c ? 'Ganando' : f < c ? 'Perdiendo' : 'Empatando';
  };
  const plan: [string, number][] = [
    ['SALIDAS', 7], ['CIRCULACION BAJA', 6], ['CIRCULACION MEDIA', 8], ['CIRCULACION ALTA', 9],
    ['PRESION FIJA', 5], ['PRESION ALTA', 8], ['PRESION MEDIA', 6], ['PRESION BAJA', 7],
    ['TRANSICION OFENSIVA', 3], ['TRANSICION DEFENSIVA', 3], ['DETENIDAS A FAVOR', 2], ['DETENIDAS EN CONTRA', 2],
  ];
  const rows: Record<string, string>[] = [];
  for (const [cat, n] of plan) {
    for (let i = 1; i <= n; i++) {
      const start = 60 + rand() * 5340;
      const r: Record<string, string> = Object.fromEntries(CSV_COLUMNS.map((c) => [c, '']));
      r.Timeline = `COR vs ${siglaOponente}`;
      r['Start time'] = start.toFixed(3);
      r.Duration = (6 + rand() * 18).toFixed(3);
      r.Row = cat;
      r['Instance number'] = String(i);
      r.RESULTADO = resultadoEn(start);
      const conRival = rand() < 0.5;
      switch (cat) {
        case 'SALIDAS':
          r['Distancia de salida'] = rand() < 0.6 ? 'Corta' : 'Larga';
          r['Estructura de circulacion'] = pick(V.construccion.slice(0, 4));
          if (rand() < 0.6) r['Situaciones de circulacion'] = 'Juego directo';
          break;
        case 'CIRCULACION BAJA':
          r['Estructura de circulacion'] = pick(V.construccion);
          r['Situaciones de circulacion'] = tags(V.circBaja, 1);
          break;
        case 'CIRCULACION MEDIA':
          r['Estructura de circulacion'] = pick(V.construccion);
          r['Situaciones de circulacion'] = tags(V.circMedia, conRival ? 2 : 1);
          break;
        case 'CIRCULACION ALTA':
          r['Situaciones de circulacion'] = tags(V.circAlta, conRival ? 2 : 1);
          break;
        case 'PRESION FIJA':
          r['Estructura de presion'] = pick(V.estrPresion);
          r['Tipos de presion en salida'] = pick(V.tipoPresion);
          if (rand() < 0.4) r['Situaciones de presion'] = pick(V.fijaSit);
          break;
        case 'PRESION ALTA':
          r['Estructura de presion'] = pick(V.estrPresion);
          r['Situaciones de presion'] = tags(V.presAlta, conRival ? 2 : 1);
          break;
        case 'PRESION MEDIA':
          r['Situaciones de presion'] = tags(V.presMedia, conRival ? 2 : 1);
          break;
        case 'PRESION BAJA':
          r['Situaciones de presion'] = tags(V.presBaja, conRival ? 2 : 1);
          break;
      }
      if (conRival && !EXCLUDED.includes(cat) && cat !== 'SALIDAS') {
        r.Rivales = pick(cat.startsWith('CIRCULACION') ? RIVALES_OFENSIVOS : RIVALES_DEFENSIVOS);
      }
      rows.push(r);
    }
  }
  rows.sort((a, b) => Number(a['Start time']) - Number(b['Start time']));
  // Dejar una fila ambigua ya resuelta a mano, como haría el analista.
  const ambigua = rows.find((r) => r.Rivales && (r['Situaciones de circulacion'] || r['Situaciones de presion']).includes(','));
  if (ambigua) ambigua.__rivalResuelto = (ambigua['Situaciones de circulacion'] || ambigua['Situaciones de presion']).split(', ')[0];
  return rows;
}

// ---------- Escudo (PNG generado a mano) ----------

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Escudo tipo "blasón": azul oscuro con borde dorado, franja diagonal
// blanca y una montaña (cordillera) blanca abajo. Supersampling 4x4 para
// suavizar bordes.
function escudoPng(size = 256): Buffer {
  const inside = (x: number, y: number, inset: number) => {
    // Coordenadas normalizadas 0..1
    const top = 0.06 + inset, side = 0.1 + inset;
    if (y < top || x < side || x > 1 - side) return false;
    if (y < 0.55) return true;
    // Parte inferior en punta (curva)
    const t = (y - 0.55) / (0.94 - inset - 0.55);
    if (t > 1) return false;
    const half = (0.5 - side) * Math.sqrt(1 - t * t);
    return Math.abs(x - 0.5) <= half;
  };
  const color = (x: number, y: number): [number, number, number, number] => {
    if (!inside(x, y, 0)) return [0, 0, 0, 0];
    if (!inside(x, y, 0.035)) return [212, 165, 52, 255]; // dorado
    const montana = y > 0.62 - 0.28 * (1 - Math.abs(x - 0.5) * 3.2) && y > 0.4;
    if (montana && Math.abs(x - 0.5) < 0.32) return y < 0.5 ? [255, 255, 255, 255] : [60, 90, 140, 255];
    const franja = Math.abs(y - (x * 0.9 - 0.05)) < 0.06 && y < 0.5;
    if (franja) return [255, 255, 255, 255];
    return [22, 45, 92, 255];
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = color((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
          acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const a = acc[3];
      raw[o] = a ? Math.round(acc[0] / a) : 0;
      raw[o + 1] = a ? Math.round(acc[1] / a) : 0;
      raw[o + 2] = a ? Math.round(acc[2] / a) : 0;
      raw[o + 3] = Math.round(a / (S * S));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Planilla individual ----------

// Toma como molde filas reales de otras planillas importadas (misma
// estructura de 115 columnas) y las perturba ±20 %, cambiando identidad,
// para que los radares por posición tengan valores plausibles.
async function buildIndividualStats(): Promise<{ columns: string[]; rows: Record<string, string | number>[] }> {
  const { data } = await supabase.from('individual_stats_import').select('columns, rows');
  const imports = (data || []).filter((d) => (d.columns || []).length > 0);
  if (imports.length === 0) fail('No hay ninguna planilla individual importada para usar de molde');
  const columns: string[] = imports[0].columns;
  const pool = imports.flatMap((d) => d.rows as Record<string, string | number>[]).filter((r) => Number(r['Minutos jugados']) > 400);
  const porCodigo = (codigo: string) => pool.filter((r) => String(r['Posición específica'] || '').split(',')[0].trim() === codigo);
  const identidad = new Set(['Jugador', 'Equipo', 'Equipo durante el período seleccionado', 'Posición específica', 'Edad', 'Pie', 'Altura', 'País de nacimiento', 'Pasaporte', 'Vencimiento contrato', 'En prestamo', 'Valor de mercado (Transfermarkt)']);

  const rows = PLANTEL.map((p) => {
    const candidatos = porCodigo(p.wyPos);
    const molde = candidatos.length ? pick(candidatos) : pick(pool);
    const row: Record<string, string | number> = {};
    for (const col of columns) {
      const v = molde[col];
      if (identidad.has(col)) continue;
      if (typeof v === 'number') {
        const f = 0.8 + rand() * 0.4;
        const n = v * f;
        row[col] = Number.isInteger(v) ? Math.round(n) : Math.round(n * 100) / 100;
        if (col.endsWith('%') && (row[col] as number) > 100) row[col] = 100;
      } else row[col] = v ?? '';
    }
    const edad = p.sub18 ? 17 : p.sub21 ? 19 + Math.floor(rand() * 2) : 23 + Math.floor(rand() * 10);
    Object.assign(row, {
      Jugador: p.wyscout ?? p.nombre,
      Equipo: DEMO_NOMBRE,
      'Equipo durante el período seleccionado': DEMO_NOMBRE,
      'Posición específica': p.wyPos,
      Edad: edad,
      Pie: p.pie.toLowerCase(),
      Altura: Math.round(p.estatura * 100),
      'País de nacimiento': p.pais ?? 'Chile',
      Pasaporte: p.pais ?? 'Chile',
      'Vencimiento contrato': pick(['2026-12-31', '2027-06-30', '2027-12-31', '2028-12-31']),
      'En prestamo': p.key === 'correa' ? 'sí' : 'no',
      'Valor de mercado (Transfermarkt)': Math.round((150 + rand() * 1200) / 50) * 50 * 1000,
    });
    return row;
  });
  return { columns, rows };
}

// ---------- Main ----------

async function main() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const demo = users?.users.find((u) => u.email?.toLowerCase() === `${DEMO_USERNAME}@rivalscout.local`);
  if (!demo) fail(`No existe el usuario "${DEMO_USERNAME}" (crearlo con create-user.ts)`);

  // Borrar el rival demo anterior, si existe (cascada borra todo lo demás).
  const { data: previos } = await supabase.from('rivals').select('id').eq('nombre', DEMO_NOMBRE);
  for (const p of previos || []) {
    const { data: files } = await supabase.storage.from(ESCUDO_BUCKET).list('', { search: p.id });
    if (files?.length) await supabase.storage.from(ESCUDO_BUCKET).remove(files.map((f) => f.name));
    await supabase.from('rivals').delete().eq('id', p.id);
    console.log(`Borrado rival demo anterior (${p.id})`);
  }

  const { data: lg } = await supabase.from('league_stats_import').select('columns').maybeSingle();
  const lgCols: string[] = lg?.columns || [];
  const graficoPersonalizado = ['Goles', 'xG', 'Posesión del balón, %', 'Balones recuperados altos', '%Duelos aéreos ganados', 'PPDA'].filter((c) =>
    lgCols.includes(c)
  );

  const rivalId = newId();
  const ts = new Date().toISOString();
  const { error: rErr } = await supabase.from('rivals').insert({
    id: rivalId,
    nombre: DEMO_NOMBRE,
    proximo_partido_competicion: 'Copa Chile',
    proximo_partido_instancia: 'Cuartos de final',
    proximo_partido_fecha: '2026-10-15',
    proximo_partido_estadio: 'Estadio Municipal de Los Andes',
    proximo_partido_condicion: 'Visitante',
    proximo_partido_vuelta_fecha: '2026-10-22',
    proximo_partido_vuelta_estadio: 'Estadio Nacional',
    proximo_partido_vuelta_condicion: 'Local',
    sistema_principal: '4-2-3-1',
    sistema_alternativo: '4-4-2',
    entrenador: 'Rodrigo Valdés',
    entrenador_ganados: 14,
    entrenador_empatados: 8,
    entrenador_perdidos: 7,
    notas_contexto:
      'Equipo ficticio de demostración\nDT en su segunda temporada, idea de posesión y presión alta\nLedesma y Sosa concentran el 60% de los goles\nDeben sumar 130 minutos Sub-21 en Copa Chile',
    nota_xi: 'Sin Espinoza, Correa por izquierda. Si Henríquez llega, puede reemplazar a Bravo como doble pivote.',
    codigo_ldp: 'LIM',
    grafico_personalizado: graficoPersonalizado,
    created_by: null,
    visible_user_ids: [demo.id],
    created_at: ts,
    updated_at: ts,
  });
  if (rErr) fail(`Error creando rival: ${rErr.message}`);

  const { error: reglasErr } = await supabase.from('torneo_reglas').insert([
    { id: newId(), rival_id: rivalId, torneo: 'Copa Chile', max_extranjeros: 5, min_minutos_sub21: 130, exencion_minutos_por_seleccionado: 65 },
    { id: newId(), rival_id: rivalId, torneo: 'Liga de Primera', max_extranjeros: 6, min_minutos_sub21: 0, exencion_minutos_por_seleccionado: 0 },
  ]);
  if (reglasErr) fail(`Error creando reglas: ${reglasErr.message}`);

  const ids: Record<string, string> = {};
  const playerRows = PLANTEL.map((p, i) => {
    ids[p.key] = newId() + i;
    return {
      id: ids[p.key],
      rival_id: rivalId,
      nombre: p.nombre,
      dorsal: p.dorsal,
      posicion: p.posicion,
      posicion_alternativa: p.alt ?? null,
      estatura: p.estatura,
      pie: p.pie,
      sub21: !!p.sub21,
      sub18: !!p.sub18,
      extranjero: !!p.extranjero,
      baja: !!p.baja,
      duda: !!p.duda,
      en_seleccion: !!p.enSeleccion,
      notas: p.notas ?? null,
      wyscout_nombre: p.wyscout ?? null,
      created_at: new Date(Date.now() + i).toISOString(),
      updated_at: ts,
    };
  });
  const { error: pErr } = await supabase.from('players').insert(playerRows);
  if (pErr) fail(`Error creando jugadores: ${pErr.message}`);

  const siglas: Record<string, string> = { Cobresal: 'COB', "O'Higgins": 'OHI', Palestino: 'PAL' };

  for (const m of PARTIDOS) {
    const matchId = newId();
    const { error: mErr } = await supabase.from('matches').insert({
      id: matchId,
      rival_id: rivalId,
      fecha: m.fecha,
      oponente: m.oponente,
      condicion: m.condicion,
      goles_favor: m.gf,
      goles_contra: m.gc,
      sistema: m.sistema,
      sistema_oponente: m.sistemaOponente,
      duracion_minutos: m.enVivo ? 90 : m.events.some((e) => e.min > 90) ? 94 : 92,
      competencia: m.competencia,
      jornada: m.jornada,
      notas: m.notas ?? null,
      nota_tactica: m.notaTactica ?? null,
      en_vivo: !!m.enVivo,
      cronometro_base_ms: m.enVivo ? m.enVivo.minutoPausado * 60000 : null,
      cronometro_running_since: null,
      created_at: ts,
      updated_at: ts,
    });
    if (mErr) fail(`Error creando partido ${m.fecha}: ${mErr.message}`);

    // XI en el orden del sistema; coordenadas por defecto de cada posición.
    const slots = formationSlots(m.sistema) || Object.keys(m.xi);
    const lineup: { posicion: string; x: number; y: number; playerId: string }[] = [];
    for (const pos of slots) {
      const key = m.xi[pos];
      if (!key) fail(`Partido ${m.fecha}: falta ${pos} en el XI`);
      const c = defaultCoordsFor(pos, lineup);
      lineup.push({ posicion: pos, x: c.x, y: c.y, playerId: ids[key] });
    }
    await supabase.from('lineup_entries').insert(
      lineup.map((e) => ({ match_id: matchId, player_id: e.playerId, posicion: e.posicion, x: e.x, y: e.y }))
    );

    // Sustituciones: el que entra toma la posición del que sale; si hay
    // cambio de sistema, se guarda el layout resultante (con el que entra
    // adelantado como segundo punta o retrasado como volante).
    let actual = lineup.map((e) => ({ ...e }));
    const subsRows = m.subs.map((s, i) => {
      const idx = actual.findIndex((e) => e.playerId === ids[s.sale]);
      if (idx < 0) fail(`Partido ${m.fecha}: ${s.sale} no está en cancha al ${s.min}'`);
      const posSale = actual[idx].posicion;
      let posEntra = posSale;
      let layout: typeof actual | null = null;
      actual[idx] = { ...actual[idx], playerId: ids[s.entra] };
      if (s.sistema) {
        if (s.sistema === '4-4-2') {
          const mp = actual.find((e) => e.posicion === 'Mediapunta');
          if (mp) Object.assign(mp, { posicion: 'Segundo delantero', ...defaultCoordsFor('Segundo delantero', []) });
          for (const e of actual) {
            if (e.posicion === 'Medio centro derecho') Object.assign(e, defaultCoordsFor('Medio centro derecho', []));
          }
          if (posSale === 'Mediapunta') posEntra = 'Segundo delantero';
        } else if (s.sistema === '4-4-1') {
          const e = actual[idx];
          Object.assign(e, { posicion: 'Volante central', ...defaultCoordsFor('Volante central', []) });
          posEntra = 'Volante central';
        }
        layout = actual.map((e) => ({ ...e }));
      }
      return {
        id: `demo-${matchId}-s${i}`,
        match_id: matchId,
        minuto: s.min,
        jugador_sale_id: ids[s.sale],
        jugador_entra_id: ids[s.entra],
        posicion_sale: posSale,
        posicion_entra: posEntra,
        descripcion: s.descripcion ?? null,
        sistema_resultante: s.sistema ?? null,
        layout_resultante: layout,
      };
    });
    if (subsRows.length) {
      const { error } = await supabase.from('substitutions').insert(subsRows);
      if (error) fail(`Error en sustituciones ${m.fecha}: ${error.message}`);
    }

    if (m.events.length) {
      const { error } = await supabase.from('match_events').insert(
        m.events.map((e) => ({
          id: newId(),
          match_id: matchId,
          minuto: e.min,
          tipo: e.tipo,
          jugador_id: e.key ? ids[e.key] : null,
          descripcion: e.descripcion ?? null,
        }))
      );
      if (error) fail(`Error en eventos ${m.fecha}: ${error.message}`);
    }

    await supabase.from('match_banca').insert(m.banca.map((k) => ({ match_id: matchId, player_id: ids[k] })));
    if (m.bajas.length) {
      await supabase.from('match_bajas').insert(
        m.bajas.map((b) => ({ id: newId(), match_id: matchId, jugador_id: ids[b.key], tipo: b.tipo, motivo: b.motivo ?? null }))
      );
    }

    if (m.csv) {
      const sigla = siglas[m.oponente] || m.oponente.slice(0, 3).toUpperCase();
      const { error } = await supabase.from('match_csv').insert({
        match_id: matchId,
        file_name: `COR vs ${sigla} - ${m.fecha}.csv`,
        columns: CSV_COLUMNS,
        rows: buildCsv(m, sigla),
        imported_at: ts,
        excluded_categories: EXCLUDED,
      });
      if (error) fail(`Error en CSV ${m.fecha}: ${error.message}`);
    }
    console.log(`Partido ${m.fecha} vs ${m.oponente}${m.enVivo ? ' (en vivo)' : ''}`);
  }

  const ind = await buildIndividualStats();
  const { error: indErr } = await supabase.from('individual_stats_import').insert({
    rival_id: rivalId,
    file_name: 'Cordillera FC - Wyscout 2026.xlsx',
    columns: ind.columns,
    rows: ind.rows,
    uploaded_at: ts,
  });
  if (indErr) fail(`Error en planilla individual: ${indErr.message}`);

  const filename = `${rivalId}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from(ESCUDO_BUCKET)
    .upload(filename, escudoPng(), { contentType: 'image/png', upsert: true });
  if (upErr) fail(`Error subiendo escudo: ${upErr.message}`);
  const { data: pub } = supabase.storage.from(ESCUDO_BUCKET).getPublicUrl(filename);
  await supabase.from('rivals').update({ escudo_url: pub.publicUrl }).eq('id', rivalId);

  console.log(`Rival demo "${DEMO_NOMBRE}" creado (${rivalId}), visible solo para "${DEMO_USERNAME}".`);
}

main();
