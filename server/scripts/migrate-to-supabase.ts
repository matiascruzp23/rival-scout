// Migración única de server/data/db.json (+ server/data/uploads/) a
// Supabase. Correr con: npx tsx scripts/migrate-to-supabase.ts (desde
// server/), después de haber pegado server/supabase/schema.sql en el SQL
// Editor de Supabase y de tener server/.env con SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY. No modifica ni borra db.json ni los uploads.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database, Player, Match, Rival } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'db.json');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const ESCUDO_BUCKET = 'escudos';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en server/.env');
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Mismo relleno de defaults que tenía server/src/db.ts, para que registros
// guardados antes de que existieran ciertos campos no rompan la migración.
function normalize(db: Database): Database {
  db.rivals.forEach((r) => {
    if (!r.reglasTorneo) r.reglasTorneo = [];
  });
  db.players.forEach((p) => {
    if (p.dorsal === undefined) p.dorsal = null;
    if (p.estatura === undefined) p.estatura = null;
    if (p.pie === undefined) p.pie = null;
    if (p.sub18 === undefined) p.sub18 = false;
    if (p.duda === undefined) p.duda = false;
    if (p.enSeleccion === undefined) p.enSeleccion = false;
  });
  db.matches.forEach((m) => {
    if (!m.events) m.events = [];
    if (!m.substitutions) m.substitutions = [];
    if (!m.lineup) m.lineup = [];
    if (!m.bajas) m.bajas = [];
    if (!m.banca) m.banca = [];
    m.bajas.forEach((b) => {
      if (!b.tipo) b.tipo = 'otro';
    });
    if (m.competencia === undefined) m.competencia = '';
    if (m.jornada === undefined) m.jornada = '';
    if (m.sistemaOponente === undefined) m.sistemaOponente = '';
    if (m.notaTactica === undefined) m.notaTactica = '';
  });
  return db;
}

function mustNotError<T>(label: string, result: { error: unknown; data?: T }): T | undefined {
  if (result.error) {
    console.error(`✗ ${label}:`, result.error);
    process.exitCode = 1;
  }
  return result.data;
}

async function migrateRival(r: Rival) {
  const p = r.proximoPartido;
  await mustNotError(
    `rival ${r.nombre}`,
    await supabase.from('rivals').insert({
      id: r.id,
      nombre: r.nombre,
      proximo_partido_competicion: p?.competicion || null,
      proximo_partido_instancia: p?.instancia || null,
      proximo_partido_fecha: p?.fecha || null,
      proximo_partido_estadio: p?.estadio || null,
      proximo_partido_condicion: p?.condicion || null,
      sistema_principal: r.sistemaPrincipal || null,
      sistema_alternativo: r.sistemaAlternativo || null,
      entrenador: r.entrenador || null,
      entrenador_ganados: r.entrenadorGanados ?? null,
      entrenador_empatados: r.entrenadorEmpatados ?? null,
      entrenador_perdidos: r.entrenadorPerdidos ?? null,
      notas_contexto: r.notasContexto || null,
      nota_xi: r.notaXI || null,
      escudo_url: null, // se completa más abajo, tras subir el archivo a Storage
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    })
  );

  if (r.reglasTorneo && r.reglasTorneo.length > 0) {
    await mustNotError(
      `reglas de ${r.nombre}`,
      await supabase.from('torneo_reglas').insert(
        r.reglasTorneo.map((regla) => ({
          id: regla.id,
          rival_id: r.id,
          torneo: regla.torneo,
          max_extranjeros: regla.maxExtranjeros ?? null,
          min_sub21: regla.minSub21 ?? null,
          exencion_por_seleccionado: regla.exencionPorSeleccionado ?? null,
        }))
      )
    );
  }
}

async function migratePlayer(p: Player) {
  await mustNotError(
    `jugador ${p.nombre}`,
    await supabase.from('players').insert({
      id: p.id,
      rival_id: p.rivalId,
      nombre: p.nombre,
      dorsal: p.dorsal,
      posicion: p.posicion,
      posicion_alternativa: p.posicionAlternativa || null,
      estatura: p.estatura,
      pie: p.pie,
      sub21: p.sub21,
      sub18: p.sub18,
      extranjero: p.extranjero,
      baja: p.baja,
      duda: p.duda,
      en_seleccion: p.enSeleccion,
      notas: p.notas || null,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })
  );
}

