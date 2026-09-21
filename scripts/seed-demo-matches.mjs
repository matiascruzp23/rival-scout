// Script puntual para poblar el rival "Everton" con 2 partidos adicionales de
// ejemplo (datos aleatorios/plausibles) usando la API local, para poder
// revisar goles, tarjetas y sustituciones con más volumen de datos.
// Uso: node scripts/seed-demo-matches.mjs  (con el servidor corriendo en :3001)

const API = 'http://localhost:3001/api';

async function req(path, options) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

const rivals = await req('/rivals');
const rival = rivals.find((r) => r.nombre === 'Everton');
if (!rival) throw new Error('No se encontró el rival "Everton"');

const players = await req(`/rivals/${rival.id}/players`);
const byName = Object.fromEntries(players.map((p) => [p.nombre, p.id]));
const id = (name) => {
  if (!byName[name]) throw new Error(`Jugador no encontrado: ${name}`);
  return byName[name];
};

async function createMatch({ fecha, oponente, condicion, golesFavor, golesContra, sistema, lineup, substitutions, events }) {
  const match = await req(`/rivals/${rival.id}/matches`, {
    method: 'POST',
    body: JSON.stringify({ fecha, oponente, condicion, golesFavor, golesContra, sistema, duracionMinutos: 90 }),
  });
  await req(`/matches/${match.id}`, { method: 'PUT', body: JSON.stringify({ lineup, substitutions, events }) });
  console.log(`Creado partido ${fecha} vs ${oponente} (${match.id})`);
}

await createMatch({
  fecha: '2026-08-22',
  oponente: 'Palestino',
  condicion: 'Visitante',
  golesFavor: 2,
  golesContra: 1,
  sistema: '4-3-3',
  lineup: [
    { playerId: id('Ignacio González'), posicion: 'Arquero' },
    { playerId: id('Lucas Soto'), posicion: 'Lateral derecho' },
    { playerId: id('Valentín Vidal'), posicion: 'Central' },
    { playerId: id('Diego Oyarzún'), posicion: 'Central' },
    { playerId: id('Vicente Fernández'), posicion: 'Lateral izquierdo' },
    { playerId: id('Benjamín Berríos'), posicion: 'Volante central' },
    { playerId: id('Gustavo Charrupí'), posicion: 'Volante central' },
    { playerId: id('Braian Martínez'), posicion: 'Extremo izquierdo' },
    { playerId: id('Josué Ovalle'), posicion: 'Extremo derecho' },
    { playerId: id('Alan Medina'), posicion: 'Mediapunta' },
    { playerId: id('Cristián Palacios'), posicion: 'Delantero' },
  ],
  substitutions: [
    {
      id: 'seed-p2-s1',
      minuto: 60,
      jugadorSaleId: id('Cristián Palacios'),
      jugadorEntraId: id('Nicolás Montiel'),
      posicionSale: 'Delantero',
      posicionEntra: 'Delantero',
      cambioTactico: false,
    },
    {
      id: 'seed-p2-s2',
      minuto: 60,
      jugadorSaleId: id('Gustavo Charrupí'),
      jugadorEntraId: id('Joaquín Moya'),
      posicionSale: 'Volante central',
      posicionEntra: 'Volante central',
      cambioTactico: true,
      sistemaResultante: '4-2-3-1',
      descripcion: 'Refuerza el mediocampo tras quedar en desventaja',
    },
    {
      id: 'seed-p2-s3',
      minuto: 75,
      jugadorSaleId: id('Josué Ovalle'),
      jugadorEntraId: id('Julián Alfaro'),
      posicionSale: 'Extremo derecho',
      posicionEntra: 'Extremo derecho',
      cambioTactico: false,
    },
  ],
  events: [
    {
      id: 'seed-p2-e1',
      minuto: 12,
      tipo: 'gol_favor',
      jugadorId: id('Alan Medina'),
      asistenciaId: id('Benjamín Berríos'),
      descripcion: 'Remate de media distancia',
    },
    {
      id: 'seed-p2-e2',
      minuto: 35,
      tipo: 'roja',
      jugadorId: id('Vicente Fernández'),
      descripcion: 'Doble amarilla',
    },
    { id: 'seed-p2-e3', minuto: 50, tipo: 'gol_contra' },
    { id: 'seed-p2-e4', minuto: 70, tipo: 'amarilla', jugadorId: id('Joaquín Moya') },
    {
      id: 'seed-p2-e5',
      minuto: 88,
      tipo: 'gol_favor',
      jugadorId: id('Nicolás Montiel'),
      asistenciaId: id('Julián Alfaro'),
      descripcion: 'Contragolpe',
    },
  ],
});