async function migrateMatch(m: Match) {
  await mustNotError(
    `partido ${m.oponente} (${m.fecha})`,
    await supabase.from('matches').insert({
      id: m.id,
      rival_id: m.rivalId,
      fecha: m.fecha,
      oponente: m.oponente,
      condicion: m.condicion,
      goles_favor: m.golesFavor,
      goles_contra: m.golesContra,
      sistema: m.sistema,
      sistema_oponente: m.sistemaOponente || null,
      duracion_minutos: m.duracionMinutos,
      competencia: m.competencia,
      jornada: m.jornada,
      notas: m.notas || null,
      nota_tactica: m.notaTactica || null,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    })
  );

  if (m.lineup.length > 0) {
    await mustNotError(
      `alineación de ${m.oponente}`,
      await supabase
        .from('lineup_entries')
        .insert(m.lineup.map((l) => ({ match_id: m.id, player_id: l.playerId, posicion: l.posicion, x: l.x ?? null, y: l.y ?? null })))
    );
  }
  if (m.substitutions.length > 0) {
    await mustNotError(
      `sustituciones de ${m.oponente}`,
      await supabase.from('substitutions').insert(
        m.substitutions.map((s) => ({
          id: s.id,
          match_id: m.id,
          minuto: s.minuto,
          jugador_sale_id: s.jugadorSaleId,
          jugador_entra_id: s.jugadorEntraId,
          posicion_sale: s.posicionSale,
          posicion_entra: s.posicionEntra,
          descripcion: s.descripcion || null,
          sistema_resultante: s.sistemaResultante || null,
          layout_resultante: s.layoutResultante || null,
        }))
      )
    );
  }
  if (m.events.length > 0) {
    await mustNotError(
      `eventos de ${m.oponente}`,
      await supabase.from('match_events').insert(
        m.events.map((e) => ({
          id: e.id,
          match_id: m.id,
          minuto: e.minuto,
          tipo: e.tipo,
          jugador_id: e.jugadorId || null,
          descripcion: e.descripcion || null,
        }))
      )
    );
  }
  if (m.banca.length > 0) {
    await mustNotError(
      `banca de ${m.oponente}`,
      await supabase.from('match_banca').insert(m.banca.map((playerId) => ({ match_id: m.id, player_id: playerId })))
    );
  }
  if (m.bajas.length > 0) {
    await mustNotError(
      `bajas de ${m.oponente}`,
      await supabase.from('match_bajas').insert(
        m.bajas.map((b) => ({ id: b.id, match_id: m.id, jugador_id: b.jugadorId, tipo: b.tipo, motivo: b.motivo || null }))
      )
    );
  }
  if (m.csv) {
    await mustNotError(
      `csv de ${m.oponente}`,
      await supabase.from('match_csv').insert({
        match_id: m.id,
        file_name: m.csv.fileName,
        columns: m.csv.columns,
        rows: m.csv.rows,
        imported_at: m.csv.importedAt,
        excluded_categories: m.csv.excludedCategories,
      })
    );
  }
}

async function migrateEscudos(rivals: Rival[]) {
  if (!existsSync(UPLOADS_DIR)) return;
  const files = readdirSync(UPLOADS_DIR);
  for (const rival of rivals) {
    const file = files.find((f) => f.startsWith(`${rival.id}-`));
    if (!file) continue;
    const buffer = readFileSync(join(UPLOADS_DIR, file));
    const ext = file.split('.').pop() || 'png';
    const contentType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
    const { error: uploadError } = await supabase.storage.from(ESCUDO_BUCKET).upload(file, buffer, { contentType, upsert: true });
    if (uploadError) {
      console.error(`✗ escudo de ${rival.nombre}:`, uploadError);
      process.exitCode = 1;
      continue;
    }
    const { data: pub } = supabase.storage.from(ESCUDO_BUCKET).getPublicUrl(file);
    await mustNotError(
      `escudo_url de ${rival.nombre}`,
      await supabase.from('rivals').update({ escudo_url: pub.publicUrl }).eq('id', rival.id)
    );
  }
}

async function main() {
  const raw = readFileSync(DB_PATH, 'utf-8');
  const db = normalize(JSON.parse(raw) as Database);

  console.log(`Migrando ${db.rivals.length} rivales, ${db.players.length} jugadores, ${db.matches.length} partidos…`);

  for (const rival of db.rivals) await migrateRival(rival);
  for (const player of db.players) await migratePlayer(player);
  for (const match of db.matches) await migrateMatch(match);
  await migrateEscudos(db.rivals);

  console.log('Listo.');
  if (process.exitCode) console.log('Hubo errores — revisa los mensajes de arriba antes de confiar en la migración.');
}

main();