await createMatch({
  fecha: '2026-09-12',
  oponente: 'Ñublense',
  condicion: 'Local',
  golesFavor: 1,
  golesContra: 1,
  sistema: '4-3-3',
  lineup: [
    { playerId: id('Ignacio González'), posicion: 'Arquero' },
    { playerId: id('Lucas Soto'), posicion: 'Lateral derecho' },
    { playerId: id('Diego Oyarzún'), posicion: 'Central' },
    { playerId: id('Valentín Vidal'), posicion: 'Central' },
    { playerId: id('Nicolás Baeza'), posicion: 'Lateral izquierdo' },
    { playerId: id('Joaquín Moya'), posicion: 'Volante central' },
    { playerId: id('Gustavo Charrupí'), posicion: 'Volante central' },
    { playerId: id('Julián Alfaro'), posicion: 'Extremo derecho' },
    { playerId: id('Braian Martínez'), posicion: 'Extremo izquierdo' },
    { playerId: id('Alan Medina'), posicion: 'Mediapunta' },
    { playerId: id('Nicolás Montiel'), posicion: 'Delantero' },
  ],
  substitutions: [
    {
      id: 'seed-p3-s1',
      minuto: 46,
      jugadorSaleId: id('Braian Martínez'),
      jugadorEntraId: id('Emiliano Ramos'),
      posicionSale: 'Extremo izquierdo',
      posicionEntra: 'Extremo izquierdo',
      cambioTactico: false,
    },
    {
      id: 'seed-p3-s2',
      minuto: 65,
      jugadorSaleId: id('Nicolás Montiel'),
      jugadorEntraId: id('Cristián Palacios'),
      posicionSale: 'Delantero',
      posicionEntra: 'Delantero',
      cambioTactico: true,
      sistemaResultante: '4-2-3-1',
      descripcion: 'Palacios da más referencia en el área',
    },
    {
      id: 'seed-p3-s3',
      minuto: 65,
      jugadorSaleId: id('Joaquín Moya'),
      jugadorEntraId: id('Benjamín Berríos'),
      posicionSale: 'Volante central',
      posicionEntra: 'Volante central',
      cambioTactico: false,
    },
    {
      id: 'seed-p3-s4',
      minuto: 80,
      jugadorSaleId: id('Julián Alfaro'),
      jugadorEntraId: id('Josué Ovalle'),
      posicionSale: 'Extremo derecho',
      posicionEntra: 'Extremo derecho',
      cambioTactico: false,
    },
  ],
  events: [
    {
      id: 'seed-p3-e1',
      minuto: 8,
      tipo: 'gol_favor',
      jugadorId: id('Nicolás Montiel'),
      asistenciaId: id('Alan Medina'),
      descripcion: 'Cabezazo tras córner',
    },
    { id: 'seed-p3-e2', minuto: 30, tipo: 'amarilla', jugadorId: id('Valentín Vidal') },
    { id: 'seed-p3-e3', minuto: 58, tipo: 'amarilla', jugadorId: id('Diego Oyarzún') },
    {
      id: 'seed-p3-e4',
      minuto: 77,
      tipo: 'roja',
      jugadorId: id('Benjamín Berríos'),
      descripcion: 'Entrada fuerte, doble amarilla',
    },
    { id: 'seed-p3-e5', minuto: 90, tipo: 'gol_contra' },
  ],
});

console.log('Listo.');
